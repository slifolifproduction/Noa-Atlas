/**
 * The Causes lens as a double helix: a hologram of what seems to affect what.
 *
 * Read from top to bottom. An element sits below everything that may lead to
 * it (ignoring the one step that closes a cycle), so the possible reasons run
 * down the helix like a chain. One strand carries what is inside you (what
 * you hold, what you do and what defines you); the other what surrounds you
 * (conditions, people, resources, places). Each rung is a base pair: the two
 * things at the same step of the chain.
 *
 * Pure geometry, no data: the same functions place the elements, draw the
 * helix flat, and give the space engine the points it projects each frame.
 * Positions are graph units, centres of nodes, with the axis vertical at
 * x = 0. A point on the helix at step u and angle θ is
 *   x = R·sin θ,  y = top + u·step + tilt·R·cos θ,  depth = deep·R·cos θ.
 * The strands are seen from the side (no tilt), so an element never slides
 * level with one on the other strand; its depth is shallower than its width
 * (deep < 1), so turning the camera never lets one step pass another. The
 * rings at the ends are seen from slightly above, as a projector would be.
 */
import type { ID } from '../domain/types';
import type { XY } from '../state/uiStore';

/** 0: inside you (what you hold and do). 1: what surrounds you. */
export type Strand = 0 | 1;

export interface HelixGeometry {
  /** Radius across the screen. */
  R: number;
  /** Graph units between base pairs. */
  step: number;
  /** Room beside the helix for the elements' names. */
  labelRoom: number;
}

export const HELIX_DESKTOP: HelixGeometry = { R: 180, step: 52, labelRoom: 160 };
export const HELIX_PORTRAIT: HelixGeometry = { R: 96, step: 46, labelRoom: 124 };

/** Eight base pairs per turn. No pair sits where the strands cross, so the two ends of a rung never overlap. */
const TWIST = Math.PI / 4;
const PHASE0 = Math.PI / 8;
/** Depth of the helix, per unit of its width. */
const DEEP = 0.55;
/** The end rings, seen slightly from above: how far down their near side sits, per unit of radius. */
const RING_TILT = 0.22;
/** The emitter rings beyond each end, in steps. */
const END_GAP = 1.6;
/** An empty helix still shows its shape. */
const EMPTY_PAIRS = 8;

export interface HelixSpec {
  /** The helix (the default), or the globe drawn about the same axis (graph/globe.ts). */
  kind?: 'helix' | 'globe';
  /** On the globe: the latitude of each step of the chain (radians, north positive), and each area's meridian. */
  bands?: number[];
  meridians?: number[];
  /** On the globe: how far it is turned at rest to face what is chosen (radians). */
  facing?: number;
  /** x of the axis. */
  axis: number;
  /** y of the first base pair's step. */
  top: number;
  step: number;
  /** Base pairs drawn (steps of the chain). */
  pairs: number;
  R: number;
  twist: number;
  phase0: number;
  /** How far down the near side of the strands sits (0: seen from the side). */
  tilt: number;
  /** Depth per unit of radius. */
  deep: number;
  /** Top-left of the backbone's box, graph units; its size. */
  origin: XY;
  width: number;
  height: number;
}

export interface HelixSeat {
  slot: number;
  strand: Strand;
  /** Angle about the axis at rest (radians). */
  phase: number;
  x: number;
  y: number;
  side: 'left' | 'right';
  /** Distance from the axis, when it is not the helix's radius (on the globe, smaller toward the poles). */
  r?: number;
}

export interface HelixMember {
  id: ID;
  strand: Strand;
  /** Tie-break among elements at the same step (area, then name). */
  key: string;
}

export const phaseOf = (spec: Pick<HelixSpec, 'phase0' | 'twist'>, u: number, strand: Strand) => spec.phase0 + u * spec.twist + strand * Math.PI;

/**
 * How far along the chain each element is: 0 for what nothing visible leads
 * to, then one more than the furthest of its causes. A cycle is entered at
 * its most cause-like member (most reasons out, fewest in), so the chain
 * still reads downward and only the step that closes the cycle points up.
 */
export function chainOrder(members: HelixMember[], arrows: [ID, ID][]): ID[] {
  const key = new Map(members.map((m) => [m.id, m.key]));
  const rank = chainRanks(members, arrows);
  const byKey = (a: ID, b: ID) => key.get(a)!.localeCompare(key.get(b)!) || a.localeCompare(b);
  return [...rank.keys()].sort((a, b) => rank.get(a)! - rank.get(b)! || byKey(a, b));
}

