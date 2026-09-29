/**
 * From the first data shape (v1: ten "domains", nodes with a domain or a
 * mental category, nine edge types, patterns with numeric confidence) to the
 * layered model (v2: life areas × layers, declared links vs claims, history,
 * derived statuses).
 *
 * What changes meaning is converted conservatively:
 * - domains become areas; nodes become elements of a kind;
 * - "decision" and "experience" nodes were mirrors of records: decisions
 *   already live in history, experiences become landmark occurrences;
 * - edges that claimed an effect (causes, influences, supports, depends on,
 *   derived from) become claims the person made, with no evidence yet;
 *   edges that only organised (part of, conflicts, examines) become links;
 *   "contradicts" was about evidence, not the world, and is dropped;
 * - patterns keep their evidence; numeric confidence and interpretations go.
 *
 * An atlas that is still the sample (with or without notes of the person's
 * own) is rebuilt from the new sample and keeps everything the person added.
 */
import { createSeedData, SEED_PROFILE_NAME } from '../data/seed';
import type {
  AnalysisSuggestion,
  AreaKey,
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Claim,
  Decision,
  Effect,
  ElementKind,
  Entry,
  Experiment,
  LinkType,
  Occurrence,
  Pattern,
  StrategicPath,
} from '../domain/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type V1 = Record<string, any>;

const DOMAIN_TO_AREA: Record<string, AreaKey> = {
  identity: 'self',
  values: 'self',
  goals: 'projects',
  career: 'work',
  skills: 'growth',
  projects: 'projects',
  finance: 'money',
  relationships: 'people',
  environment: 'place',
  habits: 'health',
};

const DOMAIN_TO_KIND: Record<string, ElementKind> = {
  identity: 'belief',
  values: 'value',
  goals: 'goal',
  career: 'role',
  skills: 'skill',
  projects: 'commitment',
  finance: 'resource',
  relationships: 'person',
  environment: 'place',
  habits: 'behaviour',
};

const CATEGORY_TO_KIND: Record<string, ElementKind | null> = {
  belief: 'belief',
  assumption: 'belief',
  mental_model: 'belief',
  motivation: 'value',
  fear: 'fear',
  value: 'value',
  question: 'question',
  decision: null,
  experience: null,
};

const areasOf = (domains: unknown): AreaKey[] => [...new Set(((domains as string[]) ?? []).map((d) => DOMAIN_TO_AREA[d]).filter(Boolean))];

export const isV2 = (data: unknown): data is AtlasData => Boolean(data && typeof data === 'object' && 'areas' in data && 'claims' in data);

function convertNode(n: V1): AtlasNode | null {
  const byCategory = n.category ? CATEGORY_TO_KIND[n.category] : undefined;
  if (n.category && byCategory === null) return null;
  const kind: ElementKind = byCategory ?? DOMAIN_TO_KIND[n.domain] ?? 'belief';
  const area: AreaKey = n.domain ? DOMAIN_TO_AREA[n.domain] : 'self';
  const level = kind === 'skill' ? (n.tags ?? []).find((x: string) => x === 'have' || x === 'developing' || x === 'gap') : undefined;
  return {
    id: n.id,
    label: n.label ?? '',
    summary: n.summary ?? '',
    kind,
    area,
    origin: n.origin === 'inferred' ? 'inferred' : 'user',
    adopted: true,
    level,
    status: n.status,
    resolution: n.resolution,
    tags: (n.tags ?? []).filter((x: string) => x !== level),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt ?? n.createdAt,
  };
}

const EDGE_TO_LINK: Record<string, LinkType> = { part_of: 'part_of', conflicts: 'conflicts', examines: 'about' };
const EDGE_TO_EFFECT: Record<string, { effect: Effect; reverse?: boolean }> = {
  causes: { effect: 'raises' },
  influences: { effect: 'raises' },
  supports: { effect: 'enables' },
  depends_on: { effect: 'enables', reverse: true },
  derived_from: { effect: 'raises', reverse: true },
};

function convertSuggestions(list: V1[] | undefined, keep: (id: string) => boolean): AnalysisSuggestion[] {
  return (list ?? [])
    .map((s): AnalysisSuggestion | null => {
      if (s.type === 'domain')
        return DOMAIN_TO_AREA[s.domain] ? { id: s.id, type: 'area', area: DOMAIN_TO_AREA[s.domain], reason: s.reason, state: s.state } : null;
      if (s.type === 'link_node') return keep(s.nodeId) ? { id: s.id, type: 'link_node', nodeId: s.nodeId, reason: s.reason, state: s.state } : null;
      if (s.type === 'pattern_evidence') {
        const { confidence: _c, ...rest } = s;
        return rest as AnalysisSuggestion;
      }
      return null;
    })
    .filter((s): s is AnalysisSuggestion => Boolean(s));
}

