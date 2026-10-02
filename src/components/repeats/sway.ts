/*
 * The strands as living cables: the lines themselves move, and never settle.
 *
 * Two motions, one on the other. The cable's course sways: every point it is bundled through drifts on slow waves of
 * its own; a hub (the middle of an area, where its strands are bundled) drifts the same way for every strand through
 * it, so a bundle swings as one; the bend by a dot drifts with that dot; and the bundles tighten and loosen slowly,
 * as if breathing. Along that course, the cable ripples: waves run down it, out from where it starts, with a smaller
 * one running back, each strand at a phase and strength of its own, so the strands of a bundle twine round each other
 * and come apart again. The ripple dies away at both ends, so a cable never leaves its dots.
 *
 * Motion only: which strands there are, and where each starts and ends, never change.
 */

type P = [number, number];

/** What a strand's control point is: one of its ends (fixed), a hub it shares with its bundle, or the bend by a dot. */
export type Ctrl = 'end' | `hub:${string}` | `near:${string}`;

/** How far each kind of point drifts, in the plate's units (the ring's radius is 330). */
export const HUB_DRIFT = 26;
export const NEAR_DRIFT = 9;
export const OWN_DRIFT = 6;
/** How far a cable ripples to either side of its course, at most (before its own strength, at most 1.2). */
export const WAVE = 15;
/** Points a cable is drawn through, along its length. */
const SAMPLES = 36;

const seedOf = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};

/** A slow wander for one seed at time `t` (ms): two waves on each axis, at frequencies no two seeds share. */
export function drift(seed: number, t: number, amp: number): P {
  const a = seed * Math.PI * 2;
  const f1 = 0.00031 + seed * 0.00018;
  const f2 = 0.00067 + seed * 0.00021;
  return [
    amp * (0.72 * Math.sin(t * f1 + a) + 0.28 * Math.sin(t * f2 + a * 2.3)),
    amp * (0.72 * Math.cos(t * f1 * 0.83 + a * 1.7) + 0.28 * Math.sin(t * f2 * 1.21 + a * 0.6)),
  ];
}

export interface Cable {
  pts: P[];
  /** For each point: -1 an end, else the seed of what it drifts with. */
  seeds: number[];
  amps: number[];
  /** The strand's own wander, a seed per point. */
  own: number[];
  /** Its ripple: where in its wave it is, and how strongly it ripples (0.8 to 1.2). */
  phase: number;
  strength: number;
}

/** A strand made ready to move: its seeds worked out once. */
export function cableOf(key: string, pts: P[], ctrl: Ctrl[]): Cable {
  const mine = seedOf(key);
  return {
    pts,
    seeds: ctrl.map((c) => (c === 'end' ? -1 : seedOf(c))),
    amps: ctrl.map((c) => (c === 'end' ? 0 : c.startsWith('hub:') ? HUB_DRIFT : NEAR_DRIFT)),
    own: ctrl.map((_, i) => (mine + i * 0.137) % 1),
    phase: mine * Math.PI * 2,
    strength: 0.8 + 0.4 * seedOf(`${key}~`),
  };
}

/** Where a cable's course runs through at time `t`: its control points, drifted. */
export function sway(c: Cable, t: number): P[] {
  return c.pts.map(([x, y], i) => {
    if (c.seeds[i] < 0) return [x, y];
    const [hx, hy] = drift(c.seeds[i], t, c.amps[i]);
    const [ox, oy] = drift(c.own[i], t, OWN_DRIFT);
    return [x + hx + ox, y + hy + oy];
  });
}

/** How tightly the strands are bundled at time `t`: a slow breath about the drawing's own 0.86. */
export const breath = (t: number) => 0.86 + 0.025 * Math.sin(t * 0.00042);

/**
 * The bundled curve through `points`, as the drawing's `bundle()` draws it (a uniform cubic B-spline, the points first
 * pulled towards the straight line between the ends by `1 - beta`), sampled at about `n` points along it.
 */
export function course(points: P[], beta: number, n = SAMPLES): P[] {
  const m = points.length - 1;
  const [x0, y0] = points[0];
  const [xm, ym] = points[m];
  const p = points.map(([x, y], i): P => [beta * x + (1 - beta) * (x0 + ((xm - x0) * i) / m), beta * y + (1 - beta) * (y0 + ((ym - y0) * i) / m)]);
  if (p.length < 3) return Array.from({ length: n + 1 }, (_, i): P => [p[0][0] + ((p[m][0] - p[0][0]) * i) / n, p[0][1] + ((p[m][1] - p[0][1]) * i) / n]);
  // Its pieces: a short straight start, then a cubic for each span, the last ending on the last point.
  const lerp = (a: P, b: P, k: number): P => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const start: P = [(5 * p[0][0] + p[1][0]) / 6, (5 * p[0][1] + p[1][1]) / 6];
  const cubics: [P, P, P, P][] = [];
  let from = start;
  for (let i = 2; i <= m; i++) {
    const [a, b, c] = [p[i - 2], p[i - 1], p[i]];
    const to: P = [(a[0] + 4 * b[0] + c[0]) / 6, (a[1] + 4 * b[1] + c[1]) / 6];
    cubics.push([from, lerp(a, b, 1 / 3), lerp(a, b, 2 / 3), to]);
    from = to;
  }
  cubics.push([from, lerp(p[m - 1], p[m], 1 / 3), lerp(p[m - 1], p[m], 2 / 3), p[m]]);
  const each = Math.max(2, Math.round(n / cubics.length));
  const out: P[] = [p[0]];
  for (const [a, b, c, d] of cubics)
    for (let k = 1; k <= each; k++) {
      const s = k / each;
      const u = 1 - s;
      out.push([
        u * u * u * a[0] + 3 * u * u * s * b[0] + 3 * u * s * s * c[0] + s * s * s * d[0],
        u * u * u * a[1] + 3 * u * u * s * b[1] + 3 * u * s * s * c[1] + s * s * s * d[1],
      ]);
    }
  out.splice(1, 0, start);
  return out;
}

/** The points a cable is drawn through at time `t`: its course, swayed and bundled, rippling along its length. */
export function cablePoints(c: Cable, t: number): P[] {
  const base = course(sway(c, t), breath(t));
  const last = base.length - 1;
  return base.map((p, i) => {
    if (i === 0 || i === last) return p;
    const s = i / last;
    const [ax, ay] = base[i - 1];
    const [bx, by] = base[i + 1];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    // Out from where it starts, a long wave; back along it, a shorter, slower one.
    const w = 0.66 * Math.sin(Math.PI * 2 * 1.6 * s - t * 0.0012 + c.phase) + 0.34 * Math.sin(Math.PI * 2 * 2.7 * s + t * 0.0007 + c.phase * 1.9);
    const a = WAVE * c.strength * Math.sin(Math.PI * s) ** 1.3 * w;
    return [p[0] - ((by - ay) / len) * a, p[1] + ((bx - ax) / len) * a];
  });
}

/** A smooth line through points (Catmull-Rom, as cubic pieces), as SVG path data. */
export function smooth(pts: P[]): string {
  const f = (v: number) => v.toFixed(1);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const [p1, p2] = [pts[i], pts[i + 1]];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}
