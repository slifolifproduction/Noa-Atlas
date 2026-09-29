import type { CSSProperties } from 'react';
/**
 * Map atlas data to React Flow nodes and edges. Pure functions: given the same
 * data, positions and view state they return the same graph.
 *
 * One canvas, two lenses on the same positions. Map shows what exists
 * (elements, by area and layer) with the declared links, member lines and
 * area arcs; Causes shows the claims: what is said to affect what, each line
 * styled by its derived status.
 */
import { claimStatus } from '../domain/claims';
import { STATUS_META } from '../domain/constants';
import {
  AREA_MARKER_RADIUS,
  AREA_META,
  CORE_RADIUS,
  effectPhrase,
  LAYER_META,
  LAYER_RADII,
  layerOf,
  LINK_META,
  ORBIT_DESKTOP,
  SECTOR_KEYS,
  areaHubId,
  areaHubKey,
  isAreaHubId,
  YOU_ID,
  type OrbitGeometry,
} from '../domain/constants';
import { loopById } from '../domain/loops';
import { areaActivity, mapElements, neighborhood, neighbors, patternsForNode, recordsFor, thinSpots } from '../domain/selectors';
import type { AreaKey, AtlasData, Claim, ClaimStatus, ID, LayerKey } from '../domain/types';
import { t, tn } from '../i18n';
import type { NetworkView, XY } from '../state/uiStore';
import { orbitLayout } from './layout';
import type { AtlasFlowNode, LabelSide, SemanticEdge, SemanticEdgeData } from './types';

export interface BuiltGraph {
  nodes: AtlasFlowNode[];
  edges: SemanticEdge[];
  visible: Set<ID>;
  matches: ID[];
}

const matchesQuery = (q: string, ...texts: (string | undefined)[]) => Boolean(q) && texts.some((x) => x?.toLowerCase().includes(q));

function labelSide(from: XY, to: XY): LabelSide {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dy) >= Math.abs(dx) * 0.8) return dy > 0 ? 'bottom' : 'top';
  return dx > 0 ? 'right' : 'left';
}
const FLIP: Record<LabelSide, LabelSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

/** Selection highlighting: the selected node, its neighbours, and the edges between them. */
function applyEmphasis(nodes: AtlasFlowNode[], edges: SemanticEdge[], data: AtlasData, selectedId: ID | undefined, query: string, matches: Set<ID>) {
  if (selectedId && nodes.some((n) => n.id === selectedId)) {
    const near = new Set([selectedId, ...neighbors(data, selectedId).map((n) => n.otherId)]);
    for (const n of nodes) {
      if (n.type === 'rings' || n.id === selectedId) continue;
      n.className = near.has(n.id) ? 'is-near' : 'is-dim';
    }
    for (const e of edges) {
      const active = e.source === selectedId || e.target === selectedId;
      e.data = { ...e.data!, active, dim: !active };
      if (!active) e.className = 'is-dim';
      else e.zIndex = 1;
    }
    for (const n of nodes) if (n.id === selectedId) n.selected = true;
  } else if (query) {
    for (const n of nodes) if (n.type !== 'rings' && !matches.has(n.id)) n.className = 'is-soft';
  }
}

function makeEdge(id: string, source: ID, target: ID, data: Omit<SemanticEdgeData, 'active'>): SemanticEdge {
  return { id, source, target, type: 'semantic', data: { ...data, active: false }, zIndex: 0, focusable: false };
}

/** One line per claim, plus one from each joint condition. */
function claimEdges(claim: Claim, status: ClaimStatus, visible: Set<ID>): SemanticEdge[] {
  const out: SemanticEdge[] = [];
  const base = {
    family: 'claim' as const,
    effect: claim.effect,
    status,
    claimId: claim.id,
    label: effectPhrase(claim.effect, status),
    note: claim.via,
    stored: true,
    suggested: claim.state === 'suggested',
  };
  if (visible.has(claim.from) && visible.has(claim.to)) out.push(makeEdge(claim.id, claim.from, claim.to, base));
  for (const w of claim.with) {
    if (visible.has(w) && visible.has(claim.to)) out.push(makeEdge(`${claim.id}:with:${w}`, w, claim.to, { ...base, label: t('together with') }));
  }
  return out;
}

const areaOf = (data: AtlasData, id: ID): AreaKey | undefined => (id === YOU_ID ? 'self' : isAreaHubId(id) ? areaHubKey(id) : data.nodes[id]?.area);