function convertEntry(e: V1, keep: (id: string) => boolean): Entry {
  const { domains, analysis, ...rest } = e;
  return {
    ...(rest as Entry),
    areas: areasOf(domains),
    nodeIds: (e.nodeIds ?? []).filter(keep),
    analysis: analysis ? { ...analysis, suggestions: convertSuggestions(analysis.suggestions, keep) } : undefined,
  };
}

function convertDecision(d: V1, keep: (id: string) => boolean): Decision {
  const { domains, ...rest } = d;
  return { ...(rest as Decision), areas: areasOf(domains), nodeIds: (d.nodeIds ?? []).filter(keep), claimIds: [] };
}

function convertPattern(p: V1, keep: (id: string) => boolean): Pattern {
  return {
    id: p.id,
    code: p.code,
    kind: p.kind,
    title: p.title,
    steps: ((p.chain as string[]) ?? []).map((label) => ({ label })),
    observation: p.observation ?? '',
    triggers: p.triggers ?? [],
    behaviors: p.behaviors ?? [],
    consequences: p.consequences ?? [],
    evidence: ((p.evidence as V1[]) ?? []).map(({ weight: _w, ...e }) => e as Pattern['evidence'][number]),
    explainedBy: [],
    implications: p.implications ?? [],
    areas: areasOf(p.domains),
    nodeIds: (p.nodeIds ?? []).filter(keep),
    cues: p.cues ?? { supports: [], counters: [] },
    userAssessment: p.userAssessment,
    setAside: p.status === 'dismissed' ? { at: p.userAssessment?.at ?? p.updatedAt, note: p.userAssessment?.note } : undefined,
    signature: p.signature,
    origin: p.origin ?? 'inferred',
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? p.createdAt,
  };
}

function convertExperiment(x: V1): Experiment {
  const { patternLinks, ...rest } = x;
  return { ...(rest as Experiment), patternIds: ((patternLinks as V1[]) ?? []).map((l) => l.patternId) };
}

const convertPath = (p: V1): StrategicPath => ({ ...(p as StrategicPath), assumptionIds: [] });

/** A full conversion, for atlases that are not the sample. */
export function convertV1(v1: V1): AtlasData {
  const nodes: Record<string, AtlasNode> = {};
  const occurrences: Record<string, Occurrence> = {};
  for (const n of Object.values(v1.nodes ?? {}) as V1[]) {
    const converted = convertNode(n);
    if (converted) nodes[n.id] = converted;
    else if (n.category === 'experience' && n.source?.kind === 'entry') {
      const entry = v1.entries?.[n.source.id];
      occurrences[`occ_${n.id}`] = {
        id: `occ_${n.id}`,
        kind: 'experience',
        label: n.label,
        date: entry?.date ?? String(n.createdAt).slice(0, 10),
        about: [],
        landmark: true,
        source: { kind: 'entry', id: n.source.id },
        excerpt: entry?.content,
        mode: 'actual',
        origin: 'user',
        createdAt: n.createdAt,
      };
    }
  }
  const keep = (id: string) => Boolean(nodes[id]);

  const edges: Record<string, AtlasEdge> = {};
  const claims: Record<string, Claim> = {};
  let claimCode = 0;
  for (const e of Object.values(v1.edges ?? {}) as V1[]) {
    if (!keep(e.source) || !keep(e.target)) continue;
    const link = EDGE_TO_LINK[e.relation];
    if (link) {
      edges[e.id] = { id: e.id, source: e.source, target: e.target, type: link, note: e.note, origin: e.origin ?? 'user', createdAt: e.createdAt };
      continue;
    }
    const effect = EDGE_TO_EFFECT[e.relation];
    if (!effect) continue;
    const id = `claim_${e.id}`;
    claims[id] = {
      id,
      code: ++claimCode,
      from: effect.reverse ? e.target : e.source,
      with: [],
      to: effect.reverse ? e.source : e.target,
      effect: effect.effect,
      via: e.note,
      author: e.origin === 'inferred' ? 'inferred' : 'user',
      state: 'adopted',
      evidence: [],
      rivalIds: [],
      createdAt: e.createdAt,
      updatedAt: e.createdAt,
    };
  }

  const map = <T>(rec: Record<string, V1> | undefined, fn: (v: V1) => T) =>
    Object.fromEntries(Object.entries(rec ?? {}).map(([k, v]) => [k, fn(v)])) as Record<string, T>;
  const statement = (k: string) => v1.domains?.[k]?.statement ?? '';
  const now = new Date().toISOString();
  const area = (key: AreaKey, from?: string) => ({ key, statement: from ? statement(from) : '', summary: '', updatedAt: now });

  return {
    profile: v1.profile,
    areas: {
      self: area('self', 'identity'),
      work: area('work', 'career'),
      projects: area('projects', 'projects'),
      money: area('money', 'finance'),
      people: area('people', 'relationships'),
      health: area('health'),
      place: area('place', 'environment'),
      growth: area('growth', 'skills'),
    },
    nodes,
    edges,
    claims,
    occurrences,
    entries: map(v1.entries, (e) => convertEntry(e, keep)),
    decisions: map(v1.decisions, (d) => convertDecision(d, keep)),
    patterns: map(v1.patterns, (p) => convertPattern(p, keep)),
    paths: map(v1.paths, convertPath),
    experiments: map(v1.experiments, convertExperiment),
    currentState: v1.currentState,
    navigation: v1.navigation ?? null,
    modelLog: ((v1.modelLog as V1[]) ?? []).map(({ before: _b, after: _a, ...u }) => u as AtlasData['modelLog'][number]),
    counters: { ...v1.counters, claim: claimCode },
    loopNames: {},
  };
}

