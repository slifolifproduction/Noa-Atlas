import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';
import { firstVisit, restingNode, ROUTES } from './helpers';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');

/** axe (the WCAG 2.0, 2.1 and 2.2 A and AA rules) on what is on screen, every fold opened. */
async function violations(page: Page) {
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => (d.open = true)));
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } })
      .axe;
    const r = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'], resultTypes: ['violations'] });
    return r.violations.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(' '))
          .slice(0, 3)
          .join(' | ')}`,
    );
  });
}

test('no WCAG A or AA violations on any lens, in the capture form or in the panel', async ({ page, isMobile }) => {
  await firstVisit(page);
  for (const route of ROUTES) {
    await page.goto(`/#/${route}`);
    await expect(page.locator('#main')).toContainText(/\w{3}/);
    // Pages that come in with motion are checked once they have arrived.
    await page.waitForTimeout(route === 'quests' || route === 'paths' ? 3500 : 1200);
    expect(await violations(page), route).toEqual([]);
  }
  await page.goto('/#/timeline');
  await page.keyboard.press('n');
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await violations(page), 'capture').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
  // The agent, as it opens here (outside claude.ai: with the note on where Claude answers).
  await page.keyboard.press('a');
  const agent = page.getByRole('complementary', { name: 'Atlas agent' });
  await expect(agent).toBeVisible();
  // It slides in, fading up: checked once it has arrived, as the pages that come in with motion are.
  await agent.evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished),
    ),
  );
  expect(await violations(page), 'agent').toEqual([]);
  await page.keyboard.press('Escape');
  await expect(agent).toBeHidden();
  if (!isMobile) {
    await page.goto('/#/orbit');
    await (await restingNode(page)).click({ force: true });
    await expect(page.getByRole('button', { name: /Close panel/ })).toBeVisible();
    expect(await violations(page), 'panel').toEqual([]);
  }
});

test('on a phone, every control answers a tap over at least 24 × 24 px, and none takes a neighbour’s', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'a phone check');
  await firstVisit(page);
  for (const route of ROUTES) {
    await page.goto(`/#/${route}`);
    await expect(page.locator('#main')).toContainText(/\w{3}/);
    await page.waitForTimeout(route === 'quests' || route === 'paths' ? 3200 : 1200);
    const short = await page.evaluate(async () => {
      document.querySelectorAll('details').forEach((d) => (d.open = true));
      const shown = (el: Element) => {
        const s = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return s.visibility !== 'hidden' && s.display !== 'none' && r.width > 0 && r.height > 0 && !el.closest('.sr-only') && Number(s.opacity) > 0.05;
      };
      const controls = [...document.querySelectorAll('button, a[href], [role=button], [role=checkbox], input, select, textarea, summary')].filter(shown);
      const out: string[] = [];
      for (const el of controls) {
        const own = (el.tagName === 'INPUT' && el.closest('label')) || el;
        if (el.closest('.react-flow__attribution')) continue;
        const first = own.getBoundingClientRect();
        if (first.width >= 24 && first.height >= 24) continue;
        own.scrollIntoView({ block: 'center', inline: 'center' });
        await new Promise((r) => requestAnimationFrame(r));
        const r = own.getBoundingClientRect();
        const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
        const mine = (x: number, y: number) => {
          const hit = document.elementFromPoint(x, y);
          return Boolean(hit && (own.contains(hit) || hit === own));
        };
        // Covered by something else (the panel over the page): not there to tap.
        if (!mine(cx, cy)) continue;
        const missed = [-11, 0, 11].flatMap((dx) => [-11, 0, 11].map((dy) => [dx, dy])).filter(([dx, dy]) => !mine(cx + dx, cy + dy));
        if (missed.length)
          out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 40)} (${Math.round(r.width)}×${Math.round(r.height)})`);
      }
      return out;
    });
    expect(short, route).toEqual([]);
  }
});
