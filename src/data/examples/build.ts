/**
 * The example atlases, written compactly and built into full atlases here.
 *
 * Each example is one invented person in a kind of work (designer, accountant, manager, director, producer, data
 * scientist, programmer) or a student, written in Indonesian, with about five months of records: notes in their own
 * words, what those notes report (dated, each traced to its note), the elements of their life on the Map, possible
 * reasons with evidence of a kind (so their statuses differ and are derived, as in the Noa sample in ../seed.ts),
 * things that keep happening, options never ranked, a chosen direction broken into steps, and quests.
 *
 * Dates are written against an anchor week and shifted by whole weeks at load time, so an example always reads as
 * recent and its weekly plan stays aligned with this week. Everything is invented. Nothing is a diagnosis.
 */
import { analyzeEntryLocally } from '../../ai/localAnalysis';
import { AREA_KEYS } from '../../domain/constants';
import type {
  Area,
  AreaKey,
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Claim,
  ClaimState,
  Decision,
  Effect,
  ElementKind,
  Entry,
  EntryKind,
  Evidence,
  EvidenceKind,
  FactorReading,
  LinkType,
  NavActionStatus,
  Occurrence,
  OccurrenceKind,
  OutcomeRating,
  Origin,
  Pattern,
  PatternKind,
  QuestionStatus,
  SkillStatus,
  SourceRef,
  Stance,
  StrategicPath,
} from '../../domain/types';
import { addDays, daysBetween, todayISO, weekStart } from '../../lib/dates';

export type ExampleKey = 'designer' | 'accountant' | 'manager' | 'director' | 'producer' | 'data' | 'programmer' | 'student';

/** [id, kind, area, label, summary, options] */
export type ElementSpec = [
  string,
  ElementKind,
  AreaKey,
  string,
  string,
  { since?: string; until?: string; concern?: boolean; external?: boolean; level?: SkillStatus; status?: QuestionStatus }?,
];

export interface NoteSpec {
  n: number;
  date: string;
  title: string;
  text: string;
  about: string[];
  areas: AreaKey[];
  kind?: EntryKind;
  /** 1–5 and -2–+2, as recorded with the note. */
  energy?: number;
  mood?: number;
  emotions?: string[];
  tags?: string[];
}

export interface HappeningSpec {
  id: string;
  kind: OccurrenceKind;
  date: string;
  label: string;
  /** The note that reports it. */
  note: number;
  about: string[];
  changes?: [string, FactorReading][];
  landmark?: boolean;
  excerpt?: string;
}

export interface DecisionSpec {
  n: number;
  date: string;
  title: string;
  context: string;
  /** [label, why it was considered, what it was expected to bring, what might have happened (not taken)] */
  options: [string, string, string?, string?][];
  chosen: number;
  action: string;
  expected: string;
  enacted?: Decision['enacted'];
  actual?: string;
  rating?: OutcomeRating;
  learned?: string;
  nextTime?: string;
  optimizingFor: string[];
  reasons?: string[];
  areas: AreaKey[];
  about: string[];
  reviewed?: string;
}

export interface EvidenceSpec {
  note?: number;
  decision?: number;
  stance?: Stance;
  kind: EvidenceKind;
  excerpt: string;
  /** For an instance drawn from two notes: the earlier note showing the cause. */
  cause?: number;
}

export interface ReasonSpec {
  id: string;
  code: number;
  from: string;
  effect: Effect;
  to: string;
  via?: string;
  lag?: string;
  state?: ClaimState;
  author?: Origin;
  rivals?: string[];
  evidence: EvidenceSpec[];
  at: string;
}

export interface RepeatSpec {
  id: string;
  code: number;
  kind?: PatternKind;
  title: string;
  steps: [string, string?][];
  observation: string;
  triggers: string[];
  behaviors: string[];
  consequences: string[];
  areas: AreaKey[];
  cues: { supports: string[]; counters: string[] };
  evidence: { note?: number; decision?: number; stance: Stance; excerpt: string }[];
  explainedBy?: string[];
  implications?: [string, string[]][];
  at: string;
}

