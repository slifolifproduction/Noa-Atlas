import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname } from 'node:path';
import { expect, test } from '@playwright/test';
import { closeWelcome, DATA, firstVisit, ROUTES, storedAtlas } from './helpers';

test.use({ serviceWorkers: 'allow' });
// The service worker and the browser's storage are the same on any screen: on the desktop only.
test.beforeEach(({ isMobile }) => test.skip(isMobile, 'the same on a phone'));

test('installable: a manifest with its icons, and nothing missing for the browser to offer it', async ({ page, request, browserName }) => {
  await firstVisit(page);
  const manifest = await (await request.get('/manifest.webmanifest')).json();
  expect(manifest).toMatchObject({ name: 'Noa Atlas', start_url: './', display: 'standalone' });
  for (const size of ['192x192', '512x512']) expect(manifest.icons.some((i: { sizes: string }) => i.sizes === size)).toBe(true);
  for (const icon of manifest.icons) expect((await request.get(`/${icon.src}`)).ok(), icon.src).toBe(true);
  for (const href of await page.locator('link[rel=manifest], link[rel=apple-touch-icon]').evaluateAll((l) => l.map((e) => (e as HTMLLinkElement).href)))
    expect((await request.get(href)).ok(), href).toBe(true);
  // What else the browser wants before it offers an install, only Chromium says.
  if (browserName !== 'chromium') return;
  const cdp = await page.context().newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  // A test browser's context is private, which alone keeps it from offering an install.
  expect(installabilityErrors.filter((e) => e.errorId !== 'in-incognito')).toEqual([]);
});

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
};

/**
 * The built app at an address of its own, from a server the test can take away. The browser's own offline switch
 * will not do in every browser: WebKit's, under test, fails a page's requests before its service worker can answer.
 */
async function serveBuild() {
  const root = new URL('../dist/', import.meta.url);
  const server = createServer(async (req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname.replace(/^\/+/, '') || 'index.html';
    const file = new URL(path, root);
    try {
      if (!file.href.startsWith(root.href)) throw new Error('outside');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': TYPES[extname(file.pathname)] ?? 'application/octet-stream', 'cache-control': 'no-cache' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, done));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`,
    stop: () =>
      new Promise<void>((done) => {
        server.close(() => done());
        server.closeAllConnections();
      }),
  };
}

test('after a first visit, the app opens with no connection: every lens, and another example too', async ({ context, page }) => {
  const site = await serveBuild();
  try {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('e2e')) return;
      sessionStorage.setItem('e2e', '1');
      localStorage.setItem('cognitive-atlas:lang', 'en');
    });
    await page.goto(`${site.url}#/orbit`);
    await closeWelcome(page);
    // Kept on the device: the service worker has taken the page, with every file of this version.
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    // The site is gone.
    await site.stop();
    await page.reload();
    for (const route of ROUTES) {
      await page.goto(`${site.url}#/${route}`);
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
    // The connection gone too: a quiet line says so, and nothing else changes.
    await context.setOffline(true);
    await expect(page.getByText('Offline. The Atlas works as usual')).toBeVisible();
    await context.setOffline(false);
  } finally {
    await site.stop();
  }
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