/** Each element's step along the chain (see `chainOrder`). */
export function chainRanks(members: HelixMember[], arrows: [ID, ID][]): Map<ID, number> {
  const ids = new Set(members.map((m) => m.id));
  const key = new Map(members.map((m) => [m.id, m.key]));
  const preds = new Map<ID, Set<ID>>(members.map((m) => [m.id, new Set()]));
  const succs = new Map<ID, Set<ID>>(members.map((m) => [m.id, new Set()]));
  for (const [a, b] of arrows) {
    if (a === b || !ids.has(a) || !ids.has(b)) continue;
    preds.get(b)!.add(a);
    succs.get(a)!.add(b);
  }
  const byKey = (a: ID, b: ID) => key.get(a)!.localeCompare(key.get(b)!) || a.localeCompare(b);
  const rank = new Map<ID, number>();
  const remaining = new Set(ids);
  while (remaining.size) {
    let ready = [...remaining].filter((id) => [...preds.get(id)!].every((p) => !remaining.has(p)));
    if (!ready.length) {
      const live = (s: Set<ID>) => [...s].filter((x) => remaining.has(x)).length;
      const score = (id: ID) => live(succs.get(id)!) - live(preds.get(id)!);
      ready = [[...remaining].sort((a, b) => score(b) - score(a) || byKey(a, b))[0]];
    }
    for (const id of ready.sort(byKey)) {
      const before = [...preds.get(id)!].filter((p) => rank.has(p)).map((p) => rank.get(p)!);
      rank.set(id, before.length ? Math.max(...before) + 1 : 0);
      remaining.delete(id);
    }
  }
  return rank;
}

/**
 * Seats on the helix. Each strand fills its steps in chain order; an element
 * never sits level with or above something that may lead to it, so the other
 * strand can pair with it only where nothing joins them.
 */
export function helixLayout(members: HelixMember[], arrows: [ID, ID][], g: HelixGeometry): { seats: Map<ID, HelixSeat>; spec: HelixSpec } {
  const strand = new Map(members.map((m) => [m.id, m.strand]));
  const preds = new Map<ID, ID[]>();
  for (const [a, b] of arrows) if (a !== b && strand.has(a) && strand.has(b)) preds.set(b, [...(preds.get(b) ?? []), a]);
  const next = [0, 0];
  const slot = new Map<ID, number>();
  for (const id of chainOrder(members, arrows)) {
    const s = strand.get(id)!;
    const after = (preds.get(id) ?? []).filter((p) => slot.has(p)).map((p) => slot.get(p)! + 1);
    const at = Math.max(next[s], ...after);
    slot.set(id, at);
    next[s] = at + 1;
  }
  const pairs = members.length ? Math.max(...next) : EMPTY_PAIRS;
  const top = (-(pairs - 1) * g.step) / 2;
  const reach = RING_TILT * g.R * 1.3;
  const width = 2 * (g.R + g.labelRoom);
  const height = (pairs - 1) * g.step + 2 * (END_GAP * g.step + reach + 40);
  const spec: HelixSpec = {
    axis: 0,
    top,
    step: g.step,
    pairs,
    R: g.R,
    twist: TWIST,
    phase0: PHASE0,
    tilt: 0,
    deep: DEEP,
    origin: { x: -width / 2, y: -height / 2 },
    width,
    height,
  };
  const seats = new Map<ID, HelixSeat>();
  for (const [id, at] of slot) {
    const s = strand.get(id)!;
    const phase = phaseOf(spec, at, s);
    const p = helixPoint(spec, at, phase);
    seats.set(id, { slot: at, strand: s, phase, x: p.x, y: p.y, side: Math.sin(phase) >= 0 ? 'right' : 'left' });
  }
  return { seats, spec };
}

/** A point of the helix (graph units) at step u and angle θ, with its depth (toward the viewer is positive). */
export function helixPoint(spec: HelixSpec, u: number, theta: number, r = spec.R, tilt = spec.tilt) {
  return { x: spec.axis + r * Math.sin(theta), y: spec.top + u * spec.step + tilt * r * Math.cos(theta), depth: spec.deep * r * Math.cos(theta) };
}

/* ------------------------------------------------------------ drawing */

/** Carries a graph point at a depth to where it is seen (graph units); `rest` is its depth when the helix is still. */
export type HelixProjector = (x: number, y: number, depth: number, rest: number) => { x: number; y: number; z: number };

const flat: HelixProjector = (x, y, depth) => ({ x, y, z: depth });

export interface HelixDrawing {
  /** Each strand's near and far parts, as SVG paths in the backbone's own coordinates. */
  front: [string, string];
  back: [string, string];
  rungs: string;
  /** Emitter rings at both ends, and the centre line. */
  rings: string;
  axis: string;
  /** The scanning ring, while it sweeps. */
  scan: string;
  /** The projector's light, from the lower rings up to the top one, and where its glow centres. */
  beam: string;
  emitter: XY;
  /** Where the captions sit. */
  lead: XY;
  follow: XY;
  centre: XY;
  strands: [XY & { anchor: 'start' | 'end' }, XY & { anchor: 'start' | 'end' }];
}

const f = (n: number) => n.toFixed(1);

/**
 * The backbone, turned by `sway` radians about its axis and carried through
 * `project` (flat when omitted). `scan` is the step the scanning ring is at.
 */
