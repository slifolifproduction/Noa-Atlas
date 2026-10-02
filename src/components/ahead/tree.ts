import type { StrategicPath } from '../../domain/types';
import { BANDS, type Answer, type Band } from './answers';

/*
 * Ahead as a section through a glass case, the way a model is shown: a slab
 * of earth across it, a young tree standing in the earth, and under the
 * earth, lit, its roots.
 *
 * The tree above the ground is where you are now: what carries you (assets)
 * are its boughs in leaf, to one side, and what holds you (constraints) its
 * bare boughs, to the other. Under the ground its taproot divides into a root
 * for every option, each running out and down its own way, spaced evenly
 * round it, and all as far out as each other, for nothing here is ranked;
 * drawn in dashes, as the atlas draws what has not happened. Every
 * option is asked the same four questions, at four depths, cut as strata
 * (what it needs nearest the surface, then the skills it takes, what it
 * costs, and what is not known yet deepest of all); where a root passes a
 * stratum its answers branch off it as rootlets, each ending in a node.
 * Reading down a root reads one option; reading across a stratum compares
 * them. Everything else (the lesser roots, the circuits on the walls below
 * the ground) is texture, drawn so it never reads as data.
 *
 * It grows as you think the options through. A root reaches down only as far as
 * its option has answers: a stub under the split while none is written, past
 * each stratum that has one, to the bottom once what is not known yet has one.
 * A short root is an option not yet thought through, never a worse one. The
 * tree above grows with its roots, from a seedling while they are short to grown
 * once they reach down.
 *
 * Units are metres of the drawing: the surface of the earth is at 0, y is up.
 */

export type V3 = [number, number, number];

/** The case: its ceiling, its floor, and half its width (and depth: it is square). */
export const TOP = 18;
export const FLOOR = -46;
export const HALF = 21;
/** The slab of earth the tree stands in. */
export const SOIL = 2.4;
/** Where the taproot divides into the options; how deep and how far out they all reach. */
const SPLIT = 5.5;
export const DEPTH = 40;
const REACH = 13.5;
/** The young tree's height. */
const TREE_H = 14;
/** The four strata, as shares of the way from where the taproot divides down to the deepest tip. */
const LEVEL_AT = [0.2, 0.42, 0.64, 0.86];
export const LEVELS: number[] = LEVEL_AT.map((s) => -(SPLIT + (DEPTH - SPLIT) * s));
/** How far down a root reaches when its answers reach `k` strata: a stub with none, past each one it reaches, then the bottom. */
const REACH_AT = [0.1, 0.31, 0.53, 0.75, 1];
/** The tree above at its smallest, as a share of its grown size: a seedling. */
const SEEDLING = 0.3;

/** How many strata an option's answers reach down to: 0 with none, 4 once what is not known yet has one. */
export const reachOf = (list: Answer[]) => list.reduce((k, a) => Math.max(k, BANDS.indexOf(a.band) + 1), 0);
/** The height a root grows down to when it reaches `k` strata. */
export const cutAt = (k: number) => -(SPLIT + (DEPTH - SPLIT) * REACH_AT[Math.max(0, Math.min(4, k))]);
/** How grown the tree is (0 to 1): how far its options' roots reach, all together. */
export const grownOf = (reaches: number[]) => (reaches.length ? reaches.reduce((n, k) => n + k, 0) / (reaches.length * 4) : 0);
/** The tree above, as a share of its grown size. */
export const sizeOf = (grown: number) => SEEDLING + (1 - SEEDLING) * Math.max(0, Math.min(1, grown));
/** How much of the crown is in leaf: a seedling's few leaves, then all of them. */
export const leafAt = (grown: number) => 0.35 + 0.65 * Math.max(0, Math.min(1, grown));