export interface OptionSpec {
  id: string;
  code: string;
  title: string;
  objective: string;
  summary: string;
  requirements: string[];
  dependencies: string[];
  skills: [string, SkillStatus][];
  capital: string;
  time: string;
  risks: string[];
  tradeoffs: string[];
  opportunityCosts: string[];
  unknowns: string[];
  assumptions: string[];
  proposedExperiments: string[];
  patternIds: string[];
}

/** [id, title, due, done] and [id, title, target, week (any day in it), status] */
export type TargetSpec = [string, string, string, boolean];
export type ActionSpec = [string, string, string | undefined, string, NavActionStatus];

export interface PlanSpec {
  path: string;
  committedAt: string;
  position: string;
  objective: { title: string; description: string; targetDate: string };
  milestone: { title: string; due: string };
  targets: TargetSpec[];
  actions: ActionSpec[];
  current?: string;
}

export interface ExampleSpec {
  key: ExampleKey;
  name: string;
  since: string;
  areas: Record<AreaKey, [string, string]>;
  state: { position: string; summary: string; constraints: string[]; assets: string[] };
  elements: ElementSpec[];
  links: [string, LinkType, string][];
  notes: NoteSpec[];
  happenings: HappeningSpec[];
  decisions: DecisionSpec[];
  reasons: ReasonSpec[];
  repeats: RepeatSpec[];
  options: OptionSpec[];
  plan: PlanSpec;
  own?: { targets: TargetSpec[]; actions: ActionSpec[] };
  /** The state element the energy recorded with each note is a reading of (s_energi when not named). */
  energy?: string;
  loopNames?: [string[], string][];
}

const ANCHOR_WEEK = '2026-09-28';
const pad = (n: number) => String(n).padStart(2, '0');

