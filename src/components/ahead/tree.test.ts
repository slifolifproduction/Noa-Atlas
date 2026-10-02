import { describe, expect, it } from 'vitest';
import { createSeedData } from '../../data/seed';
import { answersOf, BANDS, type Answer } from './answers';
import { cutAt, DEPTH, FLOOR, growTree, HALF, LEVELS, LOOK_Y, project, reachOf, sizeOf, SOIL, TOP, type Camera, type Tree } from './tree';

const data = createSeedData();
const paths = Object.values(data.paths).sort((a, b) => a.code.localeCompare(b.code));
const answers = new Map(paths.map((p) => [p.id, answersOf(data, p)]));
const grow = () => growTree(paths, answers, data.currentState.constraints, data.currentState.assets);

describe('the Ahead tree in its case', () => {
  const tree = grow();
  const split = tree.taproot.at(-1)!;
  const out = (p: number[]) => Math.hypot(p[0] - split[0], p[2] - split[2]);

  it('grows a root for every option, each to its own bearing, none farther out than another', () => {
    expect(tree.roots.map((l) => l.pathId)).toEqual(paths.map((p) => p.id));
    expect(new Set(tree.roots.map((l) => l.bearing)).size).toBe(paths.length);
    for (const l of tree.roots) {
      expect(l.curve.at(-1)![1]).toBeCloseTo(-DEPTH, 6);
      expect(out(l.curve.at(-1)!)).toBeCloseTo(out(tree.roots[0].curve.at(-1)!), 6);
      expect(l.curve[0]).toEqual(split);
      expect(l.tip[1]).toBeCloseTo(l.cut, 6);
    }
  });

  it('grows each root as far down as its option has answers, and the tree above with them', () => {
    const only = (bands: number[]) => (answers.get(paths[0].id) ?? []).filter((a) => bands.includes(BANDS.indexOf(a.band)));
    const one = (list: Answer[]) => growTree([paths[0]], new Map([[paths[0].id, list]]), [], []);
    // Nothing written yet: a stub under the split, above the first question, and a seedling.
    const bare = one([]);
    expect(bare.roots[0].reach).toBe(0);
    expect(bare.roots[0].tip[1]).toBeGreaterThan(LEVELS[0]);
    expect(bare.roots[0].tip[1]).toBeLessThan(split[1]);
    expect(sizeOf(bare.grown)).toBeCloseTo(0.3, 6);
    // Only what it needs: past the first stratum, short of the second.
    const needs = one(only([0]));
    expect(needs.roots[0].reach).toBe(1);
    expect(needs.roots[0].tip[1]).toBeLessThan(LEVELS[0]);
    expect(needs.roots[0].tip[1]).toBeGreaterThan(LEVELS[1]);
    // What is not known yet answered: all the way down, and grown.
    const deep = one(only([0, 3]));
    expect(deep.roots[0].reach).toBe(4);
    expect(deep.roots[0].tip[1]).toBeCloseTo(-DEPTH, 6);
    expect(deep.grown).toBe(1);
    // Deeper is never less: the tree only grows as the roots go down.
    for (let k = 1; k <= 4; k++) expect(cutAt(k)).toBeLessThan(cutAt(k - 1));
    expect(reachOf([])).toBe(0);
  });

  it('grows every rootlet where its root has reached, and nothing of a root below where it has', () => {
    for (const l of tree.roots) {
      for (const a of tree.answers.filter((x) => x.pathId === l.pathId)) expect(a.from[1]).toBeGreaterThanOrEqual(l.cut - 0.5);
    }
    // A root that reaches one stratum keeps what lies below it for later, ungrown.
    const needs = (answers.get(paths[0].id) ?? []).filter((a) => a.band === 'needs');
    const short = growTree([paths[0]], new Map([[paths[0].id, needs]]), [], []);
    const g = short.groups.root.get(paths[0].id)!;
    let below = 0;
    for (let s = 0; s < short.kind.length; s++) if (short.kind[s] === 0 && short.group[s] === g && short.origin[s] < short.roots[0].cut) below++;
    expect(below).toBeGreaterThan(0);
  });

  it('grows only what changed when one more answer is written: the rest of it stays where it was', () => {
    const wood = (t: Tree) => {
      const out: number[] = [];
      for (let s = 0; s < t.kind.length; s++)
        if (t.kind[s] !== 0) for (const v of [t.seg[s * 2], t.seg[s * 2 + 1]]) out.push(t.verts[v * 3], t.verts[v * 3 + 1], t.verts[v * 3 + 2]);
      return out;
    };
    const fewer = new Map(answers);
    fewer.set(paths[0].id, (answers.get(paths[0].id) ?? []).slice(0, -1));
    const before = growTree(paths, fewer, data.currentState.constraints, data.currentState.assets);
    expect(wood(before)).toEqual(wood(tree));
    for (const l of tree.roots.slice(1)) expect(before.roots.find((b) => b.pathId === l.pathId)!.curve).toEqual(l.curve);
    expect(before.answers.length).toBe(tree.answers.length - 1);
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

  it('carries what holds you to one side of the tree and what carries you to the other, every bough in leaf', () => {
    const holds = tree.boughs.filter((b) => b.side === 'constraint');
    const carries = tree.boughs.filter((b) => b.side === 'asset');
    expect(holds).toHaveLength(data.currentState.constraints.length);
    expect(carries).toHaveLength(data.currentState.assets.length);
    for (const b of holds) expect(b.end[0]).toBeLessThan(b.curve[0][0]);
    for (const b of carries) expect(b.end[0]).toBeGreaterThan(b.curve[0][0]);
    for (const b of tree.boughs) expect(b.end[1]).toBeGreaterThan(0);
    // In leaf, all of them: what carries you more fully than what holds you.
    const leaves = (key: string) => Array.from(tree.leafGroup).filter((g) => g === tree.groups.bough.get(key)).length;
    for (const b of tree.boughs) expect(leaves(b.key)).toBeGreaterThan(0);
    for (const c of carries) for (const h of holds) expect(leaves(c.key)).toBeGreaterThan(leaves(h.key));
    // Nothing on the walls above the earth: only the tree stands against the light.
    for (const c of tree.circuits) for (const p of c.pts) expect(p[1]).toBeLessThan(0);
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