/* ------------------------------------------------------------ orbit */

/** Which lens the canvas shows: what exists (map) or what seems to affect what (causes). */
export type CanvasLens = 'map' | 'causes';

export interface OrbitOptions {
  lens?: CanvasLens;
  /** Causes lens: which possible reasons to draw. */
  causes?: Pick<NetworkView, 'hiddenStatuses' | 'hiddenAreas' | 'showSuggested' | 'focusDepth' | 'loopId'>;
  /** Elements named on the map without being hovered. */
  salient?: Set<ID>;
  stored: Record<ID, XY>;
  collapsed: Set<AreaKey>;
  hiddenLayers: Set<LayerKey>;
  showClaims: boolean;
  selectedId?: ID;
  focus: boolean;
  query: string;
  today: string;
  geometry?: OrbitGeometry;
}

/** Sector boundaries, halfway between neighbouring areas. */
const SPOKES = SECTOR_KEYS.map((k) => AREA_META[k].angle + 180 / SECTOR_KEYS.length);

export function buildOrbit(data: AtlasData, opts: OrbitOptions): BuiltGraph {
  const q = opts.query.trim().toLowerCase();
  const g = opts.geometry ?? ORBIT_DESKTOP;
  const placed = orbitLayout(data, g);
  const positions = { ...placed.positions, ...opts.stored };
  const thin = thinSpots(data, opts.today);
  const activity = Object.fromEntries(Object.keys(AREA_META).map((k) => [k, areaActivity(data, k as AreaKey, 60, opts.today)])) as Record<AreaKey, number>;
  const maxActivity = Math.max(1, ...Object.values(activity));

  const selectedArea = opts.selectedId ? areaOf(data, opts.selectedId) : undefined;
  const elements = mapElements(data);
  const shown = (id: ID) => {
    const n = data.nodes[id]!;
    if (id === opts.selectedId) return true;
    if (opts.collapsed.has(n.area) && n.area !== selectedArea) return false;
    return n.area === 'self' || !opts.hiddenLayers.has(layerOf(n.kind));
  };
  let visible = new Set<ID>([YOU_ID, ...SECTOR_KEYS.map(areaHubId), ...elements.filter((n) => shown(n.id)).map((n) => n.id)]);

  if (opts.focus && opts.selectedId && visible.has(opts.selectedId)) {
    const near = neighborhood(data, opts.selectedId, 1, visible);
    const hubs = [...near].map((id) => areaOf(data, id)).map((k) => (!k ? null : k === 'self' ? YOU_ID : areaHubId(k)));
    visible = new Set([...near, YOU_ID, ...(hubs.filter(Boolean) as ID[])]);
  }

  const matches: ID[] = [];
  const nodes: AtlasFlowNode[] = [
    {
      id: '__rings',
      type: 'rings',
      position: { x: 0, y: 0 },
      data: {
        radii: [LAYER_RADII.hold, LAYER_RADII.do, LAYER_RADII.around].map((r) => r * g.scale),
        labels: [LAYER_META.hold.short, LAYER_META.do.short, LAYER_META.around.short],
        stretch: { x: g.x, y: g.y },
        spokes: SPOKES,
        spokeInner: (CORE_RADIUS + 70) * g.scale,
        spokeRadius: (AREA_MARKER_RADIUS - 60) * g.scale,
      },
      draggable: false,
      selectable: false,
      focusable: false,
      connectable: false,
      zIndex: -1,
    },
  ];

  const itemCount = (k: AreaKey) => elements.filter((n) => n.area === k).length;
  const pushHub = (id: ID, key: AreaKey, reveal: number) => {
    const meta = AREA_META[key];
    const center = key === 'self';
    const label = center ? data.profile.name || t('You') : meta.label;
    const statement = data.areas[key]?.statement ?? '';
    const matched = matchesQuery(q, label, statement);
    if (matched) matches.push(id);
    const count = itemCount(key);
    nodes.push({
      id,
      type: 'hub',
      // Hubs (and their labels) render above elements and lines.
      zIndex: 2,
      style: { '--reveal': `${reveal}ms` } as CSSProperties,
      position: positions[id],
      data: {
        area: key,
        center,
        label,
        statement,
        color: meta.color,
        activity: activity[key] / maxActivity,
        activityCount: activity[key],
        patternCount: patternsForNode(data, id).length,
        itemCount: count,
        collapsed: opts.collapsed.has(key) && selectedArea !== key,
        matched,
        quiet: !center && (count === 0 || thin.quietAreas.includes(key)),
        labelSide: center || positions[id].y > 0 ? 'bottom' : 'top',
        compact: g !== ORBIT_DESKTOP,
      },
    });
  };
  pushHub(YOU_ID, 'self', 80);
  SECTOR_KEYS.forEach((k, i) => visible.has(areaHubId(k)) && pushHub(areaHubId(k), k, 260 + i * 40));

  const centre = { x: 0, y: 0 };
  for (const n of elements) {
    if (!visible.has(n.id)) continue;
    const pos = positions[n.id] ?? centre;
    const matched = matchesQuery(q, n.label, n.summary);
    if (matched) matches.push(n.id);
    const core = n.area === 'self';
    const layer = layerOf(n.kind);
    const side = labelSide(centre, pos);
    const records = recordsFor(data, n.id);
    nodes.push({
      id: n.id,
      type: 'item',
      // Staged reveal: the centre first, then each ring outward.
      style: { '--reveal': `${core ? 200 : layer === 'hold' ? 420 : layer === 'do' ? 560 : 700}ms` } as CSSProperties,
      position: pos,
      data: {
        label: n.label,
        color: AREA_META[n.area].color,
        area: n.area,
        kind: n.kind,
        layer,
        core,
        origin: n.origin,
        concern: Boolean(n.concern),
        external: Boolean(n.external),
        level: n.level,
        status: n.status,
        ended: Boolean(n.until && n.until < opts.today),
        evidenceCount: records.entries.length + records.decisions.length,
        labelSide: placed.inward.has(n.id) ? FLIP[side] : side,
        matched,
        near: false,
        salient: Boolean(opts.salient?.has(n.id)),
      },
    });
  }
  if (opts.selectedId) {
    const near = new Set(neighbors(data, opts.selectedId).map((x) => x.otherId));
    for (const n of nodes) if (n.type === 'item' && near.has(n.id)) n.data.near = true;
  }

  const edges: SemanticEdge[] = opts.lens === 'causes' ? causesEdges(data, nodes, visible, opts) : mapEdges(data, visible, opts);
  for (const e of edges) e.data!.flow = e.data!.family !== 'member';

  applyEmphasis(nodes, edges, data, opts.selectedId, q, new Set(matches));
  return { nodes, edges, visible, matches };
}

