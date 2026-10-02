import { describe, expect, it } from 'vitest';
import { bundle } from './pathways';
import { breath, cableOf, cablePoints, course, HUB_DRIFT, NEAR_DRIFT, OWN_DRIFT, smooth, sway, WAVE, type Ctrl } from './sway';

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

  it('draws the same course the plate draws, from dot to dot', () => {
    const line = course(pts, 0.86);
    const nums = bundle(pts, 0.86)
      .match(/-?\d+\.?\d*/g)!
      .map(Number);
    expect(line[0]).toEqual(pts[0]);
    expect(line.at(-1)).toEqual(pts.at(-1));
    expect(line[0][0]).toBeCloseTo(nums[0], 1);
    expect(line.at(-1)![1]).toBeCloseTo(nums.at(-1)!, 1);
  });

  it('ripples the cable itself, clearly, and lets it go nowhere at its ends', () => {
    const c = cableOf('m1>b', pts, ctrl);
    let most = 0;
    for (let t = 0; t < 20000; t += 700) {
      const p = cablePoints(c, t);
      expect(p[0]).toEqual(pts[0]);
      expect(p.at(-1)).toEqual(pts.at(-1));
      const base = course(sway(c, t), breath(t));
      p.forEach(([x, y], i) => expect(Math.hypot(x - base[i][0], y - base[i][1])).toBeLessThanOrEqual(WAVE * 1.2 + 1e-9));
      const mid = Math.floor(p.length / 2);
      const later = cablePoints(c, t + 2000)[mid];
      most = Math.max(most, Math.hypot(later[0] - p[mid][0], later[1] - p[mid][1]));
    }
    // Plainly moving: its middle travels more than a dot's width in two seconds.
    expect(most).toBeGreaterThan(12);
    expect(smooth(cablePoints(c, 1000)).startsWith(`M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`)).toBe(true);
  });
});