export function helixDrawing(spec: HelixSpec, sway = 0, project: HelixProjector = flat, scan?: number): HelixDrawing {
  const ox = spec.origin.x;
  const oy = spec.origin.y;
  const at = (u: number, theta: number, r = spec.R, tilt = spec.tilt) => {
    const p = helixPoint(spec, u, theta + sway, r, tilt);
    const q = project(p.x, p.y, p.depth, spec.deep * r * Math.cos(theta));
    return { x: q.x - ox, y: q.y - oy, z: q.z };
  };
  const dot = (p: XY, r: number) => `M${f(p.x - r)} ${f(p.y)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  const first = -1;
  const last = spec.pairs;
  const front: [string, string] = ['', ''];
  const back: [string, string] = ['', ''];
  const samples = Math.ceil((last - first) * 4);
  for (const s of [0, 1] as Strand[]) {
    let prev = at(first, phaseOf(spec, first, s));
    let run: 'front' | 'back' | null = null;
    for (let i = 1; i <= samples; i++) {
      const u = first + ((last - first) * i) / samples;
      const p = at(u, phaseOf(spec, u, s));
      // Near and far halves of each turn are drawn apart; a half that picks up again starts with its own move.
      const side = prev.z + p.z >= 0 ? 'front' : 'back';
      const seg = `${run === side ? '' : `M${f(prev.x)} ${f(prev.y)}`}L${f(p.x)} ${f(p.y)}`;
      if (side === 'front') front[s] += seg;
      else back[s] += seg;
      run = side;
      prev = p;
    }
  }
  // A rung for each step, with a base at each end (an element covers its own) and a mark on the axis.
  let rungs = '';
  for (let u = 0; u < spec.pairs; u++) {
    const a = at(u, phaseOf(spec, u, 0));
    const b = at(u, phaseOf(spec, u, 1));
    rungs += `M${f(a.x)} ${f(a.y)}L${f(b.x)} ${f(b.y)}${dot(a, 2)}${dot(b, 2)}${dot({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, 1.2)}`;
  }
  const ring = (u: number, r: number) => {
    let d = '';
    for (let i = 0; i <= 48; i++) {
      const p = at(u, (i / 48) * Math.PI * 2, r, RING_TILT);
      d += `${i ? 'L' : 'M'}${f(p.x)} ${f(p.y)}`;
    }
    return d;
  };
  const uTop = -END_GAP;
  const uEnd = spec.pairs - 1 + END_GAP;
  const top = spec.R * 1.18;
  const rings = ring(uTop, top) + ring(uEnd, spec.R * 1.3) + ring(uEnd, spec.R * 0.86);
  const a0 = at(uTop, 0, 0);
  const a1 = at(uEnd, 0, 0);
  const axis = `M${f(a0.x)} ${f(a0.y)}L${f(a1.x)} ${f(a1.y)}`;
  const scanning = scan !== undefined && scan >= uTop && scan <= uEnd ? ring(scan, spec.R * 1.1) : '';
  // The light is carried with the helix, so the two never come apart.
  const edge = (u: number, r: number, side: 1 | -1) => at(u, (side * Math.PI) / 2, r, RING_TILT);
  const [bl, br, tr, tl] = [edge(uEnd, spec.R * 1.3, -1), edge(uEnd, spec.R * 1.3, 1), edge(uTop, spec.R * 1.05, 1), edge(uTop, spec.R * 1.05, -1)];
  const beam = `M${f(bl.x)} ${f(bl.y)}L${f(br.x)} ${f(br.y)}L${f(tr.x)} ${f(tr.y)}L${f(tl.x)} ${f(tl.y)}Z`;
  const lift = RING_TILT * spec.R * 1.3 + 20;
  // Each strand is named beside the top ring, on the side where it begins.
  const strandCaption = (s: Strand) => {
    const right = Math.sin(phaseOf(spec, first, s) + sway) >= 0;
    const p = at(uTop, right ? Math.PI / 2 : -Math.PI / 2, top + 14);
    return { x: p.x, y: p.y, anchor: right ? ('start' as const) : ('end' as const) };
  };
  return {
    front,
    back,
    rungs,
    rings,
    axis,
    scan: scanning,
    beam,
    emitter: { x: a1.x, y: a1.y },
    lead: { x: a0.x, y: a0.y - lift },
    follow: { x: a1.x, y: a1.y + lift + 10 },
    centre: at((spec.pairs - 1) / 2, 0, 0),
    strands: [strandCaption(0), strandCaption(1)],
  };
}

/** How far the helix reaches along its axis, ring to ring (graph y). */
export function helixSpan(spec: HelixSpec): { from: number; to: number } {
  if (spec.kind === 'globe') return { from: -spec.R, to: spec.R };
  return { from: spec.top - END_GAP * spec.step, to: spec.top + (spec.pairs - 1 + END_GAP) * spec.step };
}

/** Where the scanning ring is at time t (seconds), in steps; outside the helix while it rests between sweeps. */
export function scanStep(spec: HelixSpec, t: number): number {
  const period = 12;
  const sweep = 8;
  const phase = t % period;
  const from = -END_GAP;
  const to = spec.pairs - 1 + END_GAP;
  return phase > sweep ? to + 10 : from + ((to - from) * phase) / sweep;
}
