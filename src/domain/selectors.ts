/**
 * Pure, derived queries over AtlasData. Components read through these so the
 * same relationship logic (backlinks, neighbourhoods, statistics) is defined
 * exactly once.
 */
import { addDays, dateOf, daysBetween, formatSpan, todayISO, weekStart } from '../lib/dates';
import { pad2 } from '../lib/text';
import { claimStatus } from './claims';
import { AREA_META, areaHubKey, DRIVER_HORIZON, isAreaHubId, KIND_META, SECTOR_KEYS, YOU_ID } from './constants';
import type {
  AreaKey,
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Claim,
  Decision,
  Effect,
  Entry,
  Evidence,
  Experiment,
  ID,
  ISODate,
  LinkType,
  NavigationPlan,
  Pattern,
  Regularity,
  SourceRef,
} from './types';
import { t } from '../i18n';

/* ---------------- codes ---------------- */

export const entryCode = (seq: number) => t('Entry #{n}', { n: pad2(seq) });
export const decisionCode = (seq: number) => t('Decision #{n}', { n: pad2(seq) });
export const patternCode = (code: number) => t('Pattern {code}', { code: pad2(code) });
export const experimentCode = (code: number) => `EXP-${pad2(code)}`;
export const pathCode = (code: string) => t('Path {code}', { code });

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
      : { ref, code: t('Entry'), title: t('Deleted entry'), exists: false };
  }
  if (ref.kind === 'decision') {
    const d = data.decisions[ref.id];
    return d
      ? { ref, code: decisionCode(d.seq), title: d.title, date: d.date, body: d.actualOutcome || d.context, exists: true }
      : { ref, code: t('Decision'), title: t('Deleted decision'), exists: false };
  }
  if (ref.kind === 'occurrence') {
    const o = data.occurrences[ref.id];
    if (!o) return { ref, code: t('Event'), title: t('Deleted event'), exists: false };
    const from = o.source ? resolveSource(data, o.source) : undefined;
    return { ref, code: from?.code ?? t('History'), title: o.label, date: o.date, body: o.excerpt ?? from?.body, exists: true };
  }
  const x = data.experiments[ref.id];
  return x
    ? {
        ref,
        code: experimentCode(x.code),
        title: x.title,
        date: x.result ? dateOf(x.result.recordedAt) : x.startDate,
        body: x.result?.summary ?? x.hypothesis,
        exists: true,
      }
    : { ref, code: t('Experiment'), title: t('Deleted experiment'), exists: false };
}

export const sameRef = (a: SourceRef, b: SourceRef) => a.kind === b.kind && a.id === b.id;

/** Every claim and pattern that cites this record. */
export function usagesOfSource(data: AtlasData, ref: SourceRef): { pattern?: Pattern; claim?: Claim; evidence: Evidence }[] {
  const out: { pattern?: Pattern; claim?: Claim; evidence: Evidence }[] = [];
  for (const p of Object.values(data.patterns)) for (const ev of p.evidence) if (sameRef(ev.source, ref)) out.push({ pattern: p, evidence: ev });
  for (const c of Object.values(data.claims)) for (const ev of c.evidence) if (sameRef(ev.source, ref)) out.push({ claim: c, evidence: ev });
  return out;
}

/* ---------------- patterns ---------------- */

export interface PatternStats {
  regularity: Regularity;
  /** Supporting instances. */
  instances: number;
  /** Separate weeks the instances fall in. */
  episodes: number;
  counter: number;
  firstObserved?: ISODate;
  lastObserved?: ISODate;
  frequency: string;
  points: { date: ISODate; stance: Evidence['stance']; evidenceId: string }[];
}

