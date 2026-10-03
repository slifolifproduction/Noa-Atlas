import { expect, test } from '@playwright/test';
import { DATA, firstVisit, storedAtlas, watchChunks, watchErrors } from './helpers';

// About what is fetched and when: the same on any screen, so on the desktop only.
test.beforeEach(({ isMobile }) => test.skip(isMobile, 'loading is the same on a phone'));

const OTHERS = /^(accountant|manager|director|producer|data|programmer|student|seed)$/;

test('a first visit opens Emma in its language and fetches no other example', async ({ page }) => {
  const chunks = watchChunks(page);
  await firstVisit(page);
  const saved = await storedAtlas(page);
  expect(saved.state.data.profile).toMatchObject({ name: 'Emma Collins', example: 'designer', exampleLang: 'en' });
  expect([...chunks].filter((c) => OTHERS.test(c))).toEqual([]);
});

test('another example is fetched when opened, follows the language, and is read again after a reload', async ({ page }) => {
  const errors = watchErrors(page);
  const chunks = watchChunks(page);
  await firstVisit(page);
  await page
    .getByRole('button', { name: /^Other examples$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('label').filter({ hasText: 'Accountant' }).first().click();
  await dialog.getByRole('button', { name: /^Start fresh$/ }).click();
  await expect.poll(async () => (await storedAtlas(page)).state.data.profile.name).toBe('Daniel Reed');
  expect(chunks.has('accountant')).toBe(true);

  // In Indonesian: the example, untouched, is reopened in Indonesian.
  await page.evaluate(() => localStorage.setItem('cognitive-atlas:lang', 'id'));
  await page.reload();
  await expect.poll(async () => (await storedAtlas(page)).state.data.profile.exampleLang).toBe('id');
  expect((await storedAtlas(page)).state.data.profile.name).toBe('Daniel Reed');
  await expect(page.locator('#main')).toContainText(/\w{3}/);
  expect(errors).toEqual([]);
});

test('an example saved by an earlier version is brought up to date once its words are fetched', async ({ page }) => {
  await firstVisit(page);
  await page
    .getByRole('button', { name: /^Other examples$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('label').filter({ hasText: 'Accountant' }).first().click();
  await dialog.getByRole('button', { name: /^Start fresh$/ }).click();
  await expect.poll(async () => (await storedAtlas(page)).state.data.profile.name).toBe('Daniel Reed');
  // As version 6 kept it: the example's person under an older name.
  await page.evaluate((key) => {
    const s = JSON.parse(localStorage.getItem(key)!);
    s.version = 6;
    s.state.data.profile.name = 'An older name';
    localStorage.setItem(key, JSON.stringify(s));
  }, DATA);
  const chunks = watchChunks(page);
  await page.reload();
  await expect.poll(async () => (await storedAtlas(page)).version).toBe(7);
  expect((await storedAtlas(page)).state.data.profile.name).toBe('Daniel Reed');
  expect(chunks.has('accountant')).toBe(true);
});