export interface TreeAnswer extends Answer {
  /** Its number on the plate: the option's letter and its place. */
  index: string;
  /** Its node, and where its rootlet leaves the root. */
  at: V3;
  from: V3;
}
export interface OptionRoot {
  pathId: string;
  code: string;
  /** The way it runs out, in degrees round the trunk: only where it is drawn, so never shown as a number. */
  bearing: number;
  /** All the way down; only what is above `cut` is grown. */
  curve: V3[];
  /** How many strata its answers reach (0 to 4), and the height it grows down to for that. */
  reach: number;
  cut: number;
  /** Where it ends, at `cut`. */
  tip: V3;
  /** Where it passes each stratum. */
  levels: V3[];
}
export interface Bough {
  key: string;
  side: 'constraint' | 'asset';
  text: string;
  curve: V3[];
  end: V3;
}
/**
 * What the walls of the case carry: a trace, a chip, a bar of stripes, a via, all under the ground. Only
 * texture, so never in the signal colour and never counted from anything.
 */
export interface Circuit {
  wall: number;
  kind: 'trace' | 'chip' | 'bar' | 'via';
  pts: V3[];
}
export interface Tree {
  taproot: V3[];
  roots: OptionRoot[];
  answers: TreeAnswer[];
  boughs: Bough[];
  /**
   * Every line of it: its ends (indices into `verts`), how wide it is (metres), its group (see `groups`), when it
   * grows in (0 at the surface, 1 at the farthest tip, up or down) and what it is: 0 a root, lit; 1 wood, dark; 2 grass.
   */
  verts: Float32Array;
  seg: Uint32Array;
  width: Float32Array;
  group: Uint16Array;
  grow: Float32Array;
  kind: Uint8Array;
  /**
   * For a root's line, the height where its branch leaves that root: a line is grown once the root reaches down to
   * it. (The taproot, the tree and what is not anyone's root: 0.)
   */
  origin: Float32Array;
  /** The leaves: where, whose (a group), and when they come out. */
  leaves: Float32Array;
  leafGroup: Uint16Array;
  leafGrow: Float32Array;
  /** How much of the crown must be in leaf for each leaf to show (see `leafAt`); 0 for a bough's, which is data. */
  leafNeed: Float32Array;
  /** How grown it is (see `grownOf`). */
  grown: number;
  /** The earth's grain, on its faces (0 its top, 1–4 its sides: +x, −x, +z, −z); and crumbs fallen on the floor. */
  dirt: Float32Array;
  dirtFace: Uint8Array;
  crumbs: Float32Array;
  circuits: Circuit[];
  /** Group ids: 0 nothing named, 1 the trunk and taproot (you), then each root, each rootlet and each bough. */
  groups: { root: Map<string, number>; twig: Map<string, number>; bough: Map<string, number> };
  /** A rootlet's root, for lighting a whole option at once. */
  rootOf: Map<number, number>;
}

/** A small seeded random, so the same atlas grows the same way every time. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const hashOf = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => mul(a, 1 / (len(a) || 1));
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const flat = (deg: number): V3 => [Math.cos((deg * Math.PI) / 180), 0, Math.sin((deg * Math.PI) / 180)];
/** Kept inside the case, clear of its glass: above the earth, or under it. */
const inside = (p: V3, above: boolean): V3 => [
  Math.max(-HALF + 1, Math.min(HALF - 1, p[0])),
  above ? Math.max(0.3, Math.min(TOP - 1.5, p[1])) : Math.max(FLOOR + 2, Math.min(-SOIL - 0.2, p[1])),
  Math.max(-HALF + 1, Math.min(HALF - 1, p[2])),
];

/** A cubic curve through four points, as `n` + 1 points. */
function bezier(p0: V3, p1: V3, p2: V3, p3: V3, n: number): V3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t)));
  });
}
/** Where a curve passes height `y`. */
export function atHeight(curve: V3[], y: number): V3 {
  for (let i = 1; i < curve.length; i++) {
    const [a, b] = [curve[i - 1], curve[i]];
    if ((a[1] - y) * (b[1] - y) <= 0) {
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return add(a, mul(sub(b, a), t));
    }
  }
  return curve[curve.length - 1];
}

