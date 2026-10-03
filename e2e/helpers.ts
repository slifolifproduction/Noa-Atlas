import { expect, type Page } from '@playwright/test';

export const DATA = 'cognitive-atlas:data';
export const ROUTES = ['orbit', 'timeline', 'network', 'patterns', 'paths', 'navigation', 'quests', 'settings'] as const;

/** Open the app as a first visitor would, in a language: storage cleared once per tab, the welcome closed. */
export async function firstVisit(page: Page, lang: 'en' | 'id' = 'en', route = 'orbit') {
  await page.addInitScript((lang) => {
    if (sessionStorage.getItem('e2e')) return;
    sessionStorage.setItem('e2e', '1');
    localStorage.clear();
    localStorage.setItem('cognitive-atlas:lang', lang);
  }, lang);
  await page.goto(`/#/${route}`);
  await closeWelcome(page);
}

/** The welcome dialog a first visit opens with: closed with its last button (start with the example). */
export async function closeWelcome(page: Page) {
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button').last().click();
  await expect(dialog).toBeHidden();
}

/** Errors the page throws or logs, from now on (requests to the outside world, blocked or offline, aside). */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/huggingface|googleapis|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Write a note through the capture form (N), as a person would, and wait until it is saved. */
export async function writeNote(page: Page, text: string) {
  await page.bringToFront();
  await page.goto('/#/timeline');
  await expect(page.locator('#main')).toContainText(/\S/);
  await page.keyboard.press('n');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The form puts the caret in its first field on the next frame: typed before then, the first letters go nowhere.
  await expect(dialog.locator('textarea, input').first()).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press('Control+Enter');
  await expect(dialog).toBeHidden();
  await expect.poll(() => stored(page)).toContain(text.slice(0, 40));
}

/** The atlas as this browser keeps it, as text. */
export const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key) ?? '', DATA);

/** The atlas as this browser keeps it, read. */
export const storedAtlas = (page: Page) =>
  page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? 'null') as { state: { data: { profile: Record<string, string> } }; version: number }, DATA);

/** Which built script files the page fetched, by name (index, accountant, seed, …). */
export function watchChunks(page: Page): Set<string> {
  const chunks = new Set<string>();
  page.on('request', (r) => {
    const m = /assets\/([A-Za-z]+)-[\w-]+\.js/.exec(r.url());
    if (m) chunks.add(m[1]);
  });
  return chunks;
}