/** An example, built into a full atlas whose dates end in the week of `today`. */
export function buildExample(spec: ExampleSpec, today: string = todayISO()): AtlasData {
  const offset = daysBetween(ANCHOR_WEEK, weekStart(today));
  const D = (date: string) => addDays(date, offset);
  const T = (date: string, time = '09:00:00') => `${D(date)}T${time}.000Z`;
  const E = (n: number): SourceRef => ({ kind: 'entry', id: `ent_${pad(n)}` });
  const Dc = (n: number): SourceRef => ({ kind: 'decision', id: `dec_${pad(n)}` });
  const source = (x: { note?: number; decision?: number }): SourceRef => (x.decision ? Dc(x.decision) : E(x.note ?? 1));

  const nodes: Record<string, AtlasNode> = {};
  for (const [id, kind, area, label, summary, o = {}] of spec.elements) {
    const at = T(spec.since);
    nodes[id] = {
      id,
      label,
      summary,
      kind,
      area,
      origin: 'user',
      adopted: true,
      since: o.since ? D(o.since) : undefined,
      until: o.until ? D(o.until) : undefined,
      concern: o.concern,
      external: o.external,
      level: o.level,
      status: kind === 'question' ? (o.status ?? 'open') : o.status,
      tags: id === (spec.energy ?? 's_energi') ? ['energy'] : [],
      createdAt: at,
      updatedAt: at,
    };
  }

  const edges: Record<string, AtlasEdge> = {};
  spec.links.forEach(([s, type, t], i) => {
    const id = `l${pad(i + 1)}`;
    edges[id] = { id, source: s, target: t, type, origin: 'user', createdAt: T(spec.since) };
  });

  const entries: Record<string, Entry> = {};
  for (const n of spec.notes) {
    const id = `ent_${pad(n.n)}`;
    entries[id] = {
      id,
      seq: n.n,
      kind: n.kind ?? 'journal',
      title: n.title,
      content: n.text,
      date: D(n.date),
      areas: n.areas,
      tags: n.tags ?? [],
      nodeIds: n.about,
      context: n.energy !== undefined || n.mood !== undefined || n.emotions ? { energy: n.energy, mood: n.mood, emotions: n.emotions } : undefined,
      createdAt: T(n.date, '20:00:00'),
      updatedAt: T(n.date, '20:00:00'),
    };
  }
  const firstSentence = (n: number) => (spec.notes.find((x) => x.n === n)?.text.split(/(?<=[.!?])\s/)[0] ?? '').slice(0, 200);

  const occurrences: Record<string, Occurrence> = {};
  for (const h of spec.happenings)
    occurrences[h.id] = {
      id: h.id,
      kind: h.kind,
      label: h.label,
      date: D(h.date),
      about: h.about,
      landmark: h.landmark,
      source: E(h.note),
      excerpt: h.excerpt ?? firstSentence(h.note),
      changes: h.changes?.map(([factor, reads]) => ({ factor, reads })),
      mode: 'actual',
      origin: 'user',
      createdAt: T(h.date, '20:05:00'),
    };

  const decisions: Record<string, Decision> = {};
  for (const d of spec.decisions) {
    const id = `dec_${pad(d.n)}`;
    decisions[id] = {
      id,
      seq: d.n,
      title: d.title,
      date: D(d.date),
      context: d.context,
      options: d.options.map(([label, rationale, expected, imagined], i) => ({ id: `o${i + 1}`, label, rationale, expected, imagined })),
      chosenOptionId: `o${d.chosen + 1}`,
      chosenAction: d.action,
      expectedOutcome: d.expected,
      enacted: d.enacted,
      actualOutcome: d.actual,
      outcomeRating: d.rating,
      learned: d.learned,
      nextTime: d.nextTime,
      optimizingFor: d.optimizingFor,
      claimIds: d.reasons ?? [],
      areas: d.areas,
      tags: [],
      nodeIds: d.about,
      reviewedAt: d.reviewed ? T(d.reviewed) : undefined,
      createdAt: T(d.date, '21:00:00'),
      updatedAt: T(d.date, '21:00:00'),
    };
  }

  const claims: Record<string, Claim> = {};
  for (const r of spec.reasons) {
    const evidence: Evidence[] = r.evidence.map((e, i) => ({
      id: `${r.id}e${i + 1}`,
      source: source(e),
      cause: e.cause ? E(e.cause) : undefined,
      stance: e.stance ?? 'supports',
      kind: e.kind,
      excerpt: e.excerpt,
      addedBy: 'user',
      addedAt: T(r.at),
    }));
    claims[r.id] = {
      id: r.id,
      code: r.code,
      from: r.from,
      with: [],
      to: r.to,
      effect: r.effect,
      via: r.via,
      lag: r.lag,
      author: r.author ?? 'user',
      state: r.state ?? 'adopted',
      evidence,
      rivalIds: r.rivals ?? [],
      createdAt: T(r.at),
      updatedAt: T(r.at),
    };
  }

  const patterns: Record<string, Pattern> = {};
  for (const p of spec.repeats)
    patterns[p.id] = {
      id: p.id,
      code: p.code,
      kind: p.kind ?? 'behavioral',
      title: p.title,
      steps: p.steps.map(([label, elementId]) => ({ label, elementId })),
      observation: p.observation,
      triggers: p.triggers,
      behaviors: p.behaviors,
      consequences: p.consequences,
      evidence: p.evidence.map((e, i) => ({
        id: `${p.id}e${i + 1}`,
        source: source(e),
        stance: e.stance,
        excerpt: e.excerpt,
        addedBy: e.stance === 'counters' ? 'user' : 'inferred',
        addedAt: T(p.at),
      })),
      explainedBy: p.explainedBy ?? [],
      implications: (p.implications ?? []).map(([statement, pathIds], i) => ({ id: `${p.id}i${i + 1}`, statement, pathIds })),
      areas: p.areas,
      nodeIds: p.steps.flatMap(([, id]) => (id ? [id] : [])),
      cues: p.cues,
      origin: 'inferred',
      createdAt: T(p.at),
      updatedAt: T(p.at),
    };

  const paths: Record<string, StrategicPath> = {};
  for (const o of spec.options)
    paths[o.id] = {
      id: o.id,
      code: o.code,
      title: o.title,
      objective: o.objective,
      summary: o.summary,
      requirements: o.requirements,
      dependencies: o.dependencies,
      skills: o.skills.map(([label, status]) => ({ label, status })),
      capital: o.capital,
      time: o.time,
      risks: o.risks,
      tradeoffs: o.tradeoffs,
      opportunityCosts: o.opportunityCosts,
      unknowns: o.unknowns,
      assumptionIds: o.assumptions,
      proposedExperiments: o.proposedExperiments,
      experimentIds: [],
      patternIds: o.patternIds,
      createdAt: T(spec.plan.committedAt),
      updatedAt: T(spec.plan.committedAt),
    };

  const wk = (date: string) => weekStart(D(date));
  const target = ([id, title, due, done]: TargetSpec) => ({
    id,
    title,
    due: D(due),
    done,
    doneAt: done ? (D(due) < D(ANCHOR_WEEK) ? D(due) : D(ANCHOR_WEEK)) : undefined,
  });
  const action = ([id, title, targetId, week, status]: ActionSpec) => ({
    id,
    title,
    targetId,
    week: wk(week),
    status,
    doneAt: status === 'done' ? addDays(wk(week), 2) : undefined,
  });
  const p = spec.plan;
  const navigation: AtlasData['navigation'] = {
    pathId: p.path,
    committedAt: D(p.committedAt),
    position: p.position,
    objective: { ...p.objective, targetDate: D(p.objective.targetDate) },
    milestone: { title: p.milestone.title, due: D(p.milestone.due) },
    targets: p.targets.map(target),
    actions: p.actions.map(action),
    currentActionId: p.current,
  };

  const now = T(ANCHOR_WEEK);
  const areas = Object.fromEntries(
    AREA_KEYS.map((key) => [key, { key, statement: spec.areas[key][0], summary: spec.areas[key][1], updatedAt: now } satisfies Area]),
  ) as Record<AreaKey, Area>;
  const loopId = (ids: string[]) => [...ids].sort().join('|');

  const data: AtlasData = {
    profile: { name: spec.name, since: D(spec.since), example: spec.key },
    areas,
    nodes,
    edges,
    claims,
    occurrences,
    entries,
    decisions,
    patterns,
    paths,
    experiments: {},
    currentState: { ...spec.state, updatedAt: now },
    navigation,
    modelLog: [],
    counters: {
      entry: Math.max(0, ...spec.notes.map((n) => n.n)),
      decision: Math.max(0, ...spec.decisions.map((d) => d.n)),
      pattern: Math.max(0, ...spec.repeats.map((r) => r.code)),
      experiment: 0,
      claim: Math.max(0, ...spec.reasons.map((r) => r.code)),
    },
    loopNames: Object.fromEntries((spec.loopNames ?? []).map(([ids, name]) => [loopId(ids), name])),
    causesLogic: 4,
    quests: spec.own ? { armor: {}, upgrades: [], own: { targets: spec.own.targets.map(target), actions: spec.own.actions.map(action) } } : undefined,
  };

  // Every note carries the same structured reading a new note gets; older suggestions read as already reviewed,
  // the last two weeks keep an open inbox.
  const reviewedBefore = D('2026-09-14');
  for (const e of Object.values(data.entries)) {
    const analysis = analyzeEntryLocally(e, data, e.createdAt);
    if (e.date < reviewedBefore) for (const s of analysis.suggestions) if (s.state === 'pending') s.state = 'dismissed';
    e.analysis = analysis;
  }
  return data;
}