/**
 * How a line is drawn, as the atlas draws what kind of knowledge it is: whole for what is (the tree, the taproot
 * that is you); in long dashes for an option, which has not happened; in short dashes for an answer's rootlet;
 * in dots for what is only texture (the lesser roots and hairs), so it never reads as an answer.
 */
type Stroke = 'whole' | 'dashes' | 'dots';

/** All of it, gathered as it grows. */
class Growth {
  verts: number[] = [];
  seg: number[] = [];
  width: number[] = [];
  group: number[] = [];
  grow: number[] = [];
  kind: number[] = [];
  origin: number[] = [];
  leaves: number[] = [];
  leafGroup: number[] = [];
  leafGrow: number[] = [];
  /** The height where what is drawn now leaves its root (see `Tree.origin`). */
  from = 0;
  constructor(public r: () => number) {}
  private vert(p: V3) {
    this.verts.push(p[0], p[1], p[2]);
    return this.verts.length / 3 - 1;
  }
  /**
   * A line through these points: its width from `w0` to `w1`, growing in from `g0` to `g1`, and drawn whole, in
   * short dashes (each step's middle) or in dots (less of it still).
   */
  line(pts: V3[], w0: number, w1: number, group: number, g0: number, g1: number, kind: number, stroke: Stroke = 'whole') {
    const keep = stroke === 'dashes' ? 0.6 : stroke === 'dots' ? 0.3 : 1;
    let prev = this.vert(pts[0]);
    for (let i = 1; i < pts.length; i++) {
      let a = prev;
      let v: number;
      if (keep < 1) {
        const [p, q] = [pts[i - 1], pts[i]];
        const m = (1 - keep) / 2;
        a = this.vert(add(p, mul(sub(q, p), m)));
        v = this.vert(add(p, mul(sub(q, p), 1 - m)));
      } else v = this.vert(pts[i]);
      const f = i / (pts.length - 1);
      this.seg.push(a, v);
      this.width.push(w0 + (w1 - w0) * (f - 0.5 / (pts.length - 1)));
      this.group.push(group);
      this.grow.push(g0 + (g1 - g0) * f);
      this.kind.push(kind);
      this.origin.push(this.from);
      prev = v;
    }
  }
  /**
   * A jagged run from a to b, as roots and lightning run: `n` steps, each knocked aside a little from the last,
   * and least at its ends, which stay where they are put.
   */
  jag(a: V3, b: V3, n: number, rough: number): V3[] {
    const r = this.r;
    const d = sub(b, a);
    const T = norm(d);
    const N = norm(cross(T, Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
    const B = cross(T, N);
    const step = (len(d) / n) * rough;
    let u = 0;
    let v = 0;
    const out: V3[] = [a];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      u = u * 0.55 + (r() - 0.5) * step * 2.4;
      v = v * 0.55 + (r() - 0.5) * step * 2.4;
      const env = Math.sin(Math.PI * t) ** 0.6;
      out.push(add(add(a, mul(d, t)), add(mul(N, u * env), mul(B, v * env))));
    }
    out.push(b);
    return out;
  }
  /** A branch of roots from `from` toward `dir`, dividing as it goes, `depth` times more. */
  roots(from: V3, dir: V3, length: number, width: number, group: number, g0: number, depth: number, grow: number) {
    const r = this.r;
    const to = inside(add(from, mul(norm(dir), length)), false);
    const pts = this.jag(from, to, Math.max(3, Math.round(length / 0.9)), 0.55);
    const g1 = g0 + length / grow;
    this.line(pts, width, width * 0.25, group, g0, g1, 0, 'dots');
    if (depth <= 0) return;
    const children = depth >= 2 ? 3 + Math.floor(r() * 2) : 2 + Math.floor(r() * 2);
    for (let k = 0; k < children; k++) {
      const t = 0.3 + (0.65 * (k + r() * 0.7)) / children;
      const at = pts[Math.min(pts.length - 1, Math.round(t * (pts.length - 1)))];
      const side = r() < 0.5 ? -1 : 1;
      const turn = cross(norm(dir), [0, 1, 0]);
      const next = add(add(norm(dir), mul(turn, side * (0.5 + r() * 0.9))), [0, -(0.3 + r() * 0.8), 0]);
      this.roots(at, next, length * (0.32 + r() * 0.25), width * 0.45, group, g0 + (length * t) / grow, depth - 1, grow);
    }
  }
  /** Leaves round a point, as a little cloud of them. */
  leafCloud(at: V3, radius: number, count: number, group: number, grow: number) {
    const r = this.r;
    for (let k = 0; k < count; k++) {
      const u = r() * 2 - 1;
      const th = r() * Math.PI * 2;
      const d = radius * Math.cbrt(r());
      const q = Math.sqrt(1 - u * u);
      const p = inside(add(at, [Math.cos(th) * q * d, u * d * 0.75, Math.sin(th) * q * d]), true);
      this.leaves.push(p[0], p[1], p[2]);
      this.leafGroup.push(group);
      this.leafGrow.push(Math.min(1, grow + r() * 0.08));
    }
  }
}

/** The tree for these options, where you are standing between what holds and carries you. */
export function growTree(paths: StrategicPath[], answers: Map<string, Answer[]>, constraints: string[], assets: string[]): Tree {
  // Each part grows from a seed of its own (a root from its option, a rootlet from its answer, the crown, a bough, the
  // earth), so writing one more answer grows only that, and nothing else shifts.
  let r = seeded(0);
  const G = new Growth(r);
  const stream = (name: string) => {
    r = seeded(hashOf(name));
    G.r = r;
  };
  stream('taproot');
  const groups = { root: new Map<string, number>(), twig: new Map<string, number>(), bough: new Map<string, number>() };
  const rootOf = new Map<number, number>();
  let next = 2;
  // How far it grows down, and up, measured along it: what `grow` is a share of.
  const DOWN = SPLIT + 52;
  const UP = TREE_H + 3;

  // The taproot: down out of the tree, through the earth, to where it divides.
  const split: V3 = [0.3, -SPLIT, 0.2];
  const taproot = G.jag([0, 0, 0], split, 7, 0.25);
  G.line(taproot, 0.95, 0.75, 1, 0, SPLIT / DOWN, 0);

  // The roots: one per option, toward its own bearing, all as far out as each other; each drawn all the way down,
  // and grown as far as its answers reach.
  const n = Math.max(1, paths.length);
  const roots: OptionRoot[] = paths.map((p, i) => {
    stream(`root:${p.id}`);
    const bearing = (-60 + (i * 360) / n + 360) % 360;
    const h = flat(bearing);
    const fall = DEPTH - SPLIT;
    const guide = bezier(
      split,
      add(add(split, mul(h, REACH * 0.3)), [0, -fall * 0.22, 0]),
      add(add(split, mul(h, REACH * 0.85)), [0, -fall * 0.55, 0]),
      add([h[0] * REACH, -DEPTH, h[2] * REACH], [split[0], 0, split[2]]),
      36,
    );
    // Knocked about sideways only, so it keeps falling and passes each stratum once.
    const side = cross(h, [0, 1, 0]);
    let u = 0;
    let v = 0;
    const curve = guide.map((q, k) => {
      const t = k / (guide.length - 1);
      u = u * 0.6 + (r() - 0.5) * 0.9;
      v = v * 0.6 + (r() - 0.5) * 0.6;
      const env = Math.sin(Math.PI * t) ** 0.7;
      return add(q, add(mul(side, u * env), mul(h, v * env)));
    });
    const g = next++;
    groups.root.set(p.id, g);
    let run = SPLIT;
    for (let k = 1; k < curve.length; k++) {
      const a = curve[k - 1];
      const b = curve[k];
      const seg = len(sub(b, a));
      G.from = b[1];
      // In long dashes: two steps drawn, the third left out, for none of it has happened.
      if (k % 3 !== 0)
        G.line([a, b], 0.62 - 0.52 * ((k - 1) / (curve.length - 1)), 0.62 - 0.52 * (k / (curve.length - 1)), g, run / DOWN, (run + seg) / DOWN, 0);
      run += seg;
      // Fine hairs off it, as a root has.
      for (let m = 0; m < 2; m++) {
        if (r() < 0.35) continue;
        const hair = inside(add(b, add(mul(flat(r() * 360), 0.8 + r() * 1.6), [0, -(0.3 + r() * 1.2), 0])), false);
        G.line(G.jag(b, hair, 3, 0.5), 0.05, 0.02, g, run / DOWN, (run + 1.6) / DOWN, 0, 'dots');
      }
    }
    // Its lesser roots, unnamed: the spread that makes it a root and not a line.
    for (let k = 0; k < 7; k++) {
      const t = 0.06 + (0.86 * (k + r() * 0.6)) / 7;
      const at = curve[Math.round(t * (curve.length - 1))];
      const turn = (r() < 0.5 ? -1 : 1) * (30 + r() * 60);
      const dir = add(flat(bearing + turn), [0, -(0.4 + r() * 0.9), 0]);
      G.from = at[1];
      G.roots(at, dir, (7.5 - 4 * t) * (0.7 + r() * 0.5), 0.26 - 0.16 * t, g, (SPLIT + t * 45) / DOWN, 2, DOWN);
    }
    G.from = 0;
    const reach = reachOf(answers.get(p.id) ?? []);
    const cut = cutAt(reach);
    return { pathId: p.id, code: p.code, bearing, curve, reach, cut, tip: atHeight(curve, cut), levels: LEVELS.map((y) => atHeight(curve, y)) };
  });

  // The rootlets: at each stratum, every answer of that question off the root, spread round it.
  const placed: TreeAnswer[] = [];
  for (const root of roots) {
    const mine = answers.get(root.pathId) ?? [];
    let count = 0;
    BANDS.forEach((band: Band, b) => {
      const list = mine.filter((a) => a.band === band);
      const spread = Math.min(32, 220 / Math.max(1, list.length));
      list.forEach((a, j) => {
        stream(`answer:${a.key}`);
        const from = add(root.levels[b], [0, (j % 2 ? 0.5 : -0.5) * Math.min(1, list.length / 4), 0]);
        G.from = from[1];
        const dir = flat(root.bearing + (j - (list.length - 1) / 2) * spread);
        const reach = 3.4 + r() * 1.8;
        const at = inside(add(add(from, mul(dir, reach)), [0, -(0.3 + r() * 1.6) + (j % 3 === 2 ? 0.9 : 0), 0]), false);
        const g = next++;
        groups.twig.set(a.key, g);
        rootOf.set(g, groups.root.get(root.pathId)!);
        const g0 = (SPLIT + 45 * ((-root.levels[b][1] - SPLIT) / (DEPTH - SPLIT))) / DOWN;
        G.line(G.jag(from, at, 6, 0.4), 0.13, 0.05, g, g0, g0 + reach / DOWN, 0, 'dashes');
        // A hair or two off it.
        for (let k = 0; k < 2; k++) {
          const hair = add(at, [(r() - 0.5) * 1.8, -(0.4 + r()), (r() - 0.5) * 1.8]);
          G.line(G.jag(at, inside(hair, false), 3, 0.5), 0.04, 0.02, g, g0 + reach / DOWN, g0 + (reach + 1.4) / DOWN, 0, 'dots');
        }
        placed.push({ ...a, index: `${root.code}.${++count}`, at, from });
      });
    });
  }
  G.from = 0;

  // A few more roots off the taproot, unnamed.
  stream('taproot:lesser');
  for (let k = 0; k < 6; k++) {
    const dir = add(flat(r() * 360), [0, -(0.3 + r() * 0.8), 0]);
    const at = taproot[2 + Math.floor(r() * (taproot.length - 3))];
    G.roots(at, dir, 5 + r() * 7, 0.2, 0, -at[1] / DOWN, 1, DOWN);
  }

  // The tree above: a slender trunk and a light crown; the boughs that carry you in leaf to one side, those
  // that hold you bare to the other. Drawn grown; the case shows it at the size its roots have reached.
  stream('crown');
  const trunkTop: V3 = [0.25, 6.2, 0.1];
  const trunk = G.jag([0, 0, 0], trunkTop, 8, 0.12);
  G.line(trunk, 0.5, 0.3, 1, 0, 6.2 / UP, 1);
  const leaders: V3[][] = [];
  for (let k = 0; k < 3; k++) {
    const dir = add(mul(flat(k * 120 + 90 + r() * 50), 0.38), [0, 1, 0]);
    const end = inside(add(trunkTop, mul(norm(dir), TREE_H - 6.2 - r() * 2)), true);
    const pts = G.jag(trunkTop, end, 7, 0.22);
    G.line(pts, 0.28, 0.06, 0, 6.2 / UP, end[1] / UP, 1);
    leaders.push(pts);
    G.leafCloud(end, 2.4 + r(), 120, 0, 0.75);
    for (const t of [0.45, 0.75]) {
      const at = pts[Math.round(t * (pts.length - 1))];
      const tip = inside(add(at, add(mul(flat(r() * 360), 1.8 + r() * 1.4), [0, 0.8 + r(), 0])), true);
      G.line(G.jag(at, tip, 4, 0.3), 0.07, 0.03, 0, at[1] / UP, tip[1] / UP, 1);
      G.leafCloud(tip, 1.4 + r() * 0.6, 55, 0, 0.8);
    }
  }
  const boughs: Bough[] = [];
  const side = (list: string[], kind: Bough['side'], centre: number) =>
    list.forEach((text, i) => {
      stream(`${kind}:${i}`);
      const bearing = centre + (i - (list.length - 1) / 2) * Math.min(28, 120 / Math.max(1, list.length));
      // From the trunk or a leader, at a height of its own.
      const h = 2.6 + ((i + 0.5) / Math.max(1, list.length)) * 7.5;
      const from = h < 6.2 ? atHeight(trunk, h) : atHeight(leaders[i % leaders.length], h);
      const end = inside(add(from, add(mul(flat(bearing), 3.2 + r() * 1.4), [0, 1 + r() * 1.3, 0])), true);
      const curve = G.jag(from, end, 6, 0.25);
      const key = `${kind}:${i}`;
      const g = next++;
      groups.bough.set(key, g);
      G.line(curve, 0.14, 0.04, g, from[1] / UP, (from[1] + 4) / UP, 1);
      // Every bough is in leaf, so the tree reads as one tree in leaf: what carries you thickly, what holds you more
      // thinly. Told apart by how full they are, a fact about where you are, not a judgement.
      const full = kind === 'asset';
      G.leafCloud(end, full ? 1.5 : 1.2, full ? 60 : 32, g, (from[1] + 4) / UP);
      G.leafCloud(curve[3], full ? 0.9 : 0.8, full ? 18 : 12, g, (from[1] + 3) / UP);
      boughs.push({ key, side: kind, text, curve, end });
    });
  side(constraints, 'constraint', 180);
  side(assets, 'asset', 0);

  // Grass along the earth's edges and over it, dark against the light.
  stream('grass');
  const blade = (x: number, z: number, g0: number) => {
    const h = 0.3 + r() * 0.6;
    G.line(
      [
        [x, 0, z],
        [x + (r() - 0.5) * 0.4, h, z + (r() - 0.5) * 0.4],
      ],
      0.035,
      0.015,
      0,
      g0,
      g0 + 0.02,
      2,
    );
  };
  for (let k = 0; k < 90; k++) {
    const u = (r() * 2 - 1) * (HALF - 0.3);
    const e = HALF - 0.2 - r() * 0.5;
    const pick = k % 4;
    for (let b = 0; b < 2; b++) {
      const jit = (r() - 0.5) * 0.5;
      if (pick === 0) blade(e, u + jit, r() * 0.4);
      else if (pick === 1) blade(-e, u + jit, r() * 0.4);
      else if (pick === 2) blade(u + jit, e, r() * 0.4);
      else blade(u + jit, -e, r() * 0.4);
    }
  }
  for (let k = 0; k < 70; k++) blade((r() * 2 - 1) * (HALF - 1), (r() * 2 - 1) * (HALF - 1), r() * 0.5);

  // The earth's grain: on its top, and on each side, thicker toward the top.
  stream('earth');
  const dirt: number[] = [];
  const dirtFace: number[] = [];
  for (let k = 0; k < 1800; k++) {
    dirt.push((r() * 2 - 1) * HALF, 0.02, (r() * 2 - 1) * HALF);
    dirtFace.push(0);
  }
  for (let f = 1; f <= 4; f++)
    for (let k = 0; k < 520; k++) {
      const u = (r() * 2 - 1) * HALF;
      const y = -SOIL * r() ** 1.6;
      const at: V3 = f === 1 ? [HALF, y, u] : f === 2 ? [-HALF, y, u] : f === 3 ? [u, y, HALF] : [u, y, -HALF];
      dirt.push(...at);
      dirtFace.push(f);
    }
  // Crumbs fallen through onto the floor under the roots, mostly in a heap at the middle.
  const crumbs: number[] = [];
  for (let k = 0; k < 520; k++) {
    const d = k < 420 ? 2.7 * Math.sqrt(-2 * Math.log(1 - r() * 0.98)) : r() * (HALF - 1);
    const a = r() * Math.PI * 2;
    crumbs.push(Math.max(-HALF + 1, Math.min(HALF - 1, Math.cos(a) * d)), FLOOR + 0.05, Math.max(-HALF + 1, Math.min(HALF - 1, Math.sin(a) * d)));
  }

  // The walls' circuits, under the ground. Above it the walls are left clear: only the tree stands against the light.
  stream('walls');
  const circuits: Circuit[] = [];
  const onWall = (wall: number, u: number, y: number): V3 => {
    const e = HALF - 0.25;
    return wall === 0 ? [e, y, u] : wall === 1 ? [-e, y, -u] : wall === 2 ? [-u, y, e] : [u, y, -e];
  };
  const LOW = FLOOR + 3;
  const HIGH = -SOIL - 1.5;
  for (let wall = 0; wall < 4; wall++) {
    const span = HALF - 1.5;
    for (let k = 0; k < 15; k++) {
      let u = (r() * 2 - 1) * span;
      let y = LOW + r() * (HIGH - LOW);
      const pts: V3[] = [onWall(wall, u, y)];
      const turns = 2 + Math.floor(r() * 3);
      for (let t = 0; t < turns; t++) {
        if (t % 2 === 0) u = Math.max(-span, Math.min(span, u + (r() - 0.5) * 16));
        else y = Math.max(LOW, Math.min(HIGH, y + (r() - 0.5) * 14));
        pts.push(onWall(wall, u, y));
      }
      circuits.push({ wall, kind: 'trace', pts });
      circuits.push({ wall, kind: 'via', pts: [pts[pts.length - 1]] });
    }
    for (let k = 0; k < 5; k++) {
      const u = (r() * 2 - 1) * (span - 3);
      const y = LOW + 2 + r() * (HIGH - LOW - 4);
      const w = 1.4 + r() * 4;
      const h = 1 + r() * 2.6;
      circuits.push({
        wall,
        kind: 'chip',
        pts: [onWall(wall, u, y), onWall(wall, u + w, y), onWall(wall, u + w, y + h), onWall(wall, u, y + h)],
      });
    }
    for (let k = 0; k < 2; k++) {
      const u = (r() * 2 - 1) * (span - 6);
      const y = LOW + r() * (HIGH - LOW - 1);
      const w = 3 + r() * 4;
      const pts: V3[] = [];
      for (let s = 0; s < w; s += 0.28) pts.push(onWall(wall, u + s, y), onWall(wall, u + s, y + 0.55));
      circuits.push({ wall, kind: 'bar', pts });
    }
  }

  // Which leaves of the crown show while it is young; a bough's leaves always do.
  stream('leaves');
  const leafNeed = G.leafGroup.map((g) => (g === 0 ? r() : 0));

  return {
    taproot,
    roots,
    answers: placed,
    boughs,
    verts: new Float32Array(G.verts),
    seg: new Uint32Array(G.seg),
    width: new Float32Array(G.width),
    group: new Uint16Array(G.group),
    grow: new Float32Array(G.grow.map((g) => Math.min(1, g))),
    kind: new Uint8Array(G.kind),
    origin: new Float32Array(G.origin),
    leaves: new Float32Array(G.leaves),
    leafGroup: new Uint16Array(G.leafGroup),
    leafGrow: new Float32Array(G.leafGrow),
    leafNeed: new Float32Array(leafNeed),
    grown: grownOf(roots.map((l) => l.reach)),
    dirt: new Float32Array(dirt),
    dirtFace: new Uint8Array(dirtFace),
    crumbs: new Float32Array(crumbs),
    circuits,
    groups,
    rootOf,
  };
}

/* ---- The camera ------------------------------------------------------------ */

export interface Camera {
  /** Turned about the case (degrees), and looking down on it (degrees). */
  yaw: number;
  pitch: number;
  /** Where the middle of the case is on the screen, and how many pixels a metre is there. */
  cx: number;
  cy: number;
  scale: number;
}
/** How far back the camera stands, in metres: far enough for a little perspective, not a fisheye. */
export const DISTANCE = 160;
/** The height the camera looks at: the middle of the case, so it turns about that. */
export const LOOK_Y = (TOP + FLOOR) / 2;

/** A point on the screen: x, y, its depth (larger is farther), and how much nearness enlarges it. */
export function project(c: Camera, p: V3 | Float32Array, i = 0): [number, number, number, number] {
  const yaw = (c.yaw * Math.PI) / 180;
  const pitch = (c.pitch * Math.PI) / 180;
  const x = p[i];
  const y = p[i + 1] - LOOK_Y;
  const z = p[i + 2];
  const x1 = x * Math.cos(yaw) - z * Math.sin(yaw);
  const z1 = x * Math.sin(yaw) + z * Math.cos(yaw);
  const y2 = y * Math.cos(pitch) + z1 * Math.sin(pitch);
  const z2 = z1 * Math.cos(pitch) - y * Math.sin(pitch);
  const k = DISTANCE / (DISTANCE + z2);
  return [c.cx + x1 * c.scale * k, c.cy - y2 * c.scale * k, z2, k];
}

/** Many points on the screen at once, as `project` would put each: x, y and depth into the arrays given. */
export function projectAll(c: Camera, p: Float32Array, sx: Float32Array, sy: Float32Array, sz: Float32Array) {
  const yaw = (c.yaw * Math.PI) / 180;
  const pitch = (c.pitch * Math.PI) / 180;
  const [cyw, syw, cpt, spt] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  for (let i = 0, n = p.length / 3; i < n; i++) {
    const x = p[i * 3];
    const y = p[i * 3 + 1] - LOOK_Y;
    const z = p[i * 3 + 2];
    const x1 = x * cyw - z * syw;
    const z1 = x * syw + z * cyw;
    const y2 = y * cpt + z1 * spt;
    const z2 = z1 * cpt - y * spt;
    const k = (DISTANCE / (DISTANCE + z2)) * c.scale;
    sx[i] = c.cx + x1 * k;
    sy[i] = c.cy - y2 * k;
    sz[i] = z2;
  }
}

/** Where the camera stands, in the world. */
export function eye(c: Camera): V3 {
  const yaw = (c.yaw * Math.PI) / 180;
  const pitch = (c.pitch * Math.PI) / 180;
  return [-DISTANCE * Math.cos(pitch) * Math.sin(yaw), LOOK_Y + DISTANCE * Math.sin(pitch), -DISTANCE * Math.cos(pitch) * Math.cos(yaw)];
}

/** The yaw that turns a root's bearing out toward you, a little to the right. */
export const faceYaw = (bearing: number) => -30 - bearing;
