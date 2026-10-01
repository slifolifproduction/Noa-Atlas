import type { StrategicPath } from '../../domain/types';
import { BANDS, type Answer, type Band } from './answers';

/*
 * Ahead as a world tree, surveyed: a 3D scan of it, as points, drawn like an
 * architect's plate.
 *
 * Where you are is the ground it stands on and the base of its trunk; what
 * holds you (constraints) and what carries you (assets) are its roots, run out
 * along the ground to either side. The trunk splits into a limb for every
 * option, each grown out toward its own bearing, as on a compass, and all as
 * long and as high as each other, for nothing here is ranked. Every option is
 * asked the same four questions, at four levels up the tree, cut as sections
 * (what it needs lowest, then the skills it takes, what it costs, and what is
 * not known yet at the crown); where a limb passes a level, its answers branch
 * off it as twigs, one bud per answer. Reading round a level compares the
 * options; reading up a limb reads one.
 *
 * Units are metres of the drawing: the ground is at 0, y is up.
 */

export type V3 = [number, number, number];

/** The fork, where the trunk splits; the crown's height; how far a limb reaches out; the scanned ground's radius. */
export const FORK_Y = 12;
export const CROWN_Y = 44;
const REACH = 14;
export const GROUND_R = 22;
/** The four sections, as shares of the way from the fork to the crown. */
const LEVEL_AT = [0.2, 0.42, 0.64, 0.86];
export const LEVELS: number[] = LEVEL_AT.map((s) => FORK_Y + (CROWN_Y - FORK_Y) * s);

export interface TreeAnswer extends Answer {
  /** Its number on the plate: the option's letter and its place. */
  index: string;
  /** Its bud, and where its twig leaves the limb. */
  at: V3;
  from: V3;
}
export interface Limb {
  pathId: string;
  code: string;
  /** The way it grows out, in degrees (0 = east, 90 = south, as the plate's compass reads). */
  bearing: number;
  curve: V3[];
  tip: V3;
  /** Where it passes each section. */
  levels: V3[];
}
export interface Root {
  key: string;
  side: 'constraint' | 'asset';
  text: string;
  curve: V3[];
  end: V3;
}
export interface Tree {
  trunk: V3[];
  limbs: Limb[];
  answers: TreeAnswer[];
  roots: Root[];
  /** The scan: xyz per point, its group (see `groups`), and how bright it is at rest. */
  points: Float32Array;
  group: Uint16Array;
  weight: Float32Array;
  /** Group ids: 0 the ground, 1 the trunk, then each limb, each twig and each root. */
  groups: { limb: Map<string, number>; twig: Map<string, number>; root: Map<string, number> };
  /** A twig's limb, for lighting a whole option at once. */
  limbOf: Map<number, number>;
}

/** A small seeded random, so the same atlas scans the same way every time. */
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

/** A cubic curve through four points, as `n` + 1 points. */
function bezier(p0: V3, p1: V3, p2: V3, p3: V3, n: number): V3[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return add(add(mul(p0, u * u * u), mul(p1, 3 * u * u * t)), add(mul(p2, 3 * u * t * t), mul(p3, t * t * t)));
  });
}
/** Where a rising curve passes height `y`. */
function atHeight(curve: V3[], y: number): V3 {
  for (let i = 1; i < curve.length; i++) {
    const [a, b] = [curve[i - 1], curve[i]];
    if ((a[1] - y) * (b[1] - y) <= 0) {
      const t = (y - a[1]) / (b[1] - a[1] || 1);
      return add(a, mul(sub(b, a), t));
    }
  }
  return curve[curve.length - 1];
}

/** The scan's points, gathered as they are made. */
class Cloud {
  xyz: number[] = [];
  g: number[] = [];
  w: number[] = [];
  constructor(readonly r: () => number) {}
  point(p: V3, group: number, weight: number) {
    this.xyz.push(p[0], p[1], p[2]);
    this.g.push(group);
    this.w.push(weight);
  }
  /**
   * A branch as a scanned tube: rings of points round the curve, its radius
   * from `r0` to `r1` (a function of how far along), the bark rough, a few
   * flakes off it as a real scan has.
   */
  tube(curve: V3[], radius: (t: number) => number, group: number, weight: number, density = 1) {
    const r = this.r;
    let total = 0;
    for (let i = 1; i < curve.length; i++) total += len(sub(curve[i], curve[i - 1]));
    let run = 0;
    for (let i = 1; i < curve.length; i++) {
      const [a, b] = [curve[i - 1], curve[i]];
      const seg = len(sub(b, a));
      const T = norm(sub(b, a));
      const N = norm(cross(T, Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]));
      const B = cross(T, N);
      const steps = Math.max(1, Math.round(seg / 0.32));
      for (let s = 0; s < steps; s++) {
        const f = s / steps;
        const at = add(a, mul(sub(b, a), f));
        const rad = radius((run + seg * f) / (total || 1));
        const count = Math.max(3, Math.round(((2 * Math.PI * rad) / 0.42) * density));
        for (let k = 0; k < count; k++) {
          const th = ((k + r() * 0.8) / count) * Math.PI * 2;
          const rr = rad * (0.86 + r() * 0.26) + (r() < 0.03 ? r() * rad * 0.9 : 0);
          const off = add(mul(N, Math.cos(th) * rr), mul(B, Math.sin(th) * rr));
          const along = mul(T, (r() - 0.5) * 0.3);
          // The side away from the scanner is caught less: fewer, dimmer points underneath.
          const lit = 0.75 + 0.25 * Math.sin(th);
          this.point(add(add(at, off), along), group, weight * lit);
        }
      }
      run += seg;
    }
  }
}

