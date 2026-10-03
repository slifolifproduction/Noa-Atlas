import { afterEach, describe, expect, it } from 'vitest';
import { drawPacer, slowWatch } from './motion';

describe('pacing heavy drawing', () => {
  afterEach(() => delete (globalThis as { document?: unknown }).document);
  const visible = () => ((globalThis as { document?: unknown }).document = { hidden: false });

  it('draws every frame on a device that keeps up', () => {
    const pace = drawPacer();
    let drawn = 0;
    for (let t = 0; t < 1000; t += 16.7) if (pace.due(t)) (pace.drew(t), drawn++);
    expect(drawn).toBeGreaterThanOrEqual(59);
  });

  it('leaves about half the time free when each draw costs more than a frame', () => {
    const pace = drawPacer();
    let t = 0;
    let busy = 0;
    while (t < 10000) {
      if (pace.due(t)) {
        pace.drew(t);
        t += 70; // a draw that takes 70 ms (script and painting)
        busy += 70;
      } else t += 16.7;
    }
    expect(busy / t).toBeGreaterThan(0.4);
    expect(busy / t).toBeLessThan(0.6);
    expect(pace.cost()).toBeCloseTo(70, 0);
  });

  it('finds a device slow after two windows under about 33 fps, and not one that keeps up', () => {
    visible();
    const slow = slowWatch();
    let found = false;
    for (let t = 0; t < 6000 && !found; t += 40) found = slow(t, 40);
    expect(found).toBe(true);
    const fine = slowWatch();
    let wrong = false;
    for (let t = 0; t < 10000; t += 16.7) wrong ||= fine(t, 16.7);
    expect(wrong).toBe(false);
  });
});
