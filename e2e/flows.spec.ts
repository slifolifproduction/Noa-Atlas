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
