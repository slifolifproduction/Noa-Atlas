import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed';
import { answersOf, BANDS } from './answers';
import { DEPTH, FLOOR, growTree, HALF, LEVELS, LOOK_Y, project, SOIL, TOP, type Camera } from './tree';

const data = createSeedData();
const paths = Object.values(data.paths).sort((a, b) => a.code.localeCompare(b.code));
const answers = new Map(paths.map((p) => [p.id, answersOf(data, p)]));
const grow = () => growTree(paths, answers, data.currentState.constraints, data.currentState.assets);

describe('the Ahead tree in its case', () => {
  const tree = grow();
  const split = tree.taproot.at(-1)!;
  const out = (p: number[]) => Math.hypot(p[0] - split[0], p[2] - split[2]);

  it('grows a root for every option, each to its own bearing, none deeper or farther out than another', () => {
    expect(tree.roots.map((l) => l.pathId)).toEqual(paths.map((p) => p.id));
    expect(new Set(tree.roots.map((l) => l.bearing)).size).toBe(paths.length);
    for (const l of tree.roots) {
      expect(l.tip[1]).toBeCloseTo(-DEPTH, 6);
      expect(out(l.tip)).toBeCloseTo(out(tree.roots[0].tip), 6);
      expect(l.curve[0]).toEqual(split);
    }
  });

  it('puts a node for every answer, at the stratum its question is asked, on its own root', () => {
    const all = [...answers.values()].flat();
    expect(tree.answers).toHaveLength(all.length);
    expect(new Set(tree.answers.map((a) => a.index)).size).toBe(all.length);
    for (const a of tree.answers) {
      const root = tree.roots.find((l) => l.pathId === a.pathId)!;
      const b = BANDS.indexOf(a.band);
      expect(Math.abs(a.from[1] - LEVELS[b])).toBeLessThanOrEqual(0.5 + 1e-9);
      expect(a.at[1]).toBeLessThan(-SOIL);
      expect(a.index.startsWith(`${root.code}.`)).toBe(true);
      expect(tree.groups.twig.has(a.key)).toBe(true);
      expect(tree.rootOf.get(tree.groups.twig.get(a.key)!)).toBe(tree.groups.root.get(a.pathId));
    }
  });

  it('asks its questions in order down through the earth, from under the slab to above the deepest tips', () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i]).toBeLessThan(LEVELS[i - 1]);
    expect(LEVELS[0]).toBeLessThan(split[1]);
    expect(LEVELS.at(-1)!).toBeGreaterThan(-DEPTH);
  });

  it('carries what holds you bare to one side of the tree and what carries you in leaf to the other', () => {
    const holds = tree.boughs.filter((b) => b.side === 'constraint');
    const carries = tree.boughs.filter((b) => b.side === 'asset');
    expect(holds).toHaveLength(data.currentState.constraints.length);
    expect(carries).toHaveLength(data.currentState.assets.length);
    for (const b of holds) expect(b.end[0]).toBeLessThan(b.curve[0][0]);
    for (const b of carries) expect(b.end[0]).toBeGreaterThan(b.curve[0][0]);
    for (const b of tree.boughs) expect(b.end[1]).toBeGreaterThan(0);
    const leafy = new Set(tree.leafGroup);
    for (const b of carries) expect(leafy.has(tree.groups.bough.get(b.key)!)).toBe(true);
    for (const b of holds) expect(leafy.has(tree.groups.bough.get(b.key)!)).toBe(false);
  });

  it('keeps all of it inside the glass, the roots under the earth and the tree above it', () => {
    for (let i = 0; i < tree.verts.length; i += 3) {
      expect(Math.abs(tree.verts[i])).toBeLessThanOrEqual(HALF);
      expect(Math.abs(tree.verts[i + 2])).toBeLessThanOrEqual(HALF);
      expect(tree.verts[i + 1]).toBeGreaterThanOrEqual(FLOOR);
      expect(tree.verts[i + 1]).toBeLessThanOrEqual(TOP);
    }
    for (let s = 0; s < tree.kind.length; s++) {
      const y = tree.verts[tree.seg[s * 2 + 1] * 3 + 1];
      if (tree.kind[s] === 0) expect(y).toBeLessThanOrEqual(0);
      else expect(y).toBeGreaterThanOrEqual(0);
    }
  });

  it('grows the same way every time for the same atlas', () => {
    const again = grow();
    expect(again.verts.length).toBe(tree.verts.length);
    expect(Array.from(again.verts.slice(0, 300))).toEqual(Array.from(tree.verts.slice(0, 300)));
  });

  it('keeps the middle of the case where the camera puts it, however it turns', () => {
    for (const yaw of [0, 73, 190, -40]) {
      const c: Camera = { yaw, pitch: 8, cx: 300, cy: 500, scale: 8 };
      const [x, y] = project(c, [0, LOOK_Y, 0]);
      expect(x).toBeCloseTo(300, 6);
      expect(y).toBeCloseTo(500, 6);
    }
  });
});
