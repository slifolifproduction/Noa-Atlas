/**
 * Deterministic layouts. Positions are node centres (the canvas uses a
 * centred node origin). Stored positions always win, so anything the user
 * dragged stays put; these functions only place nodes that have no position.
 *
 * Orbit reads as a chart of one life: angle is the area of life, distance
 * from the centre is the layer (what I hold, what I do, what surrounds me),
 * and the person sits in the middle with what defines them close around.
 */
import {
  AREA_MARKER_RADIUS,
  AREA_META,
  CORE_RADIUS,
  KINDS,
  LAYER_RADII,
  layerOf,
  ORBIT_DESKTOP,
  SECTOR_KEYS,
  areaHubId,
  YOU_ID,
  type OrbitGeometry,
} from '../domain/constants';
import { mapElements } from '../domain/selectors';
import type { AreaKey, AtlasData, AtlasNode, ID, LayerKey } from '../domain/types';
import type { XY } from '../state/uiStore';

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number): XY => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });

/** How much of its sector an area's elements may use, in degrees (a sector is ~51°). */
const SECTOR_SPREAD = 40;
/** Alternate elements sit a little inside and outside their ring, so labels can alternate too. */
const STAGGER = 26;
/** The centre's elements leave the bottom free for the person's name. */
const CORE_ARC = 300;

export function hubPosition(key: AreaKey, g: OrbitGeometry = ORBIT_DESKTOP): XY {
  if (key === 'self') return { x: 0, y: 0 };
  const p = polar(AREA_MARKER_RADIUS * g.scale, AREA_META[key].angle);
  return { x: p.x * g.x, y: p.y * g.y };
}

const KIND_ORDER = Object.fromEntries(KINDS.map((k, i) => [k.key, i]));
const byKind = (a: AtlasNode, b: AtlasNode) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);

export interface OrbitPlacement {
  positions: Record<ID, XY>;
  /** Elements on the inner side of their ring: their labels face the centre. */
  inward: Set<ID>;
}

export function orbitLayout(data: AtlasData, g: OrbitGeometry = ORBIT_DESKTOP): OrbitPlacement {
  const positions: Record<ID, XY> = { [YOU_ID]: { x: 0, y: 0 } };
  const inward = new Set<ID>();
  for (const key of SECTOR_KEYS) positions[areaHubId(key)] = hubPosition(key, g);
  const elements = mapElements(data);

  // The centre: what defines the person, all the way round except the bottom.
  const core = elements.filter((n) => n.area === 'self').sort(byKind);
  const coreStep = core.length > 1 ? Math.min(40, CORE_ARC / (core.length - 1)) : 0;
  core.forEach((n, i) => {
    const angle = 270 + (i - (core.length - 1) / 2) * coreStep;
    // Alternate rows; the labels all face outward, so the name below the centre stays clear.
    const lift = core.length > 4 ? (i % 2 === 0 ? -12 : 22) : 0;
    const p = polar((CORE_RADIUS + lift) * Math.max(0.8, g.scale), angle);
    positions[n.id] = { x: p.x * g.x, y: p.y * g.y };
  });

  // Each sector: one arc per layer.
  for (const key of SECTOR_KEYS) {
    const base = AREA_META[key].angle;
    const byLayer: Record<LayerKey, AtlasNode[]> = { hold: [], do: [], around: [] };
    for (const n of elements) if (n.area === key) byLayer[layerOf(n.kind)].push(n);
    for (const layer of Object.keys(byLayer) as LayerKey[]) {
      const list = byLayer[layer].sort(byKind);
      const count = list.length;
      const step = count > 1 ? Math.min(14, SECTOR_SPREAD / (count - 1)) : 0;
      list.forEach((n, i) => {
        const angle = base + (i - (count - 1) / 2) * step;
        const inner = count > 3 && i % 2 === 1;
        const r = (LAYER_RADII[layer] + (count > 3 ? (inner ? -STAGGER : STAGGER) : 0)) * g.scale;
        const p = polar(r, angle);
        positions[n.id] = { x: p.x * g.x, y: p.y * g.y };
        if (inner) inward.add(n.id);
      });
    }
  }
  return { positions, inward };
}