/** The tree for these options, where you are standing among what holds and carries you. */
export function growTree(paths: StrategicPath[], answers: Map<string, Answer[]>, constraints: string[], assets: string[]): Tree {
  const seed = hashOf(paths.map((p) => p.id).join('|') + '#' + constraints.length + '#' + assets.length);
  const r = seeded(seed);
  const cloud = new Cloud(r);
  const groups = { limb: new Map<string, number>(), twig: new Map<string, number>(), root: new Map<string, number>() };
  const limbOf = new Map<number, number>();
  let next = 2;

  // The trunk: out of the ground, leaning a little, flared at its foot.
  const fork: V3 = [0.5, FORK_Y, -0.3];
  const trunk = bezier([0, -0.4, 0], [0.4, 4, 0.3], [-0.3, 8.5, -0.5], fork, 26);
  cloud.tube(trunk, (t) => 1.25 + 0.55 * (1 - t) + 1.6 * (1 - t) ** 6, 1, 0.62);

  // The limbs: one per option, toward its own bearing, all alike in reach and height.
  const n = Math.max(1, paths.length);
  const limbs: Limb[] = paths.map((p, i) => {
    const bearing = (-60 + (i * 360) / n + 360) % 360;
    const h = flat(bearing);
    const rise = CROWN_Y - FORK_Y;
    // Out first, then up: the vase of a great tree's crown.
    const curve = bezier(
      add(fork, mul(h, 0.4)),
      add(add(fork, mul(h, REACH * 0.5)), [0, rise * 0.14, 0]),
      add(add(fork, mul(h, REACH * 0.9)), [0, rise * 0.52, 0]),
      add(add(fork, mul(h, REACH)), [0, rise, 0]),
      44,
    );
    const g = next++;
    groups.limb.set(p.id, g);
    cloud.tube(curve, (t) => 1.05 - 0.85 * t, g, 0.6);
    // Its lesser branches, unnamed, and their leaves: the crown's volume, lit with the limb.
    const leaves = (at: V3, radius: number, count: number) => {
      for (let k = 0; k < count; k++) {
        const u = r() * 2 - 1;
        const th = r() * Math.PI * 2;
        const d = radius * Math.cbrt(r());
        const q = Math.sqrt(1 - u * u);
        cloud.point(add(at, [Math.cos(th) * q * d, u * d * 0.7, Math.sin(th) * q * d]), g, 0.2 + r() * 0.22);
      }
    };
    for (const [along, turn, length] of [
      [0.34, -48, 6.5],
      [0.56, 44, 7.5],
      [0.78, -30, 5.5],
      [0.9, 28, 4.5],
    ] as const) {
      const from = curve[Math.round(along * (curve.length - 1))];
      const dir = add(flat(bearing + turn * (0.8 + r() * 0.4)), [0, 0.7 + r() * 0.5, 0]);
      const end = add(from, mul(norm(dir), length * (0.85 + r() * 0.3)));
      const branch = bezier(from, add(from, mul(dir, length * 0.3)), add(end, [0, -0.8, 0]), end, 12);
      cloud.tube(branch, (t) => 0.42 - 0.32 * t, g, 0.42, 0.8);
      for (let k = 0; k < 2; k++) {
        const at = branch[6 + k * 4];
        const tip = add(add(at, mul(flat(bearing + turn + (k ? 50 : -50) + r() * 30), 1.8 + r() * 1.4)), [0, 1 + r() * 1.2, 0]);
        cloud.tube(bezier(at, at, tip, tip, 5), (t) => 0.16 - 0.1 * t, g, 0.36, 0.8);
        leaves(tip, 1.4 + r(), 26);
      }
      leaves(end, 2.2 + r() * 1.2, 70);
    }
    leaves(curve[curve.length - 1], 3.4, 150);
    return { pathId: p.id, code: p.code, bearing, curve, tip: curve[curve.length - 1], levels: LEVELS.map((y) => atHeight(curve, y)) };
  });

  // The twigs: at each section, every answer of that question off the limb, spread round it.
  const placed: TreeAnswer[] = [];
  for (const limb of limbs) {
    const mine = answers.get(limb.pathId) ?? [];
    let count = 0;
    BANDS.forEach((band: Band, b) => {
      const list = mine.filter((a) => a.band === band);
      const spread = Math.min(30, 160 / Math.max(1, list.length));
      list.forEach((a, j) => {
        const from = add(limb.levels[b], [0, (j % 2 ? 0.5 : -0.5) * Math.min(1, list.length / 4), 0]);
        const dir = flat(limb.bearing + (j - (list.length - 1) / 2) * spread);
        const reach = 3 + r() * 1.6;
        const at = add(add(from, mul(dir, reach)), [0, 0.6 + r() * 1.8 - (j % 3 === 2 ? 1.4 : 0), 0]);
        const mid = add(add(from, mul(dir, reach * 0.5)), [0, 0.9, 0]);
        const g = next++;
        groups.twig.set(a.key, g);
        limbOf.set(g, groups.limb.get(limb.pathId)!);
        cloud.tube(bezier(from, mid, mid, at, 8), (t) => 0.2 - 0.13 * t, g, 0.66, 0.9);
        placed.push({ ...a, index: `${limb.code}.${++count}`, at, from });
      });
    });
  }

  // The roots: what holds you to one side, what carries you to the other, along the ground; and a few more, unnamed.
  const roots: Root[] = [];
  const root = (deg: number, length: number, group: number, weight: number) => {
    const h = flat(deg);
    const curve = bezier(
      add(mul(h, 1.3), [0, 0.5, 0]),
      add(mul(h, 3.4), [0, -0.1, 0]),
      add(mul(h, length * 0.6), [0, -0.35, 0]),
      add(mul(h, length), [0, -0.1, 0]),
      22,
    );
    cloud.tube(curve, (t) => 0.7 - 0.6 * t, group, weight, 0.85);
    return curve;
  };
  const side = (list: string[], kind: Root['side'], centre: number) =>
    list.forEach((text, i) => {
      const deg = centre + (i - (list.length - 1) / 2) * Math.min(26, 110 / Math.max(1, list.length));
      const key = `${kind}:${i}`;
      const g = next++;
      groups.root.set(key, g);
      const curve = root(deg, 10 + r() * 5, g, 0.6);
      roots.push({ key, side: kind, text, curve, end: curve[curve.length - 1] });
    });
  side(constraints, 'constraint', 180);
  side(assets, 'asset', 0);
  for (let i = 0; i < 7; i++) root(r() * 360, 5 + r() * 6, 0, 0.42);

  // The ground, scanned round it: dense near the trunk, thinning out to the edge of the survey.
  for (let i = 0; i < 4200; i++) {
    const d = GROUND_R * Math.sqrt(r()) ** 1.25;
    const a = r() * Math.PI * 2;
    const y = (r() - 0.5) * 0.25 + 0.3 * Math.exp(-d / 3) * r();
    cloud.point([Math.cos(a) * d, y, Math.sin(a) * d], 0, 0.36 * (1 - (d / GROUND_R) ** 3));
  }

  return {
    trunk,
    limbs,
    answers: placed,
    roots,
    points: new Float32Array(cloud.xyz),
    group: new Uint16Array(cloud.g),
    weight: new Float32Array(cloud.w),
    groups,
    limbOf,
  };
}

