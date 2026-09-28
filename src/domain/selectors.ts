/**
 * Pure, derived queries over AtlasData. Components read through these so the
 * same relationship logic (backlinks, neighbourhoods, statistics) is defined
 * exactly once.
 */
import { addDays, daysBetween, formatSpan, todayISO, weekStart } from '../lib/dates';
import { pad2 } from '../lib/text';
import { computeConfidence, confidenceHistory } from './confidence';
import { CATEGORY_META, DOMAIN_META, DRIVER_HORIZON, hubId, hubKey, isHubId, PATTERN_COLOR } from './constants';
import type {
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Decision,
  DomainKey,
  Entry,
  Evidence,
  Experiment,
  ID,
  ISODate,
  NavigationPlan,
  Pattern,
  RelationType,
  SourceRef,
} from './types';

/* ---------------- codes ---------------- */

export const entryCode = (seq: number) => `Entry #${pad2(seq)}`;
export const decisionCode = (seq: number) => `Decision #${pad2(seq)}`;
export const patternCode = (code: number) => `Pattern ${pad2(code)}`;
export const experimentCode = (code: number) => `EXP-${pad2(code)}`;
export const pathCode = (code: string) => `Path ${code}`;

/* ---------------- sources ---------------- */

export interface ResolvedSource {
  ref: SourceRef;
  code: string;
  title: string;
  date?: ISODate;
  body?: string;
  exists: boolean;
}

export function resolveSource(data: AtlasData, ref: SourceRef): ResolvedSource {
  if (ref.kind === 'entry') {
    const e = data.entries[ref.id];
    return e
      ? { ref, code: entryCode(e.seq), title: e.title, date: e.date, body: e.content, exists: true }
      : { ref, code: 'Entry', title: 'Deleted entry', exists: false };
  }
  if (ref.kind === 'decision') {
    const d = data.decisions[ref.id];
    return d
      ? { ref, code: decisionCode(d.seq), title: d.title, date: d.date, body: d.context, exists: true }
      : { ref, code: 'Decision', title: 'Deleted decision', exists: false };
  }
  const x = data.experiments[ref.id];
  return x
    ? {
        ref,
        code: experimentCode(x.code),
        title: x.title,
        date: x.result?.recordedAt.slice(0, 10) ?? x.startDate,
        body: x.result?.summary ?? x.hypothesis,
        exists: true,
      }
    : { ref, code: 'Experiment', title: 'Deleted experiment', exists: false };
}

export const sameRef = (a: SourceRef, b: SourceRef) => a.kind === b.kind && a.id === b.id;

/** Every pattern that cites this record as evidence. */
export function usagesOfSource(data: AtlasData, ref: SourceRef): { pattern: Pattern; evidence: Evidence }[] {
  const out: { pattern: Pattern; evidence: Evidence }[] = [];
  for (const p of Object.values(data.patterns)) {
    for (const ev of p.evidence) if (sameRef(ev.source, ref)) out.push({ pattern: p, evidence: ev });
  }
  return out.sort((a, b) => a.pattern.code - b.pattern.code);
}

/* ---------------- patterns ---------------- */

export interface PatternStats {
  confidence: number;
  supportCount: number;
  counterCount: number;
  firstObserved?: ISODate;
  lastObserved?: ISODate;
  frequency: string;
  history: { date: ISODate; value: number; evidenceId: string }[];
}

export function patternStats(data: AtlasData, pattern: Pattern): PatternStats {
  const dateOf = (e: Evidence) => resolveSource(data, e.source).date;
  const supporting = pattern.evidence.filter((e) => e.stance === 'supports');
  const dates = supporting
    .map(dateOf)
    .filter((d): d is ISODate => Boolean(d))
    .sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const frequency = dates.length === 0 ? 'Not yet observed' : dates.length === 1 ? 'Observed once' : `${dates.length}× in ${formatSpan(first, last)}`;
  return {
    confidence: computeConfidence(pattern.evidence),
    supportCount: supporting.length,
    counterCount: pattern.evidence.length - supporting.length,
    firstObserved: first,
    lastObserved: last,
    frequency,
    history: confidenceHistory(pattern.evidence, dateOf),
  };
}

export function sortedPatterns(data: AtlasData, opts: { includeDismissed?: boolean } = {}): Pattern[] {
  return Object.values(data.patterns)
    .filter((p) => opts.includeDismissed || p.status !== 'dismissed')
    .sort((a, b) => {
      const la = patternStats(data, a).lastObserved ?? '';
      const lb = patternStats(data, b).lastObserved ?? '';
      return lb.localeCompare(la) || b.code - a.code;
    });
}

/* ---------------- nodes & graph ---------------- */

export interface DisplayNode {
  id: ID;
  label: string;
  summary: string;
  color: string;
  kindLabel: string;
  isHub: boolean;
  domain?: DomainKey;
  node?: AtlasNode;
  pattern?: Pattern;
}

