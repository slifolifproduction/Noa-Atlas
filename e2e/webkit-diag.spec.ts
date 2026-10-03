import { test } from '@playwright/test';
import { firstVisit } from './helpers';

// Temporary: what WebKit does offline with the service worker, reported as this test's failure message.
test.use({ serviceWorkers: 'allow' });

test('diag: webkit offline', async ({ context, page, browserName, isMobile }) => {
  test.skip(browserName !== (process.env.DIAG_BROWSER ?? 'webkit') || isMobile, 'webkit desktop only');
  const out: string[] = [];
  const step = async (name: string, f: () => Promise<string>) => {
    try {
      out.push(`${name}: ${await f()}`);
    } catch (e) {
      out.push(`${name}: THREW ${(e as Error).message.split('\n')[0]}`);
    }
  };
  await firstVisit(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const ready = (p: typeof page) =>
    p
      .waitForFunction(
        () => /\w{3}/.test(document.querySelector('#main')?.textContent ?? '') && !/Loading…/.test(document.querySelector('#main')!.textContent!),
        null,
        { timeout: 8000 },
      )
      .then(() => p.locator('#main').textContent())
      .then((t) => (t ?? '').slice(0, 30))
      .catch((e: Error) => `NOT READY (${e.message.split('\n')[0].slice(0, 60)})`);
  const main = () => ready(page);
  await step('D online reload', async () => {
    const r = await page.reload();
    return `fromSW=${r?.fromServiceWorker()} status=${r?.status()} main=${await main()}`;
  });
  await step('E offline fetch js', async () => {
    await context.setOffline(true);
    const res = await page.evaluate(async () => {
      const src = [...document.scripts].map((s) => s.src).find((s) => /index-/.test(s))!;
      const r = await fetch(src);
      return `${r.status} ${(await r.text()).length}`;
    });
    await context.setOffline(false);
    return res;
  });
  await step('F offline fetch page', async () => {
    await context.setOffline(true);
    const res = await page.evaluate(async () => {
      const r = await fetch('./index.html');
      return `${r.status} ${(await r.text()).length}`;
    });
    await context.setOffline(false);
    return res;
  });
  await step('A offline goto new url', async () => {
    await context.setOffline(true);
    const r = await page.goto('/?a=1#/timeline');
    const m = await main();
    await context.setOffline(false);
    return `fromSW=${r?.fromServiceWorker()} status=${r?.status()} main=${m}`;
  });
  await context.setOffline(false);
  await page.goto('/#/orbit').catch(() => {});
  await step('B offline reload', async () => {
    await context.setOffline(true);
    const r = await page.reload();
    const m = await main();
    await context.setOffline(false);
    return `fromSW=${r?.fromServiceWorker()} status=${r?.status()} main=${m}`;
  });
  await context.setOffline(false);
  await page.goto('/#/orbit').catch(() => {});
  await step('C route-abort reload', async () => {
    await context.route(/localhost:4173/, (r) => r.abort('internetdisconnected'));
    const r = await page.reload();
    const m = await main();
    await context.unrouteAll();
    return `fromSW=${r?.fromServiceWorker()} status=${r?.status()} main=${m}`;
  });
  await context.unrouteAll();
  await step('G new page offline', async () => {
    await context.setOffline(true);
    const p = await context.newPage();
    const r = await p.goto('/#/timeline');
    const m = await ready(p);
    await context.setOffline(false);
    return `fromSW=${r?.fromServiceWorker()} status=${r?.status()} main=${m}`;
  });
  throw new Error('DIAG ' + out.join(' || '));
});
