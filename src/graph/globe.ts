/**
 * The Causes lens as a globe: the same possible reasons, on a turning sphere.
 *
 * Latitude is the step along the chain, as on the helix read top to bottom:
 * what nothing visible leads to sits farthest north, and each element sits
 * south of everything that may lead to it (the one step that closes a cycle
 * aside). Longitude is the area of life, as angle is on the Map: you face the
 * viewer at rest, and the seven areas take the other meridians in the Map's
 * order. Elements at the same step and area spread along their parallel.
 *
 * The globe is drawn about the helix's vertical axis with the same seat
 * model (an angle about the axis, a height and a distance from the axis), so
 * the space engine turns both the same way; the globe turns all the way
 * round, slowly, and stops to face what you choose. It is tipped a little
 * toward the viewer, so its north pole shows. Positions are graph units,
 * centres of nodes, centred on the globe's middle.
 */
import type { ID } from '../domain/types';
import type { XY } from '../state/uiStore';
import { chainRanks, type HelixMember, type HelixProjector, type HelixSeat, type HelixSpec } from './helix';

export interface GlobeGeometry {
  R: number;
  /** Room beside the globe for the elements' names. */
  labelRoom: number;
}

export const GLOBE_DESKTOP: GlobeGeometry = { R: 330, labelRoom: 170 };
export const GLOBE_PORTRAIT: GlobeGeometry = { R: 172, labelRoom: 110 };

/** How far the globe is tipped toward the viewer (radians). */
const TIP = (20 * Math.PI) / 180;
/** The first and last steps stay this far from the poles. */
const LAT_MAX = (56 * Math.PI) / 180;
/** Neighbours on a parallel stay at least this far apart (graph units, before the phone's scale). */
const GAP = 92;
/** Depth of the globe, per unit of its width. */
const DEEP = 0.8;

export interface GlobeMember extends HelixMember {
  /** The meridian it would sit on: its area's. */
  lon: number;
}

