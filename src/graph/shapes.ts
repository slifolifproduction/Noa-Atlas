/**
 * Other shapes for the Map: the twelve constellations of the zodiac.
 *
 * The same atlas, arranged on a figure instead of rings. The person sits on
 * the star nearest the figure's heart and each area of life on another of its
 * stars, as spread out as the figure allows; the figure's lines join them, so
 * the areas' orbits are linked the way the stars are. Each area's elements
 * orbit its star in three rings (what I hold nearest, what I do, what
 * surrounds me farthest), as on the round map. A figure with fewer than nine
 * stars gets points along its longest lines. Areas keep roughly the side of
 * the map they have on the round one.
 *
 * The figure has depth, as the round map does: the person's star nearest,
 * the others the farther back the farther they lie from it (each a little
 * nearer or farther, as real stars are), and each area's elements in front of
 * or behind its star by ring, what I hold nearest and what surrounds me
 * farthest, as the round map's rings are. The space engine shows it through
 * its camera (see space.ts).
 *
 * Only positions change: the records, links, claims and everything read from
 * them are the same, whichever shape is shown.
 */
import { AREA_META, KINDS, layerOf, SECTOR_KEYS, areaHubId, YOU_ID, type OrbitGeometry } from '../domain/constants';
import { mapElements } from '../domain/selectors';
import type { AreaKey, AtlasData, AtlasNode, ID, LayerKey } from '../domain/types';
import type { XY } from '../state/uiStore';
import { FIGURES, type ZodiacKey } from './constellations';
import type { OrbitPlacement } from './layout';
import { t } from '../i18n';

export type MapShape = 'orbit' | ZodiacKey;

/** The constellations' names, as on a star chart. */
export const ZODIAC_NAME: Record<ZodiacKey, () => string> = {
  aries: () => t('Aries'),
  taurus: () => t('Taurus'),
  gemini: () => t('Gemini'),
  cancer: () => t('Cancer'),
  leo: () => t('Leo'),
  virgo: () => t('Virgo'),
  libra: () => t('Libra'),
  scorpio: () => t('Scorpius'),
  sagittarius: () => t('Sagittarius'),
  capricorn: () => t('Capricornus'),
  aquarius: () => t('Aquarius'),
  pisces: () => t('Pisces'),
};

/** How far the figure reaches from its centre, before the geometry's scale (the round map's area markers sit at 800). */
const REACH = 900;
/** Neighbouring stars stay at least this far apart, so their orbits do not run into each other; a thin figure grows to allow it. */
const MIN_GAP = 260;
const MAX_REACH = 1150;
const LAYER_SHARE: Record<LayerKey, number> = { hold: 0.56, do: 0.78, around: 1 };
/** Each star's name sits straight below it (above, for stars above the person); elements keep this many degrees either side of it clear. */
const NAME_BAND = 34;
/** Depth (graph units, toward the viewer) of the person's star, and of the farthest star from it. */
const NEAR_Z = 150;
const FAR_Z = -280;
/** How far each star lies nearer or farther than its distance from the person alone would put it. */
const STAR_SCATTER = 90;
/** Each ring's depth in front of (or behind) its star: what I hold nearest, what surrounds me farthest. */
export const LAYER_Z: Record<LayerKey, number> = { hold: 45, do: 0, around: -60 };
/** A steady fraction from a string, so each figure's stars lie at the same depths every time. */
const steady = (s: string) => {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) / 4294967295;
};

export interface FigureShape {
  key: ZodiacKey;
  /** Every point of the figure: its stars, then points added along its lines. */
  points: XY[];
  /** Brightness per point (visual magnitude; added points have none). */
  mags: (number | null)[];
  lines: number[][];
  /** Each point's depth (graph units, toward the viewer), before the space engine's intensity. */
  depths: number[];
  /** The hub sitting on each point (the person, or an area), if any. */
  seats: (ID | null)[];
  /** Where each area's orbit sits, how far it reaches, and its star's depth. */
  orbits: { at: XY; r: number; z: number }[];
}

export interface ShapePlacement extends OrbitPlacement {
  figure: FigureShape;
  /** Each element's star: it orbits it, and its name faces away from it. */
  hubOf: Record<ID, ID>;
  /** The depth of each hub (its star's) and of each element (its star's, by its ring). */
  depthOf: Record<ID, number>;
}

const KIND_ORDER = Object.fromEntries(KINDS.map((k, i) => [k.key, i]));
const byKind = (a: AtlasNode, b: AtlasNode) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const angleOf = (from: XY, to: XY) => (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
const gap = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);
/** An angle moved out of the band around the name (at `name` degrees), the rest of the circle squeezed to make room. */
const clearOfName = (deg: number, name: number) => {
  const d = ((deg - name + 540) % 360) - 180;
  return name + Math.sign(d || 1) * (NAME_BAND + Math.abs(d) * ((180 - NAME_BAND) / 180));
};

/** The figure's points and lines, with points added along the longest lines until there are enough. */
function withEnoughPoints(key: ZodiacKey, need: number) {
  const f = FIGURES[key];
  const points = f.stars.map(([x, y]) => ({ x, y }));
  const mags: (number | null)[] = [...f.mags];
  const lines = f.lines.map((l) => [...l]);
  while (points.length < need) {
    let best = { line: 0, at: 0, len: -1 };
    lines.forEach((l, li) => {
      for (let i = 0; i < l.length - 1; i++) {
        const len = dist(points[l[i]], points[l[i + 1]]);
        if (len > best.len) best = { line: li, at: i, len };
      }
    });
    const l = lines[best.line];
    const a = points[l[best.at]];
    const b = points[l[best.at + 1]];
    points.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    mags.push(null);
    l.splice(best.at + 1, 0, points.length - 1);
  }
  return { points, mags, lines };
}