/** Map lens: declared links, each element's line to its area, the arcs between areas, and claims around the focus. */
function mapEdges(data: AtlasData, visible: Set<ID>, opts: OrbitOptions): SemanticEdge[] {
  const edges: SemanticEdge[] = [];
  const elements = mapElements(data);
  for (const e of Object.values(data.edges)) {
    if (!visible.has(e.source) || !visible.has(e.target)) continue;
    const meta = LINK_META[e.type];
    const ed = makeEdge(e.id, e.source, e.target, { family: 'link', linkType: e.type, label: meta.verb, note: e.note, stored: true });
    ed.data!.secondary = areaOf(data, e.source) !== areaOf(data, e.target);
    edges.push(ed);
  }
  // The map shows what exists. Claims are understanding: shown when asked for, or around the selection.
  const touches = (c: Claim) => c.from === opts.selectedId || c.to === opts.selectedId || c.with.includes(opts.selectedId ?? '');
  if (opts.showClaims || opts.selectedId) {
    for (const c of Object.values(data.claims)) {
      if (c.state !== 'adopted' || (!opts.showClaims && !touches(c))) continue;
      const status = claimStatus(data, c);
      if (status === 'retired') continue;
      for (const ed of claimEdges(c, status, visible)) {
        ed.data!.secondary = areaOf(data, ed.source) !== areaOf(data, ed.target);
        edges.push(ed);
      }
    }
  }
  // Each element belongs to its area: a faint line back to the area's marker (or to you).
  const hubOf = (k: AreaKey) => (k === 'self' ? YOU_ID : areaHubId(k));
  for (const n of elements) {
    const hub = hubOf(n.area);
    if (!visible.has(n.id) || !visible.has(hub)) continue;
    edges.push(makeEdge(`member:${n.id}`, n.id, hub, { family: 'member', label: '', stored: false }));
  }

  // How the areas connect: every adopted claim and declared link that crosses from one area
  // to another, summed into one line per direction. Derived from the elements, never stored.
  const across = new Map<string, { from: AreaKey; to: AreaKey; claimIds: ID[]; linkIds: ID[]; best?: ClaimStatus }>();
  const bucket = (from: AreaKey, to: AreaKey) => {
    const k = `${from}>${to}`;
    if (!across.has(k)) across.set(k, { from, to, claimIds: [], linkIds: [] });
    return across.get(k)!;
  };
  for (const c of Object.values(data.claims)) {
    if (c.state !== 'adopted') continue;
    const status = claimStatus(data, c);
    if (status === 'retired') continue;
    const to = data.nodes[c.to]?.area;
    const froms = new Set([c.from, ...c.with].map((id) => data.nodes[id]?.area).filter(Boolean) as AreaKey[]);
    for (const from of froms) {
      if (!to || from === to) continue;
      const b = bucket(from, to);
      b.claimIds.push(c.id);
      if (!b.best || STATUS_META[status].rank > STATUS_META[b.best].rank) b.best = status;
    }
  }
  for (const e of Object.values(data.edges)) {
    if (e.type === 'part_of') continue;
    const from = data.nodes[e.source]?.area;
    const to = data.nodes[e.target]?.area;
    if (from && to && from !== to) bucket(from, to).linkIds.push(e.id);
  }
  for (const b of across.values()) {
    const a = hubOf(b.from);
    const z = hubOf(b.to);
    if (!visible.has(a) || !visible.has(z)) continue;
    const parts = [
      b.claimIds.length ? tn(b.claimIds.length, '{n} claim', '{n} claims') : '',
      b.linkIds.length ? tn(b.linkIds.length, '{n} declared link', '{n} declared links') : '',
    ].filter(Boolean);
    edges.push(
      makeEdge(`area:${b.from}>${b.to}`, a, z, {
        family: 'area',
        status: b.best,
        claimIds: b.claimIds,
        linkIds: b.linkIds,
        label: parts.join(' · '),
        stored: false,
      }),
    );
  }
  return edges;
}

