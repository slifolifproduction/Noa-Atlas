import { expect, test } from '@playwright/test';
import { firstVisit, ROUTES, watchErrors } from './helpers';

test('every lens opens with something on it, no error, and nothing wider than the screen', async ({ page }) => {
  const errors = watchErrors(page);
  await firstVisit(page);
  for (const route of ROUTES) {
    await page.goto(`/#/${route}`);
    const main = page.locator('#main');
    await expect(main, route).toContainText(/\w{3}/);
    await expect(main, `${route} stays loading`).not.toContainText('Loading…');
    const wide = await page.evaluate(() => document.scrollingElement!.scrollWidth - innerWidth);
    expect(wide, `${route} scrolls sideways by ${wide}px`).toBeLessThanOrEqual(1);
  }
  expect(errors).toEqual([]);
});

test('in Indonesian, the interface and the example are in Indonesian', async ({ page }) => {
  const errors = watchErrors(page);
  await firstVisit(page, 'id', 'timeline');
  await expect(page.getByText('Waktu', { exact: true }).filter({ visible: true }).first()).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'id');
  const lang = await page.evaluate(() => JSON.parse(localStorage.getItem('cognitive-atlas:data')!).state.data.profile.exampleLang);
  expect(lang).toBe('id');
  expect(errors).toEqual([]);
});