export function patternStats(data: AtlasData, pattern: Pattern, today: ISODate = todayISO()): PatternStats {
  const points = pattern.evidence
    .map((e) => ({ date: resolveSource(data, e.source).date, stance: e.stance, evidenceId: e.id }))
    .filter((p): p is { date: ISODate; stance: Evidence['stance']; evidenceId: string } => Boolean(p.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  const supporting = points.filter((p) => p.stance === 'supports');
  const episodes = new Set(supporting.map((p) => weekStart(p.date))).size;
  const first = supporting[0]?.date;
  const last = supporting[supporting.length - 1]?.date;
  const latest = points[points.length - 1];
  const regularity: Regularity = episodes < 3 ? 'emerging' : latest?.stance === 'counters' || (last && daysBetween(last, today) > 90) ? 'fading' : 'recurring';
  const frequency =
    supporting.length === 0
      ? t('Not yet observed')
      : supporting.length === 1
        ? t('Observed once')
        : t('{n}× in {span}', { n: supporting.length, span: formatSpan(first!, last!) });
  return {
    regularity,
    instances: supporting.length,
    episodes,
    counter: points.length - supporting.length,
    firstObserved: first,
    lastObserved: last,
    frequency,
    points,
  };
}

export const patternLive = (p: Pattern) => !p.setAside;

export function sortedPatterns(data: AtlasData, opts: { includeSetAside?: boolean } = {}): Pattern[] {
  return Object.values(data.patterns)
    .filter((p) => opts.includeSetAside || patternLive(p))
    .sort((a, b) => {
      const la = patternStats(data, a).lastObserved ?? '';
      const lb = patternStats(data, b).lastObserved ?? '';
      return lb.localeCompare(la) || b.code - a.code;
    });
}

export const patternTitle = (p: Pattern) => (p.steps.length ? p.steps.map((s) => s.label).join(' → ') : p.title);

/* ---------------- elements ---------------- */

/** Elements on the map: the person's own, and proposals they adopted. */
export const mapElements = (data: AtlasData) => Object.values(data.nodes).filter((n) => n.adopted);
/** Proposals from the analysis waiting for the person's yes or no. */
export const suggestedElements = (data: AtlasData) => Object.values(data.nodes).filter((n) => !n.adopted);

export interface DisplayNode {
  id: ID;
  label: string;
  summary: string;
  color: string;
  kindLabel: string;
  isHub: boolean;
  area?: AreaKey;
  node?: AtlasNode;
  pattern?: Pattern;
}

/** A uniform view of the centre, area markers, elements and patterns. */
export function displayNode(data: AtlasData, id: ID): DisplayNode | undefined {
  if (id === YOU_ID) {
    return {
      id,
      label: data.profile.name || t('You'),
      summary: data.areas.self?.statement || AREA_META.self.description,
      color: AREA_META.self.color,
      kindLabel: t('You'),
      isHub: true,
      area: 'self',
    };
  }
  if (isAreaHubId(id)) {
    const key = areaHubKey(id);
    const meta = AREA_META[key];
    if (!meta) return undefined;
    return {
      id,
      label: meta.label,
      summary: data.areas[key]?.statement || meta.description,
      color: meta.color,
      kindLabel: t('Area'),
      isHub: true,
      area: key,
    };
  }
  const pattern = data.patterns[id];
  if (pattern) {
    return { id, label: pattern.title, summary: pattern.observation, color: '#ece8df', kindLabel: patternCode(pattern.code), isHub: false, pattern };
  }
  const node = data.nodes[id];
  if (!node) return undefined;
  return {
    id,
    label: node.label,
    summary: node.summary,
    color: AREA_META[node.area]?.color ?? '#aab2bc',
    kindLabel: KIND_META[node.kind]?.label ?? t('Element'),
    isHub: false,
    area: node.area,
    node,
  };
}

export type NeighborRelation = { family: 'link'; type: LinkType } | { family: 'claim'; effect: Effect; claimId: ID } | { family: 'pattern' };

export interface Neighbor {
  otherId: ID;
  relation: NeighborRelation;
  direction: 'out' | 'in';
  edge?: AtlasEdge;
}

/** Declared links, adopted claims, and the patterns an element takes part in. */
export function neighbors(data: AtlasData, id: ID): Neighbor[] {
  const out: Neighbor[] = [];
  for (const e of Object.values(data.edges)) {
    if (e.source === id) out.push({ otherId: e.target, relation: { family: 'link', type: e.type }, direction: 'out', edge: e });
    else if (e.target === id) out.push({ otherId: e.source, relation: { family: 'link', type: e.type }, direction: 'in', edge: e });
  }
  for (const c of Object.values(data.claims)) {
    if (c.state !== 'adopted') continue;
    const rel = { family: 'claim' as const, effect: c.effect, claimId: c.id };
    if (c.from === id || c.with.includes(id)) out.push({ otherId: c.to, relation: rel, direction: 'out' });
    if (c.to === id) {
      out.push({ otherId: c.from, relation: rel, direction: 'in' });
      for (const w of c.with) out.push({ otherId: w, relation: rel, direction: 'in' });
    }
  }
  const pattern = data.patterns[id];
  if (pattern) for (const nid of pattern.nodeIds) out.push({ otherId: nid, relation: { family: 'pattern' }, direction: 'out' });
  for (const p of Object.values(data.patterns))
    if (patternLive(p) && p.nodeIds.includes(id)) out.push({ otherId: p.id, relation: { family: 'pattern' }, direction: 'in' });
  return out.filter((n) => n.otherId !== id && displayNode(data, n.otherId));
}

/** All ids within `depth` hops of `start`, restricted to `visible`. */
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

/** Notes and decisions about an element. The centre and area markers collect their whole territory. */
export function recordsFor(data: AtlasData, id: ID): { entries: Entry[]; decisions: Decision[] } {
  let entries: Entry[];
  let decisions: Decision[];
  const area = id === YOU_ID ? 'self' : isAreaHubId(id) ? areaHubKey(id) : undefined;
  if (area) {
    entries = Object.values(data.entries).filter((e) => e.areas.includes(area));
    decisions = Object.values(data.decisions).filter((d) => d.areas.includes(area));
  } else {
    entries = Object.values(data.entries).filter((e) => e.nodeIds.includes(id));
    decisions = Object.values(data.decisions).filter((d) => d.nodeIds.includes(id));
  }
  return {
    entries: entries.sort((a, b) => b.date.localeCompare(a.date)),
    decisions: decisions.sort((a, b) => b.date.localeCompare(a.date)),
  };
}

export function patternsForNode(data: AtlasData, id: ID): Pattern[] {
  const area = id === YOU_ID ? 'self' : isAreaHubId(id) ? areaHubKey(id) : undefined;
  return Object.values(data.patterns)
    .filter(patternLive)
    .filter((p) => (area ? p.areas.includes(area) : p.nodeIds.includes(id) || p.steps.some((s) => s.elementId === id)))
    .sort((a, b) => a.code - b.code);
}

export function questionNodes(data: AtlasData): AtlasNode[] {
  const order = { exploring: 0, open: 1, resolved: 2 } as const;
  return mapElements(data)
    .filter((n) => n.kind === 'question')
    .sort((a, b) => order[a.status ?? 'open'] - order[b.status ?? 'open'] || a.createdAt.localeCompare(b.createdAt));
}

/** Notes touching an area in the last `days` days: where attention went. */
export function areaActivity(data: AtlasData, key: AreaKey, days = 60, today = todayISO()): number {
  const from = addDays(today, -days);
  return Object.values(data.entries).filter((e) => e.areas.includes(key) && e.date >= from && e.date <= today).length;
}

/* ---------------- where understanding is thin ---------------- */

export interface ThinSpots {
  /** Areas with no notes in the last 60 days. */
  quietAreas: AreaKey[];
  /** Outcomes of concern with no claim explaining them. */
  unexplained: AtlasNode[];
  /** Beliefs never held up against the record. */
  untestedBeliefs: AtlasNode[];
  /** Claims with nothing behind them yet. */
  bareClaims: Claim[];
}

export function thinSpots(data: AtlasData, today = todayISO()): ThinSpots {
  const elements = mapElements(data);
  const adopted = Object.values(data.claims).filter((c) => c.state === 'adopted' && !c.retired);
  return {
    quietAreas: SECTOR_KEYS.filter((k) => elements.some((n) => n.area === k) && areaActivity(data, k, 60, today) === 0),
    unexplained: elements.filter((n) => n.concern && !adopted.some((c) => c.to === n.id)),
    untestedBeliefs: elements.filter((n) => n.kind === 'belief' && (!n.claimId || !data.claims[n.claimId]?.evidence.length)),
    bareClaims: adopted.filter((c) => claimStatus(data, c) === 'proposed'),
  };
}

/* ---------------- decisions ---------------- */

export type DecisionHorizon = 'immediate' | 'long_term' | 'neutral';

/** Classifies a decision by the reasons the person gave for it. */
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

/** Expected vs actual across reviewed decisions: how well consequences were foreseen. */
export function calibration(data: AtlasData): { reviewed: number; asExpected: number; better: number; worse: number; mixed: number } {
  const rated = Object.values(data.decisions).filter((d) => d.outcomeRating);
  return {
    reviewed: rated.length,
    asExpected: rated.filter((d) => d.outcomeRating === 'as_expected').length,
    better: rated.filter((d) => d.outcomeRating === 'better').length,
    worse: rated.filter((d) => d.outcomeRating === 'worse').length,
    mixed: rated.filter((d) => d.outcomeRating === 'mixed').length,
  };
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
  // The shortest running test is the one closest to producing a result.
  return running.sort((a, b) => a.durationDays - b.durationDays)[0];
}

export const testsOfClaim = (data: AtlasData, claimId: ID) => Object.values(data.experiments).filter((x) => x.claimId === claimId);

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
    targetsDone: plan.targets.filter((x) => x.done).length,
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
  const claims = Object.values(data.claims).filter((c) => c.state === 'adopted');
  return {
    records: entries.length + Object.keys(data.decisions).length,
    occurrences: Object.keys(data.occurrences).length,
    observations,
    evidence: patterns.reduce((n, p) => n + p.evidence.length, 0) + claims.reduce((n, c) => n + c.evidence.length, 0),
    patterns: patterns.filter(patternLive).length,
    claims: claims.length,
    nodes: mapElements(data).length,
    paths: Object.keys(data.paths).length,
    experiments: Object.values(data.experiments).filter((x) => x.status === 'running' || x.status === 'proposed').length,
    updates: data.modelLog.length,
  };
}

/** Pending analysis suggestions across all notes. */
export function pendingSuggestions(data: AtlasData) {
  const out: { entry: Entry; suggestion: NonNullable<Entry['analysis']>['suggestions'][number] }[] = [];
  for (const entry of Object.values(data.entries)) {
    for (const s of entry.analysis?.suggestions ?? []) if (s.state === 'pending') out.push({ entry, suggestion: s });
  }
  return out;
}