/**
 * Causes lens: the same map, drawn as what seems to affect what. Elements no
 * visible reason touches fade back; a highlighted cycle stands out.
 */
function causesEdges(data: AtlasData, nodes: AtlasFlowNode[], visible: Set<ID>, opts: OrbitOptions): SemanticEdge[] {
  const view = opts.causes ?? { hiddenStatuses: ['retired'], hiddenAreas: [], showSuggested: true, focusDepth: 0 };
  const hiddenStatus = new Set(view.hiddenStatuses);
  const hiddenArea = new Set(view.hiddenAreas);
  const loop = view.loopId ? loopById(data, view.loopId) : undefined;
  const loopClaims = new Set(loop?.claimIds ?? []);
  const loopNodes = new Set(loop?.nodeIds ?? []);
  const edges: SemanticEdge[] = [];
  const touched = new Map<ID, number>();
  for (const c of Object.values(data.claims)) {
    if (c.state === 'set_aside' || (c.state === 'suggested' && !view.showSuggested)) continue;
    const status = claimStatus(data, c);
    if (hiddenStatus.has(status)) continue;
    const ends = [c.from, ...c.with, c.to];
    if (ends.some((id) => !visible.has(id) || hiddenArea.has(data.nodes[id]?.area as AreaKey))) continue;
    for (const ed of claimEdges(c, status, visible)) {
      if (loop) {
        ed.data!.loop = loopClaims.has(c.id);
        if (!ed.data!.loop) ed.className = 'is-soft';
      }
      edges.push(ed);
    }
    for (const id of ends) touched.set(id, (touched.get(id) ?? 0) + 1);
  }
  const around =
    view.focusDepth > 0 && opts.selectedId && visible.has(opts.selectedId) ? neighborhood(data, opts.selectedId, view.focusDepth, visible) : undefined;
  for (const n of nodes) {
    if (n.type !== 'item') continue;
    const count = touched.get(n.id) ?? 0;
    // Name what the reasons run through, so the picture reads without hovering.
    n.data.salient = n.data.salient || count >= 2 || loopNodes.has(n.id);
    if (!count || (loop && !loopNodes.has(n.id)) || (around && !around.has(n.id))) n.className = 'is-soft';
  }
  return edges;
}