/** Sample ids look like `ent_07`, `dec_03`, `n_…`, `pat_07`, `exp_02`, `path_a`. */
const SAMPLE_ID = /^(ent_\d\d|dec_\d\d|n_[a-z_0-9]+|pat_\d\d|exp_\d\d|path_[a-z])$/;

function isSample(v1: V1): boolean {
  return v1.profile?.name === SEED_PROFILE_NAME && Boolean(v1.nodes?.n_producer) && Boolean(v1.entries?.ent_01);
}

/** Rebuild the sample in the new model and carry over what the person added to it. */
function upgradeSample(v1: V1): AtlasData {
  const fresh = createSeedData();
  const converted = convertV1(v1);
  const own = <T extends { id: string }>(rec: Record<string, T>) => Object.values(rec).filter((x) => !SAMPLE_ID.test(x.id));
  for (const n of own(converted.nodes)) fresh.nodes[n.id] = n;
  const keep = (id: string) => Boolean(fresh.nodes[id]);
  for (const e of own(converted.entries)) fresh.entries[e.id] = { ...e, nodeIds: e.nodeIds.filter(keep) };
  for (const d of own(converted.decisions)) fresh.decisions[d.id] = { ...d, nodeIds: d.nodeIds.filter(keep) };
  for (const p of own(converted.patterns)) fresh.patterns[p.id] = p;
  for (const p of own(converted.paths)) fresh.paths[p.id] = p;
  for (const x of own(converted.experiments)) fresh.experiments[x.id] = x;
  fresh.counters = {
    entry: Math.max(fresh.counters.entry, converted.counters.entry),
    decision: Math.max(fresh.counters.decision, converted.counters.decision),
    pattern: Math.max(fresh.counters.pattern, converted.counters.pattern),
    experiment: Math.max(fresh.counters.experiment, converted.counters.experiment),
    claim: fresh.counters.claim,
  };
  // Connections the person drew themselves (edges between their own elements, or from theirs to the sample's).
  for (const c of Object.values(converted.claims)) {
    if (keep(c.from) && keep(c.to) && (!SAMPLE_ID.test(c.from) || !SAMPLE_ID.test(c.to))) fresh.claims[c.id] = { ...c, code: ++fresh.counters.claim };
  }
  for (const e of Object.values(converted.edges)) if (keep(e.source) && keep(e.target) && !/^edge_\d{3}$/.test(e.id)) fresh.edges[e.id] = e;
  fresh.profile = { ...fresh.profile, ...v1.profile };
  return fresh;
}

/** Any stored or imported atlas, in the current shape. */
export function toCurrentShape(data: unknown): AtlasData {
  if (isV2(data)) return { ...data, loopNames: data.loopNames ?? {} };
  const v1 = data as V1;
  return isSample(v1) ? upgradeSample(v1) : convertV1(v1);
}