/** A uniform view of hubs, atlas nodes and derived pattern nodes. */
export function displayNode(data: AtlasData, id: ID): DisplayNode | undefined {
  if (isHubId(id)) {
    const key = hubKey(id);
    const meta = DOMAIN_META[key];
    const domain = data.domains[key];
    if (!meta) return undefined;
    return {
      id,
      label: meta.label,
      summary: domain?.statement || meta.description,
      color: meta.color,
      kindLabel: 'Domain',
      isHub: true,
      domain: key,
    };
  }
  const pattern = data.patterns[id];
  if (pattern) {
    return {
      id,
      label: pattern.title,
      summary: pattern.observation,
      color: PATTERN_COLOR,
      kindLabel: patternCode(pattern.code),
      isHub: false,
      pattern,
    };
  }
  const node = data.nodes[id];
  if (!node) return undefined;
  const color = node.category ? CATEGORY_META[node.category].color : node.domain ? DOMAIN_META[node.domain].color : '#aab2bc';
  const kindLabel = node.category ? CATEGORY_META[node.category].label : node.domain ? DOMAIN_META[node.domain].label : 'Node';
  return { id, label: node.label, summary: node.summary, color, kindLabel, isHub: false, domain: node.domain, node };
}

export interface Neighbor {
  otherId: ID;
  relation: RelationType;
  direction: 'out' | 'in';
  edge?: AtlasEdge;
}

/**
 * Stored edges plus structural links: a hub contains its domain's nodes, and a
 * derived pattern node is linked to the nodes it names.
 */
export function neighbors(data: AtlasData, id: ID): Neighbor[] {
  const out: Neighbor[] = [];
  for (const e of Object.values(data.edges)) {
    if (e.source === id) out.push({ otherId: e.target, relation: e.relation, direction: 'out', edge: e });
    else if (e.target === id) out.push({ otherId: e.source, relation: e.relation, direction: 'in', edge: e });
  }
  if (isHubId(id)) {
    const key = hubKey(id);
    for (const n of Object.values(data.nodes)) if (n.domain === key) out.push({ otherId: n.id, relation: 'part_of', direction: 'in' });
  } else {
    const node = data.nodes[id];
    if (node?.domain) out.push({ otherId: hubId(node.domain), relation: 'part_of', direction: 'out' });
    const pattern = data.patterns[id];
    if (pattern) for (const nid of pattern.nodeIds) out.push({ otherId: nid, relation: 'derived_from', direction: 'out' });
    for (const p of Object.values(data.patterns)) {
      if (p.status !== 'dismissed' && p.nodeIds.includes(id)) out.push({ otherId: p.id, relation: 'derived_from', direction: 'in' });
    }
  }
  return out.filter((n) => displayNode(data, n.otherId));
}

