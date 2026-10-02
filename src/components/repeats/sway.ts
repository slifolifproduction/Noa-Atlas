/*
 * The strands as living cables. Every point a strand bends through drifts on slow waves of its own, so the strands
 * sway and never settle. A hub (the middle of an area, where its strands are bundled) drifts the same way for every
 * strand through it, so a bundle moves as one cable; the bend near a dot drifts with that dot; and each strand
 * wanders a little on its own, so a bundle's strands part and gather again. Their ends stay on their dots, and the
 * bundles tighten and loosen slowly, as if breathing. Motion only: where a strand starts and ends, and how many there
 * are, never change.
 */

/** What a strand's control point is: one of its ends (fixed), a hub it shares with its bundle, or the bend by a dot. */
export type Ctrl = 'end' | `hub:${string}` | `near:${string}`;

/** How far each kind of point drifts, in the plate's units (the ring's radius is 330). */
export const HUB_DRIFT = 16;
export const NEAR_DRIFT = 5;
export const OWN_DRIFT = 3.5;

const seedOf = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967296;
};

/** A slow wander for one seed at time `t` (ms): two waves on each axis, at frequencies no two seeds share. */
export function drift(seed: number, t: number, amp: number): [number, number] {
  const a = seed * Math.PI * 2;
  const f1 = 0.00031 + seed * 0.00018;
  const f2 = 0.00067 + seed * 0.00021;
  return [
    amp * (0.72 * Math.sin(t * f1 + a) + 0.28 * Math.sin(t * f2 + a * 2.3)),
    amp * (0.72 * Math.cos(t * f1 * 0.83 + a * 1.7) + 0.28 * Math.sin(t * f2 * 1.21 + a * 0.6)),
  ];
}

export interface Cable {
  pts: [number, number][];
  /** For each point: -1 an end, else the seed of what it drifts with. */
  seeds: number[];
  amps: number[];
  /** The strand's own wander, a seed per point. */
  own: number[];
}

/** A strand made ready to sway: its seeds worked out once. */
export function cableOf(key: string, pts: [number, number][], ctrl: Ctrl[]): Cable {
  const mine = seedOf(key);
  return {
    pts,
    seeds: ctrl.map((c) => (c === 'end' ? -1 : seedOf(c))),
    amps: ctrl.map((c) => (c === 'end' ? 0 : c.startsWith('hub:') ? HUB_DRIFT : NEAR_DRIFT)),
    own: ctrl.map((_, i) => (mine + i * 0.137) % 1),
  };
}

/** Where a cable's points are at time `t`. */
export function sway(c: Cable, t: number): [number, number][] {
  return c.pts.map(([x, y], i) => {
    if (c.seeds[i] < 0) return [x, y];
    const [hx, hy] = drift(c.seeds[i], t, c.amps[i]);
    const [ox, oy] = drift(c.own[i], t, OWN_DRIFT);
    return [x + hx + ox, y + hy + oy];
  });
}

/** How tightly the strands are bundled at time `t`: a slow breath about the drawing's own 0.86. */
export const breath = (t: number) => 0.86 + 0.025 * Math.sin(t * 0.00042);
