import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { closeWelcome, DATA, firstVisit, stored, writeNote } from './helpers';

// About the browser's storage, the same on any screen: on the desktop only.
test.beforeEach(({ isMobile }) => test.skip(isMobile, 'storage is the same on a phone'));

test('two tabs: neither writes over what the other added, and each shows all of it', async ({ context, page }) => {
  await firstVisit(page);
  const other = await context.newPage();
  await other.goto('/#/timeline');
  await expect(other.locator('#main')).toContainText(/\w{3}/);
  const notes = ['NOTE-A walked in the park', 'NOTE-B coffee with Laura', 'NOTE-A2 read a book', 'NOTE-B2 went running'];
  await writeNote(page, notes[0]);
  await writeNote(other, notes[1]);
  await writeNote(page, notes[2]);
  await writeNote(other, notes[3]);
  const saved = await stored(page);
  for (const n of notes) expect(saved, n).toContain(n);
  for (const tab of [page, other]) {
    await tab.bringToFront();
    for (const n of notes) await expect(tab.locator('#main')).toContainText(n);
  }
});

test('an atlas that cannot be read is put aside, offered as a download, and kept after a new save', async ({ page }) => {
  await firstVisit(page);
  await page.evaluate((key) => localStorage.setItem(key, '{"state":{"data":{"entries":{"e1":{"title":"MY PRECIOUS NOTE"'), DATA);
  await page.reload();
  await expect(page.getByRole('alert').first()).toContainText('could not be read');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the unreadable copy' }).click()]);
  expect(await readFile((await download.path())!, 'utf8')).toContain('MY PRECIOUS NOTE');
  await writeNote(page, 'A new note after the trouble');
  expect(await page.evaluate((key) => localStorage.getItem(`${key}:unreadable`), DATA)).toContain('MY PRECIOUS NOTE');
});

test('a full browser is said, with a copy that holds what was not saved, until there is room again', async ({ page }) => {
  await firstVisit(page);
  await page.evaluate(() => {
    for (const [prefix, size, n] of [
      ['junk', 250_000, 200],
      ['fill', 20_000, 400],
      ['tiny', 500, 400],
    ] as const)
      for (let i = 0; i < n; i++)
        try {
          localStorage.setItem(prefix + i, 'x'.repeat(size));
        } catch {
          break;
        }
  });
  const note = 'A long note when the browser is full ' + 'and more words '.repeat(200);
  await page.goto('/#/timeline');
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog').locator('textarea, input').first()).toBeFocused();
  await page.keyboard.type(note);
  await page.keyboard.press('Control+Enter');
  await expect(page.getByRole('alert').first()).toContainText('not saving your atlas');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a copy' }).click()]);
  expect(await readFile((await download.path())!, 'utf8')).toContain('A long note when the browser is full');
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) if (/^(junk|fill|tiny)/.test(k)) localStorage.removeItem(k);
  });
  await writeNote(page, 'room again');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('a page that fails to draw gives way alone, and the Map is a click away', async ({ context, page }) => {
  // The Time page, made to throw as it draws.
  await context.route(/TimelinePage-[\w-]+\.js$/, async (route) => {
    const response = await route.fetch();
    const body = (await response.text()).replace(
      /export\{(\w+) as TimelinePage\};?\s*$/,
      'const __Crash=()=>{throw new Error("e2e: the Time page failed to draw")};export{__Crash as TimelinePage};',
    );
    await route.fulfill({ response, body });
  });
  await page.addInitScript(() => {
    if (sessionStorage.getItem('e2e')) return;
    sessionStorage.setItem('e2e', '1');
    localStorage.clear();
    localStorage.setItem('cognitive-atlas:lang', 'en');
  });
  await page.goto('/#/orbit');
  await closeWelcome(page);
  await page.goto('/#/timeline');
  await expect(page.getByRole('alert').first()).toContainText('Something went wrong drawing this page');
  await expect(page.locator('header').first()).toBeVisible();
  await page.getByRole('button', { name: 'Go to the Map' }).click();
  await expect(page).toHaveURL(/#\/orbit/);
  await expect(page.getByRole('alert')).toHaveCount(0);
});
