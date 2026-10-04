import { readFile } from 'node:fs/promises';
import { expect, test, type Request, type Route } from '@playwright/test';
import { firstVisit, watchErrors } from './helpers';

const KEY = 'sk-ant-e2e-0000-not-a-real-key-WXYZ';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS' };

/** One streamed reply of the Messages API, as server-sent events. */
function stream(blocks: ({ text: string } | { tool: { id: string; name: string; input: unknown } })[], stop: string): string {
  const events: [string, unknown][] = [
    [
      'message_start',
      {
        type: 'message_start',
        message: {
          id: 'msg_e2e',
          type: 'message',
          role: 'assistant',
          model: 'claude-opus-5-5',
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 9, output_tokens: 1 },
        },
      },
    ],
  ];
  blocks.forEach((b, index) => {
    if ('text' in b) {
      events.push(['content_block_start', { type: 'content_block_start', index, content_block: { type: 'text', text: '' } }]);
      for (const piece of b.text.split(/(?<= )/))
        events.push(['content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: piece } }]);
    } else {
      events.push([
        'content_block_start',
        { type: 'content_block_start', index, content_block: { type: 'tool_use', id: b.tool.id, name: b.tool.name, input: {} } },
      ]);
      events.push([
        'content_block_delta',
        { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(b.tool.input) } },
      ]);
    }
    events.push(['content_block_stop', { type: 'content_block_stop', index }]);
  });
  events.push(['message_delta', { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: 12 } }]);
  events.push(['message_stop', { type: 'message_stop' }]);
  return events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join('');
}

test('outside claude.ai, Claude answers with the person’s own API key, which never leaves with the atlas', async ({ page }) => {
  const errors = watchErrors(page);
  const asked: { headers: Record<string, string>; body: { model: string; tools?: { name: string }[]; messages: { role: string; content: unknown }[] } }[] = [];
  const checked: Request[] = [];
  // Anthropic's API, stood in for: the key's check, then a turn that searches the notes before it answers.
  await page.route('https://api.anthropic.com/**', async (route: Route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (request.url().includes('/v1/models/')) {
      checked.push(request);
      return route.fulfill({
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'model', id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5', created_at: '2026-01-01T00:00:00Z' }),
      });
    }
    asked.push({ headers: await request.allHeaders(), body: request.postDataJSON() });
    const body =
      asked.length === 1
        ? stream([{ text: 'Let me look. ' }, { tool: { id: 'toolu_e2e', name: 'search_notes', input: { query: 'sleep' } } }], 'tool_use')
        : stream([{ text: 'From your notes: you slept badly before the long days.' }], 'end_turn');
    return route.fulfill({ headers: { ...CORS, 'content-type': 'text/event-stream' }, body });
  });

  await firstVisit(page, 'en', 'settings');
  const block = page.locator('#claude');
  await expect(block.getByRole('heading', { name: 'Claude, with your own key' })).toBeVisible();

  // Something that is not a key is caught before anything is sent.
  await block.getByLabel('Your Anthropic API key').fill('hello');
  await block.getByRole('button', { name: 'Save and check' }).click();
  await expect(block.getByRole('status')).toContainText('starts with sk-ant-');
  expect(checked).toHaveLength(0);

  await block.getByLabel('Your Anthropic API key').fill(KEY);
  await block.getByRole('button', { name: 'Save and check' }).click();
  await expect(block.getByRole('status')).toHaveText('The key works. Claude can answer here now.');
  await expect(block.getByText('sk-ant-…WXYZ')).toBeVisible();
  expect(checked[0].headers()['x-api-key']).toBe(KEY);

  // The agent, on Auto, now answers with Claude: the tool it asked for runs here, and its result goes back.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('a');
  const panel = page.getByRole('complementary', { name: 'Atlas agent' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Claude, with your API key')).toBeVisible();
  await panel.getByRole('textbox', { name: 'Message to the agent' }).fill('Why am I so tired lately?');
  await page.keyboard.press('Enter');
  await expect(panel).toContainText('From your notes: you slept badly before the long days.');
  await expect(panel).toContainText('Let me look.');

  expect(asked).toHaveLength(2);
  expect(asked[0].headers['x-api-key']).toBe(KEY);
  expect(asked[0].headers['anthropic-dangerous-direct-browser-access']).toBe('true');
  expect(asked[0].body.model).toBe('claude-opus-5-5');
  expect(asked[0].body.tools?.map((t) => t.name)).toContain('search_notes');
  const [, reply, results] = asked[1].body.messages;
  expect(reply.role).toBe('assistant');
  expect(results).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_e2e' }] });

  // The key is kept apart from the atlas: not in what is saved, nor in an export.
  const saved = await page.evaluate(() => localStorage.getItem('cognitive-atlas:data') ?? '');
  expect(saved).not.toContain(KEY);
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export JSON' }).click()]);
  const exported = await readFile((await download.path())!, 'utf8');
  expect(exported).toContain('"app": "noa-atlas"');
  expect(exported).not.toContain(KEY);

  // Removed, it is gone from the browser, and the agent on this device answers again.
  await block.getByRole('button', { name: 'Remove the key' }).click();
  await block.getByRole('button', { name: 'Remove it' }).click();
  await expect(block.getByLabel('Your Anthropic API key')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('cognitive-atlas:claude-key'))).toBeNull();
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('a');
  await expect(panel.getByText('The agent on this device')).toBeVisible();
  expect(errors).toEqual([]);
});

test('a key that is not accepted is said so, and not kept', async ({ page }) => {
  await page.route('https://api.anthropic.com/**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          status: 401,
          headers: { ...CORS, 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }),
        }),
  );
  await firstVisit(page, 'en', 'timeline');
  await page.keyboard.press('a');
  // From the agent's link to Settings, the field ready to type in.
  await page.getByRole('complementary', { name: 'Atlas agent' }).getByRole('link', { name: 'Add your key' }).click();
  const block = page.locator('#claude');
  await expect(block.getByLabel('Your Anthropic API key')).toBeFocused();
  await page.keyboard.type(KEY);
  await page.keyboard.press('Enter');
  await expect(block.getByRole('status')).toHaveText('Your API key was not accepted. Check it in Settings.');
  expect(await page.evaluate(() => localStorage.getItem('cognitive-atlas:claude-key'))).toBeNull();
});
