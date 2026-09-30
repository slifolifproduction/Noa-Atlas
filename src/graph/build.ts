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

/** Elements joined to `id` by a possible reason (not by a declared link or a pattern). */
function causalNeighbours(data: AtlasData, id: ID): ID[] {
  const out: ID[] = [];
  for (const c of Object.values(data.claims)) {
    if (c.state === 'set_aside') continue;
    if (c.to === id) out.push(c.from, ...c.with);
    if (c.from === id || c.with.includes(id)) out.push(c.to);
  }
  return out.filter((x) => x !== id);
}

/**
 * The causal trace from an element: backward, what may lead to it; forward,
 * what it may lead to; each step along a possible reason, `depth` steps deep.
 */
export function causalReach(data: AtlasData, start: ID, depth: number, direction: 'back' | 'forward' | 'both', visible?: Set<ID>): Set<ID> {
  const claims = Object.values(data.claims).filter((c) => c.state !== 'set_aside' && claimStatus(data, c) !== 'retired');
  const seen = new Set<ID>([start]);
  let frontier = [start];
  for (let step = 0; step < depth && frontier.length; step++) {
    const next: ID[] = [];
    for (const id of frontier) {
      for (const c of claims) {
        const back = direction !== 'forward' && c.to === id ? [c.from, ...c.with] : [];
        const fwd = direction !== 'back' && (c.from === id || c.with.includes(id)) ? [c.to] : [];
        for (const x of [...back, ...fwd]) {
          if (seen.has(x) || (visible && !visible.has(x))) continue;
          seen.add(x);
          next.push(x);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/**
 * Selection highlighting: the selected node, its neighbours, and the edges
 * between them. On the Causes lens a neighbour is only what a possible reason
 * joins: being linked or in the same pattern is not being a cause.
 */
function applyEmphasis(
  nodes: AtlasFlowNode[],
  edges: SemanticEdge[],
  data: AtlasData,
  selectedId: ID | undefined,
  query: string,
  matches: Set<ID>,
  causal = false,
) {
  if (selectedId && nodes.some((n) => n.id === selectedId)) {
    const near = new Set([selectedId, ...(causal ? causalNeighbours(data, selectedId) : neighbors(data, selectedId).map((n) => n.otherId))]);
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
const hubOf = (k: AreaKey) => (k === 'self' ? YOU_ID : areaHubId(k));

/** How many elements each area shows on the map at rest; the rest open with the area. */
export const ESSENTIALS = { sector: 2, centre: 3 };

/** Every adopted claim and declared link, as the elements it joins. */
function connections(data: AtlasData): { ends: ID[]; claimId?: ID; linkId?: ID }[] {
  const out: { ends: ID[]; claimId?: ID; linkId?: ID }[] = [];
  for (const c of Object.values(data.claims)) {
    if (c.state !== 'adopted' || claimStatus(data, c) === 'retired') continue;
    out.push({ ends: [c.from, ...c.with, c.to], claimId: c.id });
  }
  for (const e of Object.values(data.edges)) if (e.type !== 'part_of') out.push({ ends: [e.source, e.target], linkId: e.id });
  return out;
}

/**
 * The few elements each area shows before it is opened: what you care about,
 * what moved lately, and what ties this area to the others. Everything else
 * stays folded into the area's marker, and its connections still count in the
 * lines between areas.
 */
export function essentialElements(data: AtlasData, salient: Set<ID> = new Set()): Set<ID> {
  const across = new Map<ID, number>();
  const degree = new Map<ID, number>();
  for (const { ends } of connections(data)) {
    const areas = new Set(ends.map((id) => data.nodes[id]?.area));
    for (const id of ends) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      if (areas.size > 1) across.set(id, (across.get(id) ?? 0) + 1);
    }
  }
  const score = (id: ID) => (data.nodes[id]?.concern ? 100 : 0) + (salient.has(id) ? 40 : 0) + (across.get(id) ?? 0) * 4 + (degree.get(id) ?? 0);
  const keep = new Set<ID>();
  const byArea = new Map<AreaKey, ID[]>();
  for (const n of mapElements(data)) byArea.set(n.area, [...(byArea.get(n.area) ?? []), n.id]);
  for (const [area, ids] of byArea) {
    const limit = area === 'self' ? ESSENTIALS.centre : ESSENTIALS.sector;
    ids.sort((a, b) => score(b) - score(a) || a.localeCompare(b));
    for (const id of ids.slice(0, limit)) keep.add(id);
  }
  return keep;
}

/* ------------------------------------------------------------ orbit */

/** Which lens the canvas shows: what exists (map) or what seems to affect what (causes). */
export type CanvasLens = 'map' | 'causes';

export interface OrbitOptions {
  lens?: CanvasLens;
  /** Causes lens: which possible reasons to draw. */
  causes?: Pick<NetworkView, 'hiddenStatuses' | 'hiddenAreas' | 'showSuggested' | 'focusDepth' | 'loopId' | 'trace'>;
  /** Elements named on the map without being hovered. */
  salient?: Set<ID>;
  /** Map lens at rest: show only each area's essentials (see `essentialElements`). */
  essentials?: boolean;
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
  // At rest the map keeps each area to its essentials. Choosing an area opens it; choosing an
  // element brings what it connects to; a search finds anything.
  const keep = opts.essentials ? essentialElements(data, opts.salient) : undefined;
  const opened = opts.selectedId && (opts.selectedId === YOU_ID || isAreaHubId(opts.selectedId)) ? selectedArea : undefined;
  const reached = new Set(opts.selectedId && data.nodes[opts.selectedId] ? neighbors(data, opts.selectedId).map((x) => x.otherId) : []);
  const essential = (n: (typeof elements)[number]) => !keep || keep.has(n.id) || n.area === opened || reached.has(n.id) || matchesQuery(q, n.label, n.summary);
  const shown = (id: ID) => {
    const n = data.nodes[id]!;
    if (id === opts.selectedId) return true;
    if (opts.collapsed.has(n.area) && n.area !== selectedArea) return false;
    if (!essential(n)) return false;
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
    const label = meta.label;
    const statement = data.areas[key]?.statement ?? '';
    const matched = matchesQuery(q, label, statement);
    if (matched) matches.push(id);
    const count = itemCount(key);
    const hidden = elements.filter((n) => n.area === key && !visible.has(n.id)).length;
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
        hiddenCount: hidden,
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
        // With the map kept to its essentials, each one is named.
        salient: Boolean(opts.salient?.has(n.id) || keep?.has(n.id)),
      },
    });
  }
  if (opts.selectedId) {
    const near = new Set(opts.lens === 'causes' ? causalNeighbours(data, opts.selectedId) : neighbors(data, opts.selectedId).map((x) => x.otherId));
    for (const n of nodes) if (n.type === 'item' && near.has(n.id)) n.data.near = true;
  }

  const edges: SemanticEdge[] = opts.lens === 'causes' ? causesEdges(data, nodes, visible, opts) : mapEdges(data, visible, opts);
  for (const e of edges) e.data!.flow = e.data!.family !== 'member';

  applyEmphasis(nodes, edges, data, opts.selectedId, q, new Set(matches), opts.lens === 'causes');
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
  for (const n of elements) {
    const hub = hubOf(n.area);
    if (!visible.has(n.id) || !visible.has(hub)) continue;
    edges.push(makeEdge(`member:${n.id}`, n.id, hub, { family: 'member', label: '', stored: false }));
  }

  // What a shown element connects to in another area, when that part of the area is folded:
  // one line to that area's marker, so every element on the map stays tied to the others.
  const reach = new Map<string, { from: ID; to: ID; claimIds: ID[]; linkIds: ID[] }>();
  for (const { ends, claimId, linkId } of connections(data)) {
    for (const a of ends) {
      if (!visible.has(a)) continue;
      for (const b of ends) {
        if (b === a || visible.has(b)) continue;
        const ka = data.nodes[a]?.area;
        const kb = data.nodes[b]?.area;
        if (!ka || !kb || ka === kb || !visible.has(hubOf(kb))) continue;
        const k = `${a}>${kb}`;
        if (!reach.has(k)) reach.set(k, { from: a, to: hubOf(kb), claimIds: [], linkIds: [] });
        const r = reach.get(k)!;
        if (claimId && !r.claimIds.includes(claimId)) r.claimIds.push(claimId);
        if (linkId && !r.linkIds.includes(linkId)) r.linkIds.push(linkId);
      }
    }
  }
  for (const [k, r] of reach) {
    edges.push(makeEdge(`reach:${k}`, r.from, r.to, { family: 'member', reach: true, claimIds: r.claimIds, linkIds: r.linkIds, label: '', stored: false }));
  }

  // How the areas connect, drawn as two different kinds of line. Possible reasons that cross from
  // one area to another: one arrowed line per direction, styled by the surest of them. Links you
  // drew across areas: one plain line per pair, with no direction and no status, because a link
  // says nothing about one changing the other. Both are derived, never stored.
  const reasons = new Map<string, { from: AreaKey; to: AreaKey; claimIds: ID[]; best?: ClaimStatus }>();
  for (const c of Object.values(data.claims)) {
    if (c.state !== 'adopted') continue;
    const status = claimStatus(data, c);
    if (status === 'retired') continue;
    const to = data.nodes[c.to]?.area;
    const froms = new Set([c.from, ...c.with].map((id) => data.nodes[id]?.area).filter(Boolean) as AreaKey[]);
    for (const from of froms) {
      if (!to || from === to) continue;
      const k = `${from}>${to}`;
      if (!reasons.has(k)) reasons.set(k, { from, to, claimIds: [] });
      const b = reasons.get(k)!;
      b.claimIds.push(c.id);
      if (!b.best || STATUS_META[status].rank > STATUS_META[b.best].rank) b.best = status;
    }
  }
  for (const b of reasons.values()) {
    const a = hubOf(b.from);
    const z = hubOf(b.to);
    if (!visible.has(a) || !visible.has(z)) continue;
    edges.push(
      makeEdge(`area:${b.from}>${b.to}`, a, z, {
        family: 'area',
        status: b.best,
        claimIds: b.claimIds,
        linkIds: [],
        label: tn(b.claimIds.length, '{n} possible reason', '{n} possible reasons'),
        stored: false,
      }),
    );
  }
  const links = new Map<string, { a: AreaKey; z: AreaKey; linkIds: ID[] }>();
  for (const e of Object.values(data.edges)) {
    if (e.type === 'part_of') continue;
    const x = data.nodes[e.source]?.area;
    const y = data.nodes[e.target]?.area;
    if (!x || !y || x === y) continue;
    const [a, z] = [x, y].sort() as [AreaKey, AreaKey];
    const k = `${a}~${z}`;
    if (!links.has(k)) links.set(k, { a, z, linkIds: [] });
    links.get(k)!.linkIds.push(e.id);
  }
  for (const b of links.values()) {
    const a = hubOf(b.a);
    const z = hubOf(b.z);
    if (!visible.has(a) || !visible.has(z)) continue;
    edges.push(
      makeEdge(`links:${b.a}~${b.z}`, a, z, {
        family: 'area',
        claimIds: [],
        linkIds: b.linkIds,
        label: tn(b.linkIds.length, '{n} link you drew', '{n} links you drew'),
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
  const view = opts.causes ?? { hiddenStatuses: ['retired'], hiddenAreas: [], showSuggested: true, focusDepth: 0, trace: 'back' };
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
    view.focusDepth > 0 && opts.selectedId && visible.has(opts.selectedId)
      ? causalReach(data, opts.selectedId, view.focusDepth, view.trace ?? 'back', visible)
      : undefined;
  for (const n of nodes) {
    if (n.type !== 'item') continue;
    const count = touched.get(n.id) ?? 0;
    // Name what the reasons run through, so the picture reads without hovering.
    n.data.salient = n.data.salient || count >= 2 || loopNodes.has(n.id);
    if (!count || (loop && !loopNodes.has(n.id)) || (around && !around.has(n.id))) n.className = 'is-soft';
  }
  return edges;
}