const TAU = Math.PI * 2;
const wrap = (a: number) => ((((a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;

/** You face the viewer at rest; the seven areas take the other meridians, in the Map's order. */
export function areaMeridian(index: number, count: number): number {
  return index < 0 ? 0 : wrap(((index + 1) * TAU) / (count + 1));
}

/** Latitude of a step of the chain. */
const latitude = (rank: number, last: number) => (last > 0 ? LAT_MAX - (rank * 2 * LAT_MAX) / last : 0);

export function globeLayout(
  members: GlobeMember[],
  arrows: [ID, ID][],
  g: GlobeGeometry,
  meridians: number[] = [],
  /** An element to face the viewer at rest (what is chosen); otherwise you face it. */
  face?: ID,
): { seats: Map<ID, HelixSeat>; spec: HelixSpec } {
  const rank = chainRanks(members, arrows);
  const last = Math.max(0, ...rank.values());
  const bands = Array.from({ length: last + 1 }, (_, r) => latitude(r, last));
  const width = 2 * (g.R + g.labelRoom);
  const height = 2 * g.R + 150;
  const spec: HelixSpec = {
    kind: 'globe',
    bands,
    meridians,
    axis: 0,
    top: 0,
    step: 0,
    pairs: last + 1,
    R: g.R,
    twist: 0,
    phase0: 0,
    tilt: Math.sin(TIP),
    deep: DEEP,
    origin: { x: -width / 2, y: -height / 2 },
    width,
    height,
  };

  const placed = new Map<ID, { slot: number; strand: HelixMember['strand']; lat: number; lon: number }>();
  const scale = g.R / GLOBE_DESKTOP.R;
  const spacing = last > 0 ? bands[0] - bands[1] : 0.5;
  for (let r = 0; r <= last; r++) {
    const band = members.filter((m) => rank.get(m.id) === r).sort((a, b) => a.lon - b.lon || a.key.localeCompare(b.key) || a.id.localeCompare(b.id));
    if (!band.length) continue;
    // Along the parallel, from each one's own meridian, pushed apart just enough to stay readable;
    // a crowded step also alternates a little north and south of its parallel.
    const ring = g.R * Math.cos(bands[r]);
    const gap = Math.min((GAP * scale) / Math.max(ring, 1), TAU / band.length);
    const at = band.map((m) => m.lon);
    for (let i = 1; i < at.length; i++) at[i] = Math.max(at[i], at[i - 1] + gap);
    const shift = at.reduce((s, a, i) => s + a - band[i].lon, 0) / at.length;
    const stagger = band.length > 2 ? spacing * 0.24 : 0;
    band.forEach((m, i) => placed.set(m.id, { slot: r, strand: m.strand, lat: bands[r] + (i % 2 ? -stagger : stagger / 2), lon: wrap(at[i] - shift) }));
  }
  // At rest the globe faces what is chosen (you, otherwise): everything turns by the same angle.
  const facing = face && placed.has(face) ? -placed.get(face)!.lon : 0;
  spec.facing = facing;
  spec.meridians = meridians.map((m) => wrap(m + facing));
  const seats = new Map<ID, HelixSeat>();
  for (const [id, s] of placed) {
    const phase = wrap(s.lon + facing);
    const p = globePoint(spec, s.lat, phase);
    seats.set(id, { slot: s.slot, strand: s.strand, phase, x: p.x, y: p.y, side: Math.sin(phase) >= 0 ? 'right' : 'left', r: g.R * Math.cos(s.lat) });
  }
  return { seats, spec };
}

/** A point on the globe at latitude `lat` and angle `theta` about the axis, with its depth (toward the viewer is positive). */
export function globePoint(spec: HelixSpec, lat: number, theta: number, R = spec.R) {
  const r = R * Math.cos(lat);
  return {
    x: spec.axis + r * Math.sin(theta),
    y: -R * Math.sin(lat) * Math.cos(TIP) + spec.tilt * r * Math.cos(theta),
    depth: spec.deep * r * Math.cos(theta),
  };
}

/** The latitude of a step of the chain, between and beyond the bands (the scanning ring's path). */
function latitudeAt(spec: HelixSpec, step: number): number {
  const bands = spec.bands ?? [0];
  if (bands.length < 2) return Math.max(-Math.PI / 2, Math.min(Math.PI / 2, -step * 0.4));
  const per = bands[0] - bands[1];
  return Math.max(-Math.PI / 2 + 0.02, Math.min(Math.PI / 2 - 0.02, bands[0] - step * per));
}

/* ------------------------------------------------------------ drawing */

export interface GlobeDrawing {
  /** Graticule and outline, near and far halves apart. */
  front: string;
  back: string;
  equatorFront: string;
  equatorBack: string;
  /** The rim, and the band each step of the chain sits on. */
  limb: string;
  bands: string;
  axis: string;
  scan: string;
  lead: XY;
  follow: XY;
  centre: XY;
  /** Where each area's name sits on the equator, and how much of it faces the viewer (0 to 1). */
  areas: (XY & { facing: number })[];
}

const f = (n: number) => n.toFixed(1);
const flat: HelixProjector = (x, y, depth) => ({ x, y, z: depth });

/**
 * The globe, turned by `spin` radians about its axis and carried through
 * `project` (flat when omitted). `scan` is the step the scanning ring is at.
 */
export function globeDrawing(spec: HelixSpec, spin = 0, project: HelixProjector = flat, scan?: number): GlobeDrawing {
  const ox = spec.origin.x;
  const oy = spec.origin.y;
  const at = (lat: number, theta: number, R = spec.R) => {
    const p = globePoint(spec, lat, theta + spin, R);
    const q = project(p.x, p.y, p.depth, spec.deep * R * Math.cos(lat) * Math.cos(theta));
    return { x: q.x - ox, y: q.y - oy, z: p.depth };
  };
  // A line over the globe, sampled, with its near and far halves drawn apart.
  const line = (points: (i: number) => { x: number; y: number; z: number }, samples: number, out: { front: string; back: string }) => {
    let prev = points(0);
    let run: 'front' | 'back' | null = null;
    for (let i = 1; i <= samples; i++) {
      const p = points(i);
      const side = prev.z + p.z >= 0 ? 'front' : 'back';
      const seg = `${run === side ? '' : `M${f(prev.x)} ${f(prev.y)}`}L${f(p.x)} ${f(p.y)}`;
      out[side] += seg;
      run = side;
      prev = p;
    }
  };
  const grid = { front: '', back: '' };
  const HALF = Math.PI / 2;
  for (let m = 0; m < 12; m++) {
    const theta = (m * TAU) / 12;
    line((i) => at(-HALF + (i / 24) * Math.PI, theta), 24, grid);
  }
  for (const lat of [-60, -30, 30, 60].map((d) => (d * Math.PI) / 180)) line((i) => at(lat, (i / 48) * TAU), 48, grid);
  const equator = { front: '', back: '' };
  line((i) => at(0, (i / 64) * TAU), 64, equator);

  // The rim: the globe's outline as seen, a circle in the plane through its middle.
  let limb = '';
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * TAU;
    const q = project(spec.axis + spec.R * Math.cos(a), spec.R * Math.sin(a), 0, 0);
    limb += `${i ? 'L' : 'M'}${f(q.x - ox)} ${f(q.y - oy)}`;
  }
  // Each step of the chain's parallel, faintly, on the near side.
  const steps = { front: '', back: '' };
  for (const lat of spec.bands ?? []) line((i) => at(lat, (i / 48) * TAU), 48, steps);

  const n = at(HALF, 0);
  const s = at(-HALF, 0);
  const reach = 0.16 * spec.R;
  const dx = (n.x - s.x) / (2 * spec.R);
  const dy = (n.y - s.y) / (2 * spec.R);
  const axis = `M${f(n.x + dx * reach)} ${f(n.y + dy * reach)}L${f(s.x - dx * reach)} ${f(s.y - dy * reach)}`;
  // The scanning ring sweeps from north to south, as the helix's does from cause to effect.
  let scanPath = '';
  if (scan !== undefined && spec.bands?.length && scan >= -1.6 && scan <= spec.pairs + 0.6) {
    const ring = { front: '', back: '' };
    line((i) => at(latitudeAt(spec, scan), (i / 48) * TAU), 48, ring);
    scanPath = ring.front;
  }
  const areas = (spec.meridians ?? []).map((lon) => {
    const p = at(0.05, lon, spec.R * 1.02);
    const facing = Math.cos(lon + spin);
    return { x: p.x, y: p.y, facing: Math.max(0, Math.min(1, (facing - 0.15) / 0.6)) };
  });
  return {
    front: grid.front,
    back: grid.back,
    equatorFront: equator.front,
    equatorBack: equator.back,
    limb,
    bands: steps.front,
    axis,
    scan: scanPath,
    lead: { x: n.x + dx * (reach + 20), y: n.y + dy * (reach + 20) - 8 },
    follow: { x: s.x - dx * (reach + 20), y: s.y - dy * (reach + 20) + 16 },
    centre: at(0, 0, 0),
    areas,
  };
}