/** All node ids within `depth` hops of `start`, restricted to `visible`. */
export function neighborhood(data: AtlasData, start: ID, depth: number, visible?: Set<ID>): Set<ID> {
  const seen = new Set<ID>([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next: ID[] = [];
    for (const id of frontier) {
      for (const n of neighbors(data, id)) {
        if (visible && !visible.has(n.otherId)) continue;
        if (!seen.has(n.otherId)) {
          seen.add(n.otherId);
          next.push(n.otherId);
        }
      }
    }
    frontier = next;
  }
  return seen;
}

/** Raw records that act as evidence for a node. Hubs collect their whole domain. */
export function evidenceForNode(data: AtlasData, id: ID): { entries: Entry[]; decisions: Decision[] } {
  let entries: Entry[];
  let decisions: Decision[];
  if (isHubId(id)) {
    const key = hubKey(id);
    entries = Object.values(data.entries).filter((e) => e.domains.includes(key));
    decisions = Object.values(data.decisions).filter((d) => d.domains.includes(key));
  } else {
    const node = data.nodes[id];
    entries = Object.values(data.entries).filter((e) => e.nodeIds.includes(id) || (node?.source?.kind === 'entry' && node.source.id === e.id));
    decisions = Object.values(data.decisions).filter((d) => d.nodeIds.includes(id) || (node?.source?.kind === 'decision' && node.source.id === d.id));
  }
  return {
    entries: entries.sort((a, b) => b.date.localeCompare(a.date)),
    decisions: decisions.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function patternsForNode(data: AtlasData, id: ID): Pattern[] {
  const hub = isHubId(id) ? hubKey(id) : undefined;
  const { entries, decisions } = evidenceForNode(data, id);
  const refs = new Set([...entries.map((e) => `entry:${e.id}`), ...decisions.map((d) => `decision:${d.id}`)]);
  return Object.values(data.patterns)
    .filter((p) => p.status !== 'dismissed')
    .filter((p) => p.nodeIds.includes(id) || (hub && p.domains.includes(hub)) || (!hub && p.evidence.some((e) => refs.has(`${e.source.kind}:${e.source.id}`))))
    .sort((a, b) => a.code - b.code);
}

export function questionNodes(data: AtlasData): AtlasNode[] {
  const order = { exploring: 0, open: 1, resolved: 2 } as const;
  return Object.values(data.nodes)
    .filter((n) => n.category === 'question')
    .sort((a, b) => order[a.status ?? 'open'] - order[b.status ?? 'open'] || a.createdAt.localeCompare(b.createdAt));
}

/** Entries touching a domain in the last `days` days: where attention went. */
export function domainActivity(data: AtlasData, key: DomainKey, days = 60, today = todayISO()): number {
  const from = addDays(today, -days);
  return Object.values(data.entries).filter((e) => e.domains.includes(key) && e.date >= from && e.date <= today).length;
}

/* ---------------- decisions ---------------- */

export type DecisionHorizon = 'immediate' | 'long_term' | 'neutral';

/** Classifies a decision by the drivers the user said it optimised for. */
export function decisionHorizon(decision: Pick<Decision, 'optimizingFor'>): DecisionHorizon {
  let immediate = 0;
  let longTerm = 0;
  for (const d of decision.optimizingFor) {
    const h = DRIVER_HORIZON[d];
    if (h === 'immediate') immediate++;
    if (h === 'long_term') longTerm++;
  }
  if (immediate > longTerm) return 'immediate';
  if (longTerm > immediate) return 'long_term';
  return 'neutral';
}

export function sortedDecisions(data: AtlasData): Decision[] {
  return Object.values(data.decisions).sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq);
}

export function sortedEntries(data: AtlasData): Entry[] {
  return Object.values(data.entries).sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq);
}

/* ---------------- experiments & navigation ---------------- */

export interface ExperimentProgress {
  day: number;
  total: number;
  ratio: number;
  endDate?: ISODate;
  overdue: boolean;
}

export function experimentProgress(x: Experiment, today = todayISO()): ExperimentProgress {
  if (!x.startDate) return { day: 0, total: x.durationDays, ratio: 0, overdue: false };
  const endDate = addDays(x.startDate, x.durationDays - 1);
  const raw = daysBetween(x.startDate, today) + 1;
  const day = Math.max(0, Math.min(x.durationDays, raw));
  return {
    day,
    total: x.durationDays,
    ratio: x.status === 'completed' ? 1 : day / x.durationDays,
    endDate,
    overdue: x.status === 'running' && raw > x.durationDays,
  };
}

export function currentExperiment(data: AtlasData): Experiment | undefined {
  const running = Object.values(data.experiments).filter((x) => x.status === 'running');
  // The shortest running experiment is the one closest to producing a result.
  return running.sort((a, b) => a.durationDays - b.durationDays)[0];
}

export interface NavigationProgress {
  targetsDone: number;
  targetsTotal: number;
  week: ISODate;
  weekActions: NavigationPlan['actions'];
  weekDone: number;
  objectiveRatio: number;
  daysToMilestone: number;
}

export function navigationProgress(plan: NavigationPlan, today = todayISO()): NavigationProgress {
  const week = weekStart(today);
  // Show the current week; fall back to the most recent planned week.
  const weeks = [...new Set(plan.actions.map((a) => a.week))].sort();
  const shownWeek = weeks.includes(week) ? week : (weeks.filter((w) => w <= week).pop() ?? weeks[0] ?? week);
  const weekActions = plan.actions.filter((a) => a.week === shownWeek);
  const span = Math.max(1, daysBetween(plan.committedAt, plan.objective.targetDate));
  return {
    targetsDone: plan.targets.filter((t) => t.done).length,
    targetsTotal: plan.targets.length,
    week: shownWeek,
    weekActions,
    weekDone: weekActions.filter((a) => a.status === 'done').length,
    objectiveRatio: Math.max(0, Math.min(1, daysBetween(plan.committedAt, today) / span)),
    daysToMilestone: daysBetween(today, plan.milestone.due),
  };
}

export function currentAction(plan: NavigationPlan | null) {
  if (!plan) return undefined;
  const byId = plan.actions.find((a) => a.id === plan.currentActionId && a.status === 'todo');
  return byId ?? plan.actions.find((a) => a.status === 'todo');
}

/* ---------------- model summary ---------------- */

export function modelCounts(data: AtlasData) {
  const entries = Object.values(data.entries);
  const observations = entries.reduce((n, e) => n + (e.analysis?.observations.length ?? 0), 0);
  const patterns = Object.values(data.patterns);
  return {
    records: entries.length + Object.keys(data.decisions).length,
    observations,
    evidence: patterns.reduce((n, p) => n + p.evidence.length, 0),
    patterns: patterns.filter((p) => p.status !== 'dismissed').length,
    nodes: Object.keys(data.nodes).length,
    paths: Object.keys(data.paths).length,
    experiments: Object.values(data.experiments).filter((x) => x.status === 'running' || x.status === 'proposed').length,
    updates: data.modelLog.length,
  };
}

/** Pending analysis suggestions across all entries. */
export function pendingSuggestions(data: AtlasData) {
  const out: { entry: Entry; suggestion: NonNullable<Entry['analysis']>['suggestions'][number] }[] = [];
  for (const entry of Object.values(data.entries)) {
    for (const s of entry.analysis?.suggestions ?? []) if (s.state === 'pending') out.push({ entry, suggestion: s });
  }
  return out;
}
