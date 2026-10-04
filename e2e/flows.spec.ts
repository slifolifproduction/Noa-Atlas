import { expect, test } from '@playwright/test';
import { firstVisit, restingNode, storedAtlas, watchErrors, writeNote } from './helpers';

test('a note is saved and shows in Time', async ({ page }) => {
  const errors = watchErrors(page);
  await firstVisit(page);
  const text = `Walked to the river before work, e2e ${Date.now()}`;
  await writeNote(page, text);
  await expect(page.locator('#main')).toContainText(text.slice(0, 30));
  // Still there after a reload: it was saved, not only shown.
  await page.reload();
  await expect(page.locator('#main')).toContainText(text.slice(0, 30));
  expect(errors).toEqual([]);
});

test('a target ticked on the plan is saved', async ({ page }) => {
  await firstVisit(page, 'en', 'navigation');
  const done = async () => {
    const nav = (await storedAtlas(page)).state.data as unknown as { navigation: { targets: { done?: boolean }[] } };
    return nav.navigation.targets.filter((t) => t.done).length;
  };
  const before = await done();
  const tick = page.locator('[role=checkbox][aria-checked=false]').first();
  const name = await tick.getAttribute('aria-label');
  await tick.click();
  await expect(page.getByRole('checkbox', { name: name! }).first()).toHaveAttribute('aria-checked', 'true');
  await expect.poll(done).toBeGreaterThan(before);
});

test('the panel opens on a map element and closes with Escape', async ({ page, isMobile }) => {
  test.skip(isMobile, 'on a phone the map shows the areas only; their panel is opened from the list');
  await firstVisit(page);
  await (await restingNode(page)).click({ force: true });
  const close = page.getByRole('button', { name: /Close panel/ });
  await expect(close).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(close).toBeHidden();
});

test('the agent answers on this device', async ({ page }) => {
  await firstVisit(page, 'en', 'timeline');
  await page.keyboard.press('a');
  const box = page.getByRole('textbox', { name: 'Message to the agent' });
  await expect(box).toBeVisible();
  await box.fill('Summarise this week');
  await page.keyboard.press('Enter');
  await expect
    .poll(() =>
      page.evaluate(() => {
        const saved = JSON.parse(localStorage.getItem('cognitive-atlas:agent') ?? '{"state":{"messages":[]}}');
        return (saved.state.messages as { role: string; text: string }[]).filter((m) => m.role === 'agent' && m.text.trim()).length;
      }),
    )
    .toBeGreaterThan(0);
});

test('outside claude.ai, the agent says how Claude can answer here, and where else it can', async ({ page }) => {
  await firstVisit(page, 'en', 'timeline');
  await page.keyboard.press('a');
  const panel = page.getByRole('complementary', { name: 'Atlas agent' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Claude answers here once you add your own Anthropic API key')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Add your key' })).toHaveAttribute('href', '#/settings/claude');
  await expect(panel.getByRole('link', { name: 'Open in claude.ai' })).toHaveAttribute('href', /^https:\/\/claude\.ai\/artifact\//);
  await expect(panel.getByRole('option', { name: 'Claude' })).toBeDisabled();
});

test('Claude chosen in claude.ai, then opened elsewhere: said before anything is sent, and one tap back', async ({ page }) => {
  await firstVisit(page, 'en', 'timeline');
  await page.evaluate(() => localStorage.setItem('cognitive-atlas:agent', JSON.stringify({ state: { mode: 'claude', messages: [] }, version: 0 })));
  await page.reload();
  // A key pressed before the page is ready goes nowhere.
  await expect(page.locator('#main')).toContainText(/\w{3}/);
  await page.keyboard.press('a');
  const panel = page.getByRole('complementary', { name: 'Atlas agent' });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('note')).toContainText('Claude answers here once you add your own Anthropic API key');
  await expect(panel.getByText('Claude, not available here')).toBeVisible();
  await panel.getByRole('button', { name: 'Let the agent on this device answer' }).click();
  await expect(panel.getByText('The agent on this device')).toBeVisible();
  await expect(panel.getByLabel('Who answers')).toHaveValue('auto');
  await expect(panel.getByRole('note')).toHaveCount(0);
});

test('opened on claude.ai as a page of its own: said as that, not as signed out', async ({ page }) => {
  // What claude.ai serves on the artifact's own address, unframed: a runtime that lends the page nothing.
  await page.addInitScript(() => {
    (window as unknown as { claude: unknown }).claude = { use: () => Promise.resolve(null) };
  });
  await firstVisit(page, 'en', 'settings');
  await expect(page.getByText('Opened as a page of its own, it cannot reach your claude.ai account.')).toBeVisible();
  await page.keyboard.press('a');
  const panel = page.getByRole('complementary', { name: 'Atlas agent' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Opened as a page of its own, the Atlas cannot ask Claude')).toBeVisible();
  await expect(panel.getByRole('link', { name: 'Open in claude.ai' })).toBeVisible();
});

test('a strike on Quests sends a beam to its part on the eye, and the eye takes the hit', async ({ page, isMobile }) => {
  const errors = watchErrors(page);
  await firstVisit(page, 'en', 'quests');
  await expect(page.locator('.quest-rig')).toHaveAttribute('data-arrived', '', { timeout: 15_000 });
  const strike = page.getByRole('button', { name: 'Strike' }).first();
  await expect(strike).toBeVisible();
  await strike.click();
  await expect(page.getByText(/^Hit: /)).toBeVisible();
  // A beam is fired only from the list over the stage (a wide screen); the spoke it hits flares on the eye.
  if (!isMobile) {
    await expect(page.locator('.quest-beams line').first()).toBeAttached();
    await expect(page.locator('.boss-eye .eye-flare')).toBeAttached();
    // And both are gone once spent.
    await expect(page.locator('.quest-beams line')).toHaveCount(0, { timeout: 5_000 });
    await expect(page.locator('.boss-eye .eye-flare')).toHaveCount(0, { timeout: 5_000 });
  }
  expect(errors).toEqual([]);
});
