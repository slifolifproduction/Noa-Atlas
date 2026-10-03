import { expect, test } from '@playwright/test';
import { DATA, firstVisit, ROUTES, storedAtlas } from './helpers';

test.use({ serviceWorkers: 'allow' });
// The service worker and the browser's storage are the same on any screen: on the desktop only.
test.beforeEach(({ isMobile }) => test.skip(isMobile, 'the same on a phone'));

test('installable: a manifest with its icons, and nothing missing for the browser to offer it', async ({ page, request }) => {
  await firstVisit(page);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Noa Atlas', start_url: './', display: 'standalone' });
  for (const size of ['192x192', '512x512']) expect(manifest.icons.some((i: { sizes: string }) => i.sizes === size)).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // A test browser's context is private, which alone keeps it from offering an install.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([]);
});

test('after a first visit, the app opens with no connection: every lens, and another example too', async ({ context, page }) => {
  await firstVisit(page);
  // Kept on the device: the service worker has taken the page, with every file of this version.
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Offline. The Atlas works as usual')).toBeVisible();
  for (const route of ROUTES) {
    await page.goto(`/#/${route}`);
    await expect(page.locator('#main'), route).toContainText(/\w{3}/);
    await expect(page.locator('#main'), route).not.toContainText('Loading…');
  }
  await page
    .getByRole('button', { name: /^Other examples$/ })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.locator('label').filter({ hasText: 'Accountant' }).first().click();
  await dialog.getByRole('button', { name: /^Start fresh$/ }).click();
  await expect.poll(async () => (await storedAtlas(page)).state.data.profile.name).toBe('Daniel Reed');
  await context.setOffline(false);
});

/** The example made the person's own, as it would be had they written it, and watched since `daysAgo`. */
async function ownAtlas(page: import('@playwright/test').Page, backup: Record<string, string>) {
  await page.evaluate(
    ([key, backup]) => {
      const s = JSON.parse(localStorage.getItem(key as string)!);
      delete s.state.data.profile.example;
      delete s.state.data.profile.exampleLang;
      s.state.data.profile.name = 'Sam';
      localStorage.setItem(key as string, JSON.stringify(s));
      localStorage.setItem('cognitive-atlas:backup', JSON.stringify({ state: backup, version: 0 }));
    },
    [DATA, backup] as const,
  );
  await page.reload();
}

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

test('an atlas of one’s own, a week without a copy, is brought up once; a copy downloaded puts it to rest', async ({ page }) => {
  await firstVisit(page);
  await ownAtlas(page, { since: daysAgo(8) });
  const reminder = page.getByText('Your atlas lives only in this browser');
  await expect(reminder).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a copy' }).click()]);
  expect(download.suggestedFilename()).toMatch(/^noa-atlas-\d{4}-\d{2}-\d{2}\.json$/);
  await expect(reminder).toBeHidden();
  // Settings says when the last copy was made.
  await page.goto('/#/settings');
  await expect(page.getByText('The last copy you downloaded is from')).toBeVisible();
});

test('“Later” puts the reminder off, and an example never gets one', async ({ page }) => {
  await firstVisit(page);
  const reminder = page.getByText('Your atlas lives only in this browser');
  // The example itself: never.
  await page.evaluate(() => localStorage.setItem('cognitive-atlas:backup', JSON.stringify({ state: { since: new Date(0).toISOString() }, version: 0 })));
  await page.reload();
  await expect(page.locator('#main')).toContainText(/\w{3}/);
  await expect(reminder).toBeHidden();
  await ownAtlas(page, { since: daysAgo(30) });
  await expect(reminder).toBeVisible();
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(reminder).toBeHidden();
  await page.reload();
  await expect(page.locator('#main')).toContainText(/\w{3}/);
  await expect(reminder).toBeHidden();
});
