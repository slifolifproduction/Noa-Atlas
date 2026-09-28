/**
 * Deterministic layouts. Positions are node centres (the canvas uses a
 * centred node origin). Stored positions always win, so anything the user
 * dragged stays put; these functions only place nodes that have no position.
 */
import { forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import { CATEGORY_META, DOMAIN_META, DOMAINS, hubId, ORBIT_DESKTOP, RING_RADII, type OrbitGeometry } from '../domain/constants';
import type { AtlasData, DomainKey, ID } from '../domain/types';
import type { XY } from '../state/uiStore';

const rad = (deg: number) => (deg * Math.PI) / 180;
const polar = (r: number, deg: number): XY => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });

export function hubPosition(key: DomainKey, g: OrbitGeometry = ORBIT_DESKTOP): XY {
  const meta = DOMAIN_META[key];
  const p = polar(RING_RADII[meta.ring] * g.scale, meta.angle);
  return { x: p.x * g.x, y: p.y * g.y };
}

const ITEM_RADIUS = 122;
const IDENTITY_ITEM_RADIUS = 132;

/** Satellites fan out on an arc facing away from the centre. */
export function itemPosition(key: DomainKey, index: number, count: number, g: OrbitGeometry = ORBIT_DESKTOP): XY {
  const k = Math.max(0.8, g.scale);
  if (key === 'identity') {
    // Self-descriptions sit either side of the centre, leaving above and below for labels.
    const side = index % 2 === 0 ? 180 : 0;
    const row = Math.floor(index / 2);
    const rows = Math.ceil(count / 2);
    const angle = side + (row - (rows - 1) / 2) * 34 * (side === 0 ? -1 : 1);
    const p = polar(IDENTITY_ITEM_RADIUS * k, angle);
    return { x: p.x * 1.2, y: p.y };
  }
  const hub = hubPosition(key, g);
  const base = DOMAIN_META[key].angle;
  // Keep the fan within ~100° so satellites do not drift into a neighbour's label.
  const step = count > 1 ? Math.min(34, 100 / (count - 1)) : 0;
  const angle = base + (index - (count - 1) / 2) * step;
  const p = polar(ITEM_RADIUS * k, angle);
  return { x: hub.x + p.x, y: hub.y + p.y };
}

export function orbitLayout(data: AtlasData, g: OrbitGeometry = ORBIT_DESKTOP): Record<ID, XY> {
  const out: Record<ID, XY> = {};
  for (const d of DOMAINS) {
    out[hubId(d.key)] = hubPosition(d.key, g);
    const items = Object.values(data.nodes)
      .filter((n) => n.domain === d.key)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    items.forEach((n, i) => (out[n.id] = itemPosition(d.key, i, items.length, g)));
  }
  return out;
}

/* ------------------------------------------------------------ mind */

const MIND_RADIUS = 380;

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

/** Approximate rendered size of a pill so the layout can avoid overlaps. */
function pillSize(label: string, pattern: boolean): { hw: number; hh: number } {
  const perLine = pattern ? 34 : 30;
  const lines = Math.min(3, Math.ceil(label.length / perLine));
  const width = Math.min(pattern ? 250 : 228, 44 + Math.min(label.length, perLine) * 6.4);
  const height = (pattern ? 44 : 16) + lines * 18;
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

export interface MindLayoutInput {
  nodeIds: ID[];
  patternIds: ID[];
  links: { source: ID; target: ID }[];
}

/**
 * Category clusters sit on a ring; derived patterns are pulled toward the
 * middle, between the clusters they connect. Only nodes without a stored
 * position move.
 */
export function mindLayout(data: AtlasData, input: MindLayoutInput, fixed: Record<ID, XY>): Record<ID, XY> {
  const ids = [...input.nodeIds, ...input.patternIds];
  const missing = ids.filter((id) => !fixed[id]);
  if (missing.length === 0) return {};

  const anchors = new Map<ID, XY>();
  for (const id of input.nodeIds) {
    const cat = data.nodes[id]?.category;
    if (!cat) continue;
    const base = polar(MIND_RADIUS, CATEGORY_META[cat].angle);
    anchors.set(id, { x: base.x * 1.35, y: base.y });
  }
  for (const pid of input.patternIds) {
    const p = data.patterns[pid];
    const related = (p?.nodeIds ?? []).map((n) => anchors.get(n)).filter((a): a is XY => Boolean(a));
    const c = related.length
      ? { x: related.reduce((s, a) => s + a.x, 0) / related.length, y: related.reduce((s, a) => s + a.y, 0) / related.length }
      : { x: 0, y: 0 };
    anchors.set(pid, { x: c.x * 0.3, y: c.y * 0.3 });
  }

  const rand = lcg();
  const nodes: SimNode[] = ids.map((id) => {
    const a = anchors.get(id) ?? { x: 0, y: 0 };
    const pattern = Boolean(data.patterns[id]);
    const label = pattern ? data.patterns[id]!.chain.join(' → ') : (data.nodes[id]?.label ?? '');
    const size = pillSize(label, pattern);
    const f = fixed[id];
    return f
      ? { id, ax: a.x, ay: a.y, ...size, x: f.x, y: f.y, fx: f.x, fy: f.y }
      : { id, ax: a.x, ay: a.y, ...size, x: a.x + (rand() - 0.5) * 60, y: a.y + (rand() - 0.5) * 60 };
  });
  const present = new Set(ids);
  const links = input.links.filter((l) => present.has(l.source) && present.has(l.target)).map((l) => ({ ...l }));

  const sim = forceSimulation(nodes)
    .randomSource(lcg(11))
    .force(
      'link',
      forceLink<SimNode, { source: ID; target: ID }>(links)
        .id((d) => d.id)
        .distance(120)
        .strength(0.06),
    )
    .force('charge', forceManyBody<SimNode>().strength(-140).distanceMax(420))
    .force('x', forceX<SimNode>((d) => d.ax).strength(0.2))
    .force('y', forceY<SimNode>((d) => d.ay).strength(0.2))
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