/* ---- The camera ------------------------------------------------------------ */

export interface Camera {
  /** Turned about the trunk (degrees), and looking down on it (degrees). */
  yaw: number;
  pitch: number;
  /** Where the trunk's foot is on the screen, and how many pixels a metre is at the trunk. */
  cx: number;
  cy: number;
  scale: number;
}
/** How far back the camera stands, in metres: far enough for a little perspective, not a fisheye. */
export const DISTANCE = 110;
/** The height the camera looks at, so it turns about the middle of the tree. */
const LOOK_Y = 20;

/** A point of the tree on the screen: x, y, its depth (larger is farther), and how large it is there. */
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
  return [c.cx + x1 * c.scale * k, c.cy - (y2 + LOOK_Y * Math.cos(pitch)) * c.scale * k, z2, k];
}

/** The yaw that turns a limb's bearing out toward you, a little to the right. */
export const faceYaw = (bearing: number) => -30 - bearing;

/** Every point of the scan on the screen at once, as `project` would put each: x, y and depth into the arrays given. */
export function projectAll(c: Camera, p: Float32Array, step: number, sx: Float32Array, sy: Float32Array, sz: Float32Array) {
  const yaw = (c.yaw * Math.PI) / 180;
  const pitch = (c.pitch * Math.PI) / 180;
  const [cyw, syw, cpt, spt] = [Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)];
  const lift = LOOK_Y * cpt;
  for (let i = 0, n = p.length / 3; i < n; i += step) {
    const x = p[i * 3];
    const y = p[i * 3 + 1] - LOOK_Y;
    const z = p[i * 3 + 2];
    const x1 = x * cyw - z * syw;
    const z1 = x * syw + z * cyw;
    const y2 = y * cpt + z1 * spt;
    const z2 = z1 * cpt - y * spt;
    const k = (DISTANCE / (DISTANCE + z2)) * c.scale;
    sx[i] = c.cx + x1 * k;
    sy[i] = c.cy - (y2 + lift) * k;
    sz[i] = z2;
  }
}
