import { describe, expect, it } from 'vitest';
import { breath, cableOf, HUB_DRIFT, NEAR_DRIFT, OWN_DRIFT, sway, type Ctrl } from './sway';

const pts: [number, number][] = [
  [0, -320],
  [0, -260],
  [40, -140],
  [-60, 90],
  [-200, 210],
  [-230, 240],
];
const ctrl: Ctrl[] = ['end', 'near:a', 'hub:work', 'hub:people', 'near:b', 'end'];

describe('the strands as living cables', () => {
  it('keeps both ends on their dots, whenever it is', () => {
    const c = cableOf('m1>b', pts, ctrl);
    for (const t of [0, 1234, 98765, 4e6]) {
      const p = sway(c, t);
      expect(p[0]).toEqual(pts[0]);
      expect(p.at(-1)).toEqual(pts.at(-1));
    }
  });

  it('moves a bundle as one cable: strands through the same hub drift together, apart only by their own wander', () => {
    const one = cableOf('m1>b', pts, ctrl);
    const two = cableOf('m2>c', pts, ctrl);
    for (const t of [500, 20000, 333333]) {
      const [a, b] = [sway(one, t)[2], sway(two, t)[2]];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThanOrEqual(2 * OWN_DRIFT * Math.SQRT2 + 1e-9);
    }
  });

  it('never stops, and never strays further than it may', () => {
    const c = cableOf('m1>b', pts, ctrl);
    let moved = 0;
    for (let t = 0; t < 60000; t += 1000) {
      const p = sway(c, t);
      const q = sway(c, t + 1000);
      moved += Math.hypot(q[2][0] - p[2][0], q[2][1] - p[2][1]);
      p.forEach(([x, y], i) => {
        const most = (ctrl[i].startsWith('hub:') ? HUB_DRIFT : ctrl[i] === 'end' ? 0 : NEAR_DRIFT) + OWN_DRIFT;
        expect(Math.hypot(x - pts[i][0], y - pts[i][1])).toBeLessThanOrEqual(most * Math.SQRT2 + 1e-9);
      });
    }
    expect(moved).toBeGreaterThan(10);
  });

  it('breathes the bundling about the drawing’s own', () => {
    for (const t of [0, 4000, 9000]) expect(Math.abs(breath(t) - 0.86)).toBeLessThanOrEqual(0.025 + 1e-9);
  });
});
