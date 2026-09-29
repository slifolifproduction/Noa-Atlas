/**
 * Deterministic layouts. Positions are node centres (the canvas uses a
 * centred node origin). Stored positions always win, so anything the user
 * dragged stays put; these functions only place nodes that have no position.
 *
 * Orbit reads as a chart of one life: angle is the area of life, distance
 * from the centre is the layer (what I hold, what I do, what surrounds me),
 * and the person sits in the middle with what defines them close around.
 */
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
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

/* ------------------------------------------------------------ connections */

/** Where each layer's elements gather in the network: inner states near the middle, conditions farther out. */
const NETWORK_RADII: Record<LayerKey, number> = { hold: 170, do: 320, around: 460 };

interface SimNode extends SimulationNodeDatum {
  id: ID;
  ax: number;
  ay: number;
  hw: number;
  hh: number;
}

/** Small deterministic PRNG so layouts are identical on every load. */
function lcg(seed = 7) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

/** Approximate rendered size of a card so the layout can avoid overlaps. */
function cardSize(label: string): { hw: number; hh: number } {
  const perLine = 30;
  const lines = Math.min(3, Math.ceil(label.length / perLine));
  const width = Math.min(228, 44 + Math.min(label.length, perLine) * 6.4);
  const height = 30 + lines * 18;
  return { hw: width / 2, hh: height / 2 };
}

/** Rectangle collision: pushes overlapping boxes apart along the shallower axis. */
function rectCollide(padX = 14, padY = 12) {
  let nodes: SimNode[] = [];
  const force = (alpha: number) => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const ox = a.hw + b.hw + padX - Math.abs(dx);
        const oy = a.hh + b.hh + padY - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        const k = 0.5 * Math.min(1, alpha * 4 + 0.3);
        const aFixed = a.fx != null;
        const bFixed = b.fx != null;
        const share = aFixed || bFixed ? 1 : 0.5;
        if (ox / (a.hw + b.hw) < oy / (a.hh + b.hh)) {
          const push = ox * k * (dx >= 0 ? 1 : -1);
          if (!aFixed) a.x! -= push * share;
          if (!bFixed) b.x! += push * share;
        } else {
          const push = oy * k * (dy >= 0 ? 1 : -1);
          if (!aFixed) a.y! -= push * share;
          if (!bFixed) b.y! += push * share;
        }
      }
    }
  };
  force.initialize = (n: SimNode[]) => (nodes = n);
  return force;
}

/**
 * Elements start where they sit on Orbit (angle = area, distance = layer),
 * then the claims between them pull related things together. Only elements
 * without a stored position move.
 */
export function networkLayout(data: AtlasData, ids: ID[], links: { source: ID; target: ID }[], fixed: Record<ID, XY>): Record<ID, XY> {
  const missing = ids.filter((id) => !fixed[id]);
  if (missing.length === 0) return {};

  const anchor = (id: ID): XY => {
    const n = data.nodes[id];
    if (!n) return { x: 0, y: 0 };
    if (n.area === 'self') return polar(70, 270);
    const p = polar(NETWORK_RADII[layerOf(n.kind)], AREA_META[n.area].angle);
    return { x: p.x * 1.35, y: p.y };
  };

  const rand = lcg();
  const nodes: SimNode[] = ids.map((id) => {
    const a = anchor(id);
    const size = cardSize(data.nodes[id]?.label ?? '');
    const f = fixed[id];
    return f
      ? { id, ax: a.x, ay: a.y, ...size, x: f.x, y: f.y, fx: f.x, fy: f.y }
      : { id, ax: a.x, ay: a.y, ...size, x: a.x + (rand() - 0.5) * 60, y: a.y + (rand() - 0.5) * 60 };
  });
  const present = new Set(ids);
  const simLinks = links.filter((l) => present.has(l.source) && present.has(l.target)).map((l) => ({ ...l }));

  const sim = forceSimulation(nodes)
    .randomSource(lcg(11))
    .force(
      'link',
      forceLink<SimNode, { source: ID; target: ID }>(simLinks)
        .id((d) => d.id)
        .distance(150)
        .strength(0.08),
    )
    .force('charge', forceManyBody<SimNode>().strength(-160).distanceMax(420))
    .force('x', forceX<SimNode>((d) => d.ax).strength(0.16))
    .force('y', forceY<SimNode>((d) => d.ay).strength(0.16))
    .force('collide', rectCollide())
    .stop();
  for (let i = 0; i < 360; i++) sim.tick();
  // Settle overlaps without the other forces.
  const settle = rectCollide();
  settle.initialize(nodes);
  for (let i = 0; i < 60; i++) settle(0.2);

  const out: Record<ID, XY> = {};
  for (const n of nodes) if (!fixed[n.id]) out[n.id] = { x: Math.round(n.x ?? 0), y: Math.round(n.y ?? 0) };
  return out;
}
