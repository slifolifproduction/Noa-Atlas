/**
 * Map atlas data to React Flow nodes and edges. Pure functions: given the same
 * data, positions and view state they return the same graph.
 */
import { computeConfidence } from '../domain/confidence';
import {
  CATEGORY_META,
  DOMAIN_META,
  ORBIT_DESKTOP,
  type OrbitGeometry,
  DOMAINS,
  hubId,
  hubKey,
  isHubId,
  RELATION_META,
  RING_LABELS,
  RING_RADII,
} from '../domain/constants';
import { domainActivity, evidenceForNode, neighborhood, neighbors, patternsForNode } from '../domain/selectors';
import type { AtlasData, DomainKey, ID, MindCategory, RelationType, SkillStatus } from '../domain/types';
import type { MindView, XY } from '../state/uiStore';
import { orbitLayout } from './layout';
import type { AtlasFlowNode, LabelSide, SemanticEdge } from './types';

export interface BuiltGraph {
  nodes: AtlasFlowNode[];
  edges: SemanticEdge[];
  visible: Set<ID>;
  matches: ID[];
}

const matchesQuery = (q: string, ...texts: (string | undefined)[]) => Boolean(q) && texts.some((t) => t?.toLowerCase().includes(q));

function labelSide(from: XY, to: XY): LabelSide {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dy) >= Math.abs(dx) * 0.8) return dy > 0 ? 'bottom' : 'top';
  return dx > 0 ? 'right' : 'left';
}

/** Selection highlighting: the selected node, its neighbours, and the edges between them. */
function applyEmphasis(nodes: AtlasFlowNode[], edges: SemanticEdge[], data: AtlasData, selectedId: ID | undefined, query: string, matches: Set<ID>) {
  if (selectedId && nodes.some((n) => n.id === selectedId)) {
    const near = new Set([selectedId, ...neighbors(data, selectedId).map((n) => n.otherId)]);
    for (const n of nodes) if (n.type !== 'rings' && !near.has(n.id)) n.className = 'is-dim';
    for (const e of edges) {
      const active = e.source === selectedId || e.target === selectedId;
      e.data = { ...e.data!, active };
      if (!active) e.className = 'is-dim';
      else e.zIndex = 1;
    }
    for (const n of nodes) if (n.id === selectedId) n.selected = true;
  } else if (query) {
    for (const n of nodes) if (n.type !== 'rings' && !matches.has(n.id)) n.className = 'is-soft';
  }
}

function edge(id: string, source: ID, target: ID, relation: RelationType, stored: boolean, note?: string): SemanticEdge {
  return {
    id,
    source,
    target,
    type: 'semantic',
    data: { relation, active: false, label: RELATION_META[relation].verb, note, stored },
    zIndex: 0,
    focusable: false,
  };
}

/* ------------------------------------------------------------ orbit */

export interface OrbitOptions {
  stored: Record<ID, XY>;
  collapsed: Set<DomainKey>;
  selectedId?: ID;
  focus: boolean;
  query: string;
  today: string;
  geometry?: OrbitGeometry;
}

export function buildOrbit(data: AtlasData, opts: OrbitOptions): BuiltGraph {
  const q = opts.query.trim().toLowerCase();
  const g = opts.geometry ?? ORBIT_DESKTOP;
  const positions = { ...orbitLayout(data, g), ...opts.stored };
  const activity = Object.fromEntries(DOMAINS.map((d) => [d.key, domainActivity(data, d.key, 60, opts.today)])) as Record<DomainKey, number>;
  const maxActivity = Math.max(1, ...Object.values(activity));

  const selectedDomain = opts.selectedId
    ? isHubId(opts.selectedId)
      ? hubKey(opts.selectedId)
      : data.nodes[opts.selectedId]?.domain
    : undefined;

  const items = Object.values(data.nodes).filter((n) => n.domain);
  const near = new Set(opts.selectedId ? [opts.selectedId, ...neighbors(data, opts.selectedId).map((x) => x.otherId)] : []);
  let visible = new Set<ID>([...DOMAINS.map((d) => hubId(d.key)), ...items.filter((n) => !opts.collapsed.has(n.domain!) || n.domain === selectedDomain).map((n) => n.id)]);

  if (opts.focus && opts.selectedId && visible.has(opts.selectedId)) {
    const near = neighborhood(data, opts.selectedId, 1, visible);
    const hubs = [...near].map((id) => (isHubId(id) ? id : data.nodes[id]?.domain ? hubId(data.nodes[id]!.domain!) : null)).filter(Boolean) as ID[];
    visible = new Set([...near, ...hubs]);
  }

  const matches: ID[] = [];
  const nodes: AtlasFlowNode[] = [
    {
      id: '__rings',
      type: 'rings',
      position: { x: 0, y: 0 },
      data: {
        radii: [RING_RADII[1], RING_RADII[2], RING_RADII[3]].map((r) => r * g.scale),
        labels: [RING_LABELS[1], RING_LABELS[2], RING_LABELS[3]],
        stretch: { x: g.x, y: g.y },
      },
      draggable: false,
      selectable: false,
      focusable: false,
      connectable: false,
      zIndex: -1,
    },
  ];

  for (const d of DOMAINS) {
    const id = hubId(d.key);
    if (!visible.has(id)) continue;
    const domain = data.domains[d.key];
    const matched = matchesQuery(q, d.label, domain?.statement);
    if (matched) matches.push(id);
    nodes.push({
      id,
      type: 'hub',
      position: positions[id],
      data: {
        key: d.key,
        label: d.label,
        statement: domain?.statement ?? '',
        color: d.color,
        activity: activity[d.key] / maxActivity,
        activityCount: activity[d.key],
        patternCount: patternsForNode(data, id).length,
        itemCount: items.filter((n) => n.domain === d.key).length,
        collapsed: opts.collapsed.has(d.key) && selectedDomain !== d.key,
        center: d.ring === 0,
        matched,
        labelSide: d.ring === 0 || positions[id].y > 40 ? 'top' : 'bottom',
        compact: g !== ORBIT_DESKTOP,
      },
    });
  }

  for (const n of items) {
    if (!visible.has(n.id)) continue;
    const key = n.domain!;
    const pos = positions[n.id] ?? positions[hubId(key)];
    const matched = matchesQuery(q, n.label, n.summary);
    if (matched) matches.push(n.id);
    const mark = key === 'skills' ? (n.tags.find((t) => t === 'have' || t === 'developing' || t === 'gap') as SkillStatus | undefined) : undefined;
    nodes.push({
      id: n.id,
      type: 'item',
      position: pos,
      data: {
        label: n.label,
        color: DOMAIN_META[key].color,
        domain: key,
        origin: n.origin,
        mark,
        evidenceCount: evidenceForNode(data, n.id).entries.length,
        labelSide: labelSide(positions[hubId(key)], pos),
        matched,
        near: near.has(n.id),
      },
    });
  }

  const edges: SemanticEdge[] = [];
  for (const n of items) {
    if (visible.has(n.id)) edges.push(edge(`part:${n.id}`, n.id, hubId(n.domain!), 'part_of', false));
  }
  for (const e of Object.values(data.edges)) {
    if (!visible.has(e.source) || !visible.has(e.target)) continue;
    const ed = edge(e.id, e.source, e.target, e.relation, true, e.note);
    const da = isHubId(e.source) ? hubKey(e.source) : data.nodes[e.source]?.domain;
    const db = isHubId(e.target) ? hubKey(e.target) : data.nodes[e.target]?.domain;
    ed.data!.secondary = !isHubId(e.source) && !isHubId(e.target) && da !== db;
    edges.push(ed);
  }

  const matchSet = new Set(matches);
  applyEmphasis(nodes, edges, data, opts.selectedId, q, matchSet);
  return { nodes, edges, visible, matches };
}

