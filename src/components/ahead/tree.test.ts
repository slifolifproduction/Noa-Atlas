import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed';
import { answersOf, BANDS } from './answers';
import { CROWN_Y, growTree, LEVELS, project, type Camera } from './tree';

const data = createSeedData();
const paths = Object.values(data.paths).sort((a, b) => a.code.localeCompare(b.code));
const answers = new Map(paths.map((p) => [p.id, answersOf(data, p)]));
const grow = () => growTree(paths, answers, data.currentState.constraints, data.currentState.assets);
const reach = (p: number[]) => Math.hypot(p[0], p[2]);

describe('the Ahead tree', () => {
  const tree = grow();

  it('grows a limb for every option, each to its own bearing, none higher or longer than another', () => {
    expect(tree.limbs.map((l) => l.pathId)).toEqual(paths.map((p) => p.id));
    expect(new Set(tree.limbs.map((l) => l.bearing)).size).toBe(paths.length);
    for (const l of tree.limbs) {
      expect(l.tip[1]).toBeCloseTo(tree.limbs[0].tip[1], 6);
      expect(l.tip[1]).toBeCloseTo(CROWN_Y, 6);
      // Measured from the fork, where every limb starts.
      const out = Math.hypot(l.tip[0] - tree.trunk.at(-1)![0], l.tip[2] - tree.trunk.at(-1)![2]);
      const first = tree.limbs[0];
      expect(out).toBeCloseTo(Math.hypot(first.tip[0] - tree.trunk.at(-1)![0], first.tip[2] - tree.trunk.at(-1)![2]), 6);
    }
  });

  it('puts a bud for every answer, at the level its question is asked, on its own limb', () => {
    const all = [...answers.values()].flat();
    expect(tree.answers).toHaveLength(all.length);
    expect(new Set(tree.answers.map((a) => a.index)).size).toBe(all.length);
    for (const a of tree.answers) {
      const limb = tree.limbs.find((l) => l.pathId === a.pathId)!;
      const b = BANDS.indexOf(a.band);
      expect(Math.abs(a.from[1] - LEVELS[b])).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(a.index.startsWith(`${limb.code}.`)).toBe(true);
      expect(tree.groups.twig.has(a.key)).toBe(true);
      expect(tree.limbOf.get(tree.groups.twig.get(a.key)!)).toBe(tree.groups.limb.get(a.pathId));
    }
  });

  it('asks its questions in order up the tree, between the fork and the crown', () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i]).toBeGreaterThan(LEVELS[i - 1]);
    expect(LEVELS[0]).toBeGreaterThan(tree.trunk.at(-1)![1]);
    expect(LEVELS.at(-1)!).toBeLessThan(CROWN_Y);
  });

  it('runs what holds you out to one side and what carries you to the other', () => {
    const holds = tree.roots.filter((r) => r.side === 'constraint');
    const carries = tree.roots.filter((r) => r.side === 'asset');
    expect(holds).toHaveLength(data.currentState.constraints.length);
    expect(carries).toHaveLength(data.currentState.assets.length);
    for (const r of holds) expect(r.end[0]).toBeLessThan(0);
    for (const r of carries) expect(r.end[0]).toBeGreaterThan(0);
    for (const r of tree.roots) expect(reach(r.end)).toBeGreaterThan(5);
  });

  it('scans the same way every time for the same atlas', () => {
    const again = grow();
    expect(again.points.length).toBe(tree.points.length);
    expect(Array.from(again.points.slice(0, 300))).toEqual(Array.from(tree.points.slice(0, 300)));
  });

  it('keeps the foot of the trunk where the camera puts it, however it turns', () => {
    for (const yaw of [0, 73, 190, -40]) {
      const c: Camera = { yaw, pitch: 14, cx: 300, cy: 500, scale: 8 };
      const [x, y] = project(c, [0, 0, 0]);
      expect(x).toBeCloseTo(300, 6);
      expect(y).toBeCloseTo(500, 6);
    }
  });
});