export function constellationLayout(data: AtlasData, key: ZodiacKey, g: OrbitGeometry): ShapePlacement {
  const { points: unit, mags, lines } = withEnoughPoints(key, SECTOR_KEYS.length + 1);

  // The person: the point nearest the figure's heart.
  const heart = unit.reduce((s, p) => ({ x: s.x + p.x / unit.length, y: s.y + p.y / unit.length }), { x: 0, y: 0 });
  const you = unit.reduce((best, p, i) => (dist(p, heart) < dist(unit[best], heart) ? i : best), 0);

  // The areas: the points farthest from everything taken so far, brighter stars first among near-equals.
  const taken = [you];
  while (taken.length < SECTOR_KEYS.length + 1) {
    let best = -1;
    let score = -1;
    unit.forEach((p, i) => {
      if (taken.includes(i)) return;
      const d = Math.min(...taken.map((j) => dist(p, unit[j])));
      const s = d * (1 + 0.04 * (6 - (mags[i] ?? 6)));
      if (s > score) [best, score] = [i, s];
    });
    taken.push(best);
  }

  // Life size: the figure's own reach, or more when its stars sit close together.
  const closest = Math.min(...taken.flatMap((i, a) => taken.slice(a + 1).map((j) => dist(unit[i], unit[j]))));
  const reach = Math.min(MAX_REACH, Math.max(REACH, MIN_GAP / closest)) * g.scale;
  const scaled = unit.map((p) => ({ x: p.x * reach * g.x, y: p.y * reach * g.y }));

  // Each area on the star whose direction from the person is closest to its side on the round map.
  const seats = taken.slice(1);
  const areas = [...SECTOR_KEYS].sort((a, b) => AREA_META[a].angle - AREA_META[b].angle);
  const ordered = [...seats].sort((a, b) => angleOf(scaled[you], scaled[a]) - angleOf(scaled[you], scaled[b]));
  let shift = 0;
  let least = Infinity;
  for (let s = 0; s < ordered.length; s++) {
    const cost = areas.reduce((sum, area, i) => sum + gap(AREA_META[area].angle, angleOf(scaled[you], scaled[ordered[(i + s) % ordered.length]])), 0);
    if (cost < least) [least, shift] = [cost, s];
  }
  const seatOf = new Map<AreaKey, number>([['self', you], ...areas.map((a, i): [AreaKey, number] => [a, ordered[(i + shift) % ordered.length]])]);

  // Recentre on the person, so the round map's centre and this one agree.
  const origin = scaled[you];
  const points = scaled.map((p) => ({ x: p.x - origin.x, y: p.y - origin.y }));

  const positions: Record<ID, XY> = {};
  const hubOf: Record<ID, ID> = {};
  const depthOf: Record<ID, number> = {};
  const orbits: FigureShape['orbits'] = [];
  const hubId = (area: AreaKey) => (area === 'self' ? YOU_ID : areaHubId(area));
  // Depth: the person's star nearest, the farther from it the farther back, each a little off.
  const far = Math.max(...points.map((p) => Math.hypot(p.x, p.y))) || 1;
  const depths = points.map((p, i) =>
    i === you ? NEAR_Z : NEAR_Z + (FAR_Z - NEAR_Z) * (Math.hypot(p.x, p.y) / far) ** 0.85 + (steady(`${key}:${i}`) - 0.5) * STAR_SCATTER,
  );
  const seatIds: (ID | null)[] = points.map(() => null);
  const elements = mapElements(data);
  for (const [area, seat] of seatOf) {
    const at = points[seat];
    positions[hubId(area)] = at;
    seatIds[seat] = hubId(area);
    depthOf[hubId(area)] = depths[seat];
    // An orbit reaches a little under halfway to the nearest other star, within bounds.
    const room = Math.min(...[...seatOf.values()].filter((s) => s !== seat).map((s) => dist(at, points[s])));
    const r = Math.max(100 * g.scale, Math.min(220 * g.scale, room * 0.46));
    orbits.push({ at, r, z: depths[seat] });
    // Open the orbit away from the person, so it leans outward like the round map, and keep clear of the star's name.
    const facing = seat === you ? 270 : angleOf({ x: 0, y: 0 }, at);
    const name = seat === you || at.y > 0 ? 90 : 270;
    const mine = elements.filter((n) => n.area === area);
    const byLayer: Record<LayerKey, AtlasNode[]> = { hold: [], do: [], around: [] };
    for (const n of mine) byLayer[layerOf(n.kind)].push(n);
    for (const layer of Object.keys(byLayer) as LayerKey[]) {
      const list = byLayer[layer].sort(byKind);
      const step = list.length > 0 ? Math.min(46, 330 / list.length) : 0;
      list.forEach((n, i) => {
        const a = (clearOfName(facing + (i - (list.length - 1) / 2) * step, name) * Math.PI) / 180;
        const rr = r * LAYER_SHARE[layer];
        positions[n.id] = { x: at.x + rr * Math.cos(a), y: at.y + rr * Math.sin(a) };
        hubOf[n.id] = hubId(area);
        depthOf[n.id] = depths[seat] + LAYER_Z[layer];
      });
    }
  }
  return { positions, inward: new Set(), hubOf, depthOf, figure: { key, points, mags, lines, depths, seats: seatIds, orbits } };
}