/* ------------------------------------------------------------ mind */

export interface MindOptions {
  positions: Record<ID, XY>;
  view: MindView;
  selectedId?: ID;
  query: string;
}

export function mindMembers(data: AtlasData, view: Pick<MindView, 'hiddenCategories' | 'showInferred' | 'showPatterns'>) {
  const hidden = new Set<MindCategory>(view.hiddenCategories);
  const nodeIds = Object.values(data.nodes)
    .filter((n) => n.category && !hidden.has(n.category) && (view.showInferred || n.origin !== 'inferred'))
    .map((n) => n.id);
  const patternIds = view.showPatterns ? Object.values(data.patterns).filter((p) => p.status !== 'dismissed').map((p) => p.id) : [];
  return { nodeIds, patternIds };
}

export function buildMind(data: AtlasData, opts: MindOptions): BuiltGraph {
  const q = opts.query.trim().toLowerCase();
  const { nodeIds, patternIds } = mindMembers(data, opts.view);
  let visible = new Set<ID>([...nodeIds, ...patternIds]);
  if (opts.view.focusDepth > 0 && opts.selectedId && visible.has(opts.selectedId)) {
    visible = neighborhood(data, opts.selectedId, opts.view.focusDepth, visible);
  }

  const matches: ID[] = [];
  const nodes: AtlasFlowNode[] = [];
  for (const id of nodeIds) {
    if (!visible.has(id)) continue;
    const n = data.nodes[id]!;
    const matched = matchesQuery(q, n.label, n.summary);
    if (matched) matches.push(id);
    nodes.push({
      id,
      type: 'mind',
      position: opts.positions[id] ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        category: n.category!,
        color: CATEGORY_META[n.category!].color,
        origin: n.origin,
        confidence: n.confidence,
        status: n.status,
        mirror: Boolean(n.source),
        evidenceCount: evidenceForNode(data, id).entries.length + evidenceForNode(data, id).decisions.length,
        matched,
      },
    });
  }
  for (const id of patternIds) {
    if (!visible.has(id)) continue;
    const p = data.patterns[id]!;
    const matched = matchesQuery(q, p.title, p.observation, p.chain.join(' '));
    if (matched) matches.push(id);
    nodes.push({
      id,
      type: 'pattern',
      position: opts.positions[id] ?? { x: 0, y: 0 },
      data: { code: p.code, title: p.chain.length ? p.chain.join(' → ') : p.title, confidence: computeConfidence(p.evidence), status: p.status, matched },
    });
  }

  const hiddenRelations = new Set(opts.view.hiddenRelations);
  const edges: SemanticEdge[] = [];
  for (const e of Object.values(data.edges)) {
    if (hiddenRelations.has(e.relation)) continue;
    if (visible.has(e.source) && visible.has(e.target)) edges.push(edge(e.id, e.source, e.target, e.relation, true, e.note));
  }
  if (!hiddenRelations.has('derived_from')) {
    for (const id of patternIds) {
      if (!visible.has(id)) continue;
      for (const nid of data.patterns[id]!.nodeIds) {
        if (visible.has(nid)) edges.push(edge(`pl:${id}:${nid}`, id, nid, 'derived_from', false));
      }
    }
  }

  const matchSet = new Set(matches);
  applyEmphasis(nodes, edges, data, opts.selectedId, q, matchSet);
  return { nodes, edges, visible, matches };
}

/** Links used by the force layout (stored edges + pattern links). */
export function mindLinks(data: AtlasData) {
  const links = Object.values(data.edges).map((e) => ({ source: e.source, target: e.target }));
  for (const p of Object.values(data.patterns)) for (const nid of p.nodeIds) links.push({ source: p.id, target: nid });
  return links;
}
