/**
 * The atlas store: all user data and every mutation of it.
 *
 * Components never mutate records directly; they call these actions. Each
 * action keeps referential integrity (deleting a node removes its edges and
 * backlinks) and records model changes in the append-only model log.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ModelUpdateProposal, PatternCandidate } from '../ai/types';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import { computeConfidence } from '../domain/confidence';
import { CATEGORY_META, DOMAIN_META, hubId } from '../domain/constants';
import { decisionCode, entryCode, experimentCode, patternCode, resolveSource, sameRef } from '../domain/selectors';
import type {
  AnalysisSuggestion,
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Decision,
  Domain,
  DomainKey,
  Entry,
  EntryAnalysis,
  Evidence,
  Experiment,
  ExperimentResult,
  ID,
  ModelUpdate,
  NavActionStatus,
  NavigationPlan,
  PatternStatus,
  PatternVerdict,
  RelationType,
  SourceRef,
  Stance,
  StrategicPath,
} from '../domain/types';
import { todayISO, weekStart } from '../lib/dates';
import { createId } from '../lib/ids';
import { DATA_VERSION, migrateData, safeLocalStorage, STORAGE_KEYS } from '../persistence/storage';

const now = () => new Date().toISOString();

export type NewNode = Pick<AtlasNode, 'label'> & Partial<Pick<AtlasNode, 'summary' | 'domain' | 'category' | 'status' | 'tags' | 'source' | 'origin' | 'confidence'>>;
export type NewEntry = Omit<Entry, 'id' | 'seq' | 'createdAt' | 'updatedAt' | 'analysis'>;
export type NewDecision = Omit<Decision, 'id' | 'seq' | 'createdAt' | 'updatedAt'>;
export type NewExperiment = Omit<Experiment, 'id' | 'code' | 'createdAt' | 'updatedAt'>;

interface AtlasActions {
  // graph
  addNode(input: NewNode): ID;
  updateNode(id: ID, patch: Partial<Omit<AtlasNode, 'id' | 'createdAt'>>): void;
  deleteNode(id: ID): void;
  addEdge(source: ID, target: ID, relation: RelationType, note?: string): ID | null;
  updateEdge(id: ID, patch: Partial<Pick<AtlasEdge, 'relation' | 'note'>>): void;
  deleteEdge(id: ID): void;
  updateDomain(key: DomainKey, patch: Partial<Pick<Domain, 'statement' | 'summary'>>): void;
  // raw data
  addEntry(input: NewEntry): Entry;
  updateEntry(id: ID, patch: Partial<NewEntry>): void;
  deleteEntry(id: ID): void;
  setEntryAnalysis(id: ID, analysis: EntryAnalysis): void;
  resolveSuggestion(entryId: ID, suggestionId: ID, accept: boolean): void;
  addDecision(input: NewDecision): Decision;
  updateDecision(id: ID, patch: Partial<NewDecision>): void;
  deleteDecision(id: ID): void;
  // patterns
  addEvidence(patternId: ID, input: { source: SourceRef; stance: Stance; excerpt: string; weight?: number; addedBy: Evidence['addedBy'] }): void;
  removeEvidence(patternId: ID, evidenceId: ID): void;
  setPatternStatus(id: ID, status: PatternStatus): void;
  assessPattern(id: ID, verdict: PatternVerdict, note?: string): void;
  adoptCandidate(candidate: PatternCandidate): ID;
  // strategy
  updateCurrentState(patch: Partial<Omit<AtlasData['currentState'], 'updatedAt'>>): void;
  addPath(): ID;
  updatePath(id: ID, patch: Partial<Omit<StrategicPath, 'id' | 'createdAt'>>): void;
  deletePath(id: ID): void;
  addExperiment(input: NewExperiment): ID;
  updateExperiment(id: ID, patch: Partial<NewExperiment>): void;
  deleteExperiment(id: ID): void;
  applyExperimentResult(id: ID, result: ExperimentResult, proposal: ModelUpdateProposal): void;
  // navigation
  setNavigation(plan: NavigationPlan): void;
  updateNavigation(patch: Partial<NavigationPlan>): void;
  clearNavigation(): void;
  toggleTarget(id: ID): void;
  addTarget(title: string, due: string): void;
  deleteTarget(id: ID): void;
  addAction(title: string, targetId?: ID): void;
  setActionStatus(id: ID, status: NavActionStatus): void;
  setCurrentAction(id: ID): void;
  deleteAction(id: ID): void;
  // data management
  resetToSample(): void;
  clearAll(name?: string): void;
  replaceData(data: AtlasData): void;
  setProfileName(name: string): void;
}

export interface AtlasState extends AtlasActions {
  data: AtlasData;
}

const logUpdate = (data: AtlasData, update: Omit<ModelUpdate, 'id' | 'at'>) => {
  data.modelLog.push({ id: createId('log'), at: now(), ...update });
};

const suggestionKey = (s: AnalysisSuggestion) =>
  s.type === 'link_node' ? `n:${s.nodeId}` : s.type === 'domain' ? `d:${s.domain}` : `p:${s.patternId}:${s.stance}`;

const nodeLabel = (data: AtlasData, id: ID) => data.nodes[id]?.label ?? (id.startsWith('domain:') ? DOMAIN_META[id.slice(7) as DomainKey]?.label : id);

export const useAtlas = create<AtlasState>()(
  persist(
    immer((set, get) => ({
      data: createSeedData(),

      /* ---------------- graph ---------------- */

      addNode(input) {
        const id = createId('node');
        const at = now();
        set((s) => {
          s.data.nodes[id] = {
            id,
            label: input.label.trim(),
            summary: input.summary?.trim() ?? '',
            domain: input.domain,
            category: input.category,
            status: input.category === 'question' ? (input.status ?? 'open') : input.status,
            tags: input.tags ?? [],
            source: input.source,
            origin: input.origin ?? 'user',
            confidence: input.confidence,
            createdAt: at,
            updatedAt: at,
          };
        });
        return id;
      },

      updateNode(id, patch) {
        set((s) => {
          const n = s.data.nodes[id];
          if (!n) return;
          Object.assign(n, patch, { updatedAt: now() });
        });
      },

      deleteNode(id) {
        set((s) => {
          const d = s.data;
          delete d.nodes[id];
          for (const [eid, e] of Object.entries(d.edges)) if (e.source === id || e.target === id) delete d.edges[eid];
          for (const e of Object.values(d.entries)) e.nodeIds = e.nodeIds.filter((n) => n !== id);
          for (const x of Object.values(d.decisions)) x.nodeIds = x.nodeIds.filter((n) => n !== id);
          for (const p of Object.values(d.patterns)) p.nodeIds = p.nodeIds.filter((n) => n !== id);
          for (const x of Object.values(d.experiments)) x.questionIds = x.questionIds.filter((n) => n !== id);
        });
      },

      addEdge(source, target, relation, note) {
        if (source === target) return null;
        const existing = Object.values(get().data.edges).find(
          (e) => e.relation === relation && ((e.source === source && e.target === target) || (relation === 'conflicts' && e.source === target && e.target === source)),
        );
        if (existing) return existing.id;
        const id = createId('edge');
        set((s) => {
          s.data.edges[id] = { id, source, target, relation, note, origin: 'user', createdAt: now() };
        });
        return id;
      },

      updateEdge(id, patch) {
        set((s) => {
          const e = s.data.edges[id];
          if (e) Object.assign(e, patch);
        });
      },

      deleteEdge(id) {
        set((s) => {
          delete s.data.edges[id];
        });
      },

      updateDomain(key, patch) {
        set((s) => {
          Object.assign(s.data.domains[key], patch, { updatedAt: now() });
        });
      },

      /* ---------------- entries ---------------- */

      addEntry(input) {
        const id = createId('ent');
        const at = now();
        let created!: Entry;
        set((s) => {
          const seq = ++s.data.counters.entry;
          created = { ...input, id, seq, createdAt: at, updatedAt: at };
          s.data.entries[id] = created;
        });
        return get().data.entries[id] ?? created;
      },

      updateEntry(id, patch) {
        set((s) => {
          const e = s.data.entries[id];
          if (e) Object.assign(e, patch, { updatedAt: now() });
        });
      },

      deleteEntry(id) {
        set((s) => {
          const d = s.data;
          const entry = d.entries[id];
          if (!entry) return;
          delete d.entries[id];
          const ref: SourceRef = { kind: 'entry', id };
          for (const p of Object.values(d.patterns)) {
            const had = p.evidence.some((e) => sameRef(e.source, ref));
            if (!had) continue;
            const before = computeConfidence(p.evidence);
            p.evidence = p.evidence.filter((e) => !sameRef(e.source, ref));
            p.counterEvidence.forEach((c) => (c.sources = c.sources.filter((r) => !sameRef(r, ref))));
            logUpdate(d, { kind: 'evidence_removed', summary: `${entryCode(entry.seq)} was deleted and removed from ${patternCode(p.code)}.`, patternId: p.id, before, after: computeConfidence(p.evidence) });
          }
          for (const n of Object.values(d.nodes)) if (n.source && sameRef(n.source, ref)) n.source = undefined;
        });
      },

      setEntryAnalysis(id, analysis) {
        set((s) => {
          const e = s.data.entries[id];
          if (!e) return;
          // Keep decisions the user already made on equivalent suggestions.
          const prior = new Map((e.analysis?.suggestions ?? []).filter((x) => x.state !== 'pending').map((x) => [suggestionKey(x), x.state]));
          for (const sug of analysis.suggestions) {
            const state = prior.get(suggestionKey(sug));
            if (state && sug.state === 'pending') sug.state = state;
          }
          e.analysis = analysis;
        });
      },

      resolveSuggestion(entryId, suggestionId, accept) {
        const entry = get().data.entries[entryId];
        const sug = entry?.analysis?.suggestions.find((x) => x.id === suggestionId);
        if (!entry || !sug) return;
        if (accept && sug.type === 'pattern_evidence') {
          get().addEvidence(sug.patternId, { source: { kind: 'entry', id: entryId }, stance: sug.stance, excerpt: sug.excerpt, addedBy: 'user' });
        }
        set((s) => {
          const e = s.data.entries[entryId];
          const x = e?.analysis?.suggestions.find((y) => y.id === suggestionId);
          if (!e || !x) return;
          x.state = accept ? 'accepted' : 'dismissed';
          if (!accept) return;
          if (x.type === 'link_node' && !e.nodeIds.includes(x.nodeId)) e.nodeIds.push(x.nodeId);
          if (x.type === 'domain' && !e.domains.includes(x.domain)) e.domains.push(x.domain);
        });
      },

      /* ---------------- decisions ---------------- */

      addDecision(input) {
        const id = createId('dec');
        const at = now();
        set((s) => {
          const seq = ++s.data.counters.decision;
          s.data.decisions[id] = { ...input, id, seq, createdAt: at, updatedAt: at };
        });
        return get().data.decisions[id];
      },

      updateDecision(id, patch) {
        set((s) => {
          const x = s.data.decisions[id];
          if (x) Object.assign(x, patch, { updatedAt: now() });
        });
      },

      deleteDecision(id) {
        set((s) => {
          const d = s.data;
          const dec = d.decisions[id];
          if (!dec) return;
          delete d.decisions[id];
          const ref: SourceRef = { kind: 'decision', id };
          for (const p of Object.values(d.patterns)) {
            if (!p.evidence.some((e) => sameRef(e.source, ref))) continue;
            const before = computeConfidence(p.evidence);
            p.evidence = p.evidence.filter((e) => !sameRef(e.source, ref));
            p.counterEvidence.forEach((c) => (c.sources = c.sources.filter((r) => !sameRef(r, ref))));
            logUpdate(d, { kind: 'evidence_removed', summary: `${decisionCode(dec.seq)} was deleted and removed from ${patternCode(p.code)}.`, patternId: p.id, before, after: computeConfidence(p.evidence) });
          }
          for (const n of Object.values(d.nodes)) if (n.source && sameRef(n.source, ref)) n.source = undefined;
        });
      },

      /* ---------------- patterns ---------------- */

      addEvidence(patternId, input) {
        set((s) => {
          const d = s.data;
          const p = d.patterns[patternId];
          if (!p || p.evidence.some((e) => sameRef(e.source, input.source))) return;
          const before = computeConfidence(p.evidence);
          p.evidence.push({
            id: createId('ev'),
            source: input.source,
            stance: input.stance,
            excerpt: input.excerpt,
            weight: input.weight ?? 1,
            addedBy: input.addedBy,
            addedAt: now(),
          });
          p.updatedAt = now();
          const code = resolveSource(d, input.source).code;
          logUpdate(d, {
            kind: 'evidence_added',
            summary: `${code} added as ${input.stance === 'supports' ? 'supporting evidence' : 'counter-evidence'} to ${patternCode(p.code)}.`,
            patternId,
            before,
            after: computeConfidence(p.evidence),
            source: input.source,
          });
        });
      },

      removeEvidence(patternId, evidenceId) {
        set((s) => {
          const d = s.data;
          const p = d.patterns[patternId];
          const ev = p?.evidence.find((e) => e.id === evidenceId);
          if (!p || !ev) return;
          const before = computeConfidence(p.evidence);
          p.evidence = p.evidence.filter((e) => e.id !== evidenceId);
          logUpdate(d, {
            kind: 'evidence_removed',
            summary: `You removed ${resolveSource(d, ev.source).code} from ${patternCode(p.code)}.`,
            patternId,
            before,
            after: computeConfidence(p.evidence),
            source: ev.source,
          });
        });
      },

      setPatternStatus(id, status) {
        set((s) => {
          const p = s.data.patterns[id];
          if (!p || p.status === status) return;
          p.status = status;
          p.updatedAt = now();
          logUpdate(s.data, { kind: 'pattern_status', summary: `You set ${patternCode(p.code)} to ${status}.`, patternId: id });
        });
      },

      assessPattern(id, verdict, note) {
        set((s) => {
          const p = s.data.patterns[id];
          if (!p) return;
          p.userAssessment = { verdict, note: note?.trim() || undefined, at: now() };
          const label = verdict === 'resonates' ? 'matches your experience' : verdict === 'partial' ? 'partly matches your experience' : 'is not accurate';
          if (verdict === 'inaccurate' && p.status !== 'dismissed') p.status = 'dismissed';
          logUpdate(s.data, {
            kind: 'pattern_assessed',
            summary: `You said ${patternCode(p.code)} ${label}.${verdict === 'inaccurate' ? ' It was dismissed and no longer informs paths.' : ''}`,
            patternId: id,
          });
        });
      },

      adoptCandidate(candidate) {
        if (candidate.existingPatternId && get().data.patterns[candidate.existingPatternId]) return candidate.existingPatternId;
        const id = createId('pat');
        set((s) => {
          const d = s.data;
          const code = ++d.counters.pattern;
          const at = now();
          const mk = (decisionId: ID, stance: Stance, excerpt: string): Evidence => ({
            id: createId('ev'),
            source: { kind: 'decision', id: decisionId },
            stance,
            excerpt,
            weight: 1,
            addedBy: 'inferred',
            addedAt: at,
          });
          const evidence = [
            ...candidate.supporting.map((x) => mk(x.decisionId, 'supports', x.excerpt)),
            ...candidate.counter.map((x) => mk(x.decisionId, 'counters', x.excerpt)),
          ];
          // Link the pattern into the Mind graph through the decision nodes it rests on.
          const decisionIds = new Set(evidence.map((e) => e.source.id));
          const nodeIds = Object.values(d.nodes)
            .filter((n) => n.source?.kind === 'decision' && decisionIds.has(n.source.id))
            .map((n) => n.id);
          d.patterns[id] = {
            id,
            code,
            kind: candidate.kind,
            title: candidate.title,
            chain: candidate.chain,
            status: 'emerging',
            observation: candidate.statement,
            triggers: candidate.triggers,
            behaviors: candidate.behaviors,
            consequences: candidate.consequences,
            evidence,
            interpretations: [{ id: createId('int'), ...candidate.interpretation }],
            counterEvidence: candidate.counterStatement
              ? [{ id: createId('ce'), statement: candidate.counterStatement, sources: candidate.counter.map((c) => ({ kind: 'decision' as const, id: c.decisionId })) }]
              : [],
            implications: candidate.implication ? [{ id: createId('im'), statement: candidate.implication, pathIds: [] }] : [],
            domains: candidate.domains,
            nodeIds,
            cues: { supports: [], counters: [] },
            signature: candidate.signature,
            origin: 'inferred',
            createdAt: at,
            updatedAt: at,
          };
          logUpdate(d, {
            kind: 'pattern_created',
            summary: `${patternCode(code)} added to the model from ${candidate.supporting.length} supporting and ${candidate.counter.length} counter decisions.`,
            patternId: id,
            after: computeConfidence(evidence),
          });
        });
        return id;
      },

      /* ---------------- strategy ---------------- */

      updateCurrentState(patch) {
        set((s) => {
          Object.assign(s.data.currentState, patch, { updatedAt: now() });
        });
      },

      addPath() {
        const id = createId('path');
        set((s) => {
          const used = new Set(Object.values(s.data.paths).map((p) => p.code));
          const code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').find((c) => !used.has(c)) ?? String(used.size + 1);
          const at = now();
          s.data.paths[id] = {
            id,
            code,
            title: 'Untitled path',
            objective: '',
            summary: '',
            requirements: [],
            dependencies: [],
            skills: [],
            capital: '',
            time: '',
            risks: [],
            tradeoffs: [],
            opportunityCosts: [],
            unknowns: [],
            proposedExperiments: [],
            experimentIds: [],
            patternIds: [],
            createdAt: at,
            updatedAt: at,
          };
        });
        return id;
      },

      updatePath(id, patch) {
        set((s) => {
          const p = s.data.paths[id];
          if (p) Object.assign(p, patch, { updatedAt: now() });
        });
      },

      deletePath(id) {
        set((s) => {
          delete s.data.paths[id];
          if (s.data.navigation?.pathId === id) s.data.navigation = null;
          for (const x of Object.values(s.data.experiments)) x.pathIds = x.pathIds.filter((p) => p !== id);
          for (const p of Object.values(s.data.patterns)) p.implications.forEach((i) => (i.pathIds = i.pathIds.filter((x) => x !== id)));
        });
      },

      addExperiment(input) {
        const id = createId('exp');
        set((s) => {
          const code = ++s.data.counters.experiment;
          const at = now();
          s.data.experiments[id] = { ...input, id, code, createdAt: at, updatedAt: at };
          for (const pid of input.pathIds) {
            const path = s.data.paths[pid];
            if (path && !path.experimentIds.includes(id)) path.experimentIds.push(id);
          }
        });
        return id;
      },

      updateExperiment(id, patch) {
        set((s) => {
          const x = s.data.experiments[id];
          if (x) Object.assign(x, patch, { updatedAt: now() });
        });
      },

      deleteExperiment(id) {
        set((s) => {
          delete s.data.experiments[id];
          for (const p of Object.values(s.data.paths)) p.experimentIds = p.experimentIds.filter((x) => x !== id);
          if (s.data.navigation?.experimentId === id) s.data.navigation.experimentId = undefined;
        });
      },

      applyExperimentResult(id, result, proposal) {
        set((s) => {
          const d = s.data;
          const x = d.experiments[id];
          if (!x) return;
          x.result = result;
          x.status = 'completed';
          x.updatedAt = now();
          const ref: SourceRef = { kind: 'experiment', id };
          for (const change of proposal.changes) {
            const p = d.patterns[change.patternId];
            if (!p || p.evidence.some((e) => sameRef(e.source, ref))) continue;
            const before = computeConfidence(p.evidence);
            p.evidence.push({ id: createId('ev'), source: ref, stance: change.stance, excerpt: change.excerpt, weight: change.weight, addedBy: 'user', addedAt: now() });
            logUpdate(d, {
              kind: 'experiment_result',
              summary: `${experimentCode(x.code)} result applied: ${change.stance === 'supports' ? 'supports' : 'counters'} ${patternCode(p.code)} (weight ${change.weight}).`,
              patternId: p.id,
              before,
              after: computeConfidence(p.evidence),
              source: ref,
            });
          }
          for (const note of proposal.interpretationNotes) {
            const p = d.patterns[note.patternId];
            if (p) p.interpretations.push({ id: createId('int'), statement: note.statement, confidence: 0.5, rationale: `Suggested after ${experimentCode(x.code)}.` });
          }
          if (!proposal.changes.length) {
            logUpdate(d, { kind: 'experiment_result', summary: `${experimentCode(x.code)} result recorded (${result.outcome}); no pattern confidence changed.`, source: ref });
          }
        });
      },

      /* ---------------- navigation ---------------- */

      setNavigation(plan) {
        set((s) => {
          s.data.navigation = plan;
          const path = s.data.paths[plan.pathId];
          logUpdate(s.data, { kind: 'direction_set', summary: `You chose ${path ? `Path ${path.code} (${path.title})` : 'a path'} as your direction.` });
        });
      },

      updateNavigation(patch) {
        set((s) => {
          if (s.data.navigation) Object.assign(s.data.navigation, patch);
        });
      },

      clearNavigation() {
        set((s) => {
          s.data.navigation = null;
        });
      },

      toggleTarget(id) {
        set((s) => {
          const t = s.data.navigation?.targets.find((x) => x.id === id);
          if (t) t.done = !t.done;
        });
      },

      addTarget(title, due) {
        set((s) => {
          s.data.navigation?.targets.push({ id: createId('tgt'), title, due, done: false });
        });
      },

      deleteTarget(id) {
        set((s) => {
          const nav = s.data.navigation;
          if (!nav) return;
          nav.targets = nav.targets.filter((t) => t.id !== id);
          nav.actions.forEach((a) => a.targetId === id && (a.targetId = undefined));
        });
      },

      addAction(title, targetId) {
        set((s) => {
          const nav = s.data.navigation;
          if (!nav) return;
          const id = createId('act');
          nav.actions.push({ id, title, targetId, week: weekStart(todayISO()), status: 'todo' });
          if (!nav.currentActionId || !nav.actions.some((a) => a.id === nav.currentActionId && a.status === 'todo')) nav.currentActionId = id;
        });
      },

      setActionStatus(id, status) {
        set((s) => {
          const nav = s.data.navigation;
          const a = nav?.actions.find((x) => x.id === id);
          if (!nav || !a) return;
          a.status = status;
          if (nav.currentActionId === id && status !== 'todo') {
            nav.currentActionId = nav.actions.find((x) => x.status === 'todo' && x.week >= a.week)?.id ?? nav.actions.find((x) => x.status === 'todo')?.id;
          }
        });
      },

      setCurrentAction(id) {
        set((s) => {
          if (s.data.navigation) s.data.navigation.currentActionId = id;
        });
      },

      deleteAction(id) {
        set((s) => {
          const nav = s.data.navigation;
          if (!nav) return;
          nav.actions = nav.actions.filter((a) => a.id !== id);
          if (nav.currentActionId === id) nav.currentActionId = nav.actions.find((a) => a.status === 'todo')?.id;
        });
      },

      /* ---------------- data management ---------------- */

      resetToSample() {
        set({ data: createSeedData() });
      },

      clearAll(name) {
        set({ data: createEmptyData(name) });
      },

      replaceData(data) {
        set({ data });
      },

      setProfileName(name) {
        set((s) => {
          s.data.profile.name = name;
        });
      },
    })),
    {
      name: STORAGE_KEYS.data,
      version: DATA_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ data: state.data }),
      migrate: (persisted, version) => migrateData(persisted, version) as { data: AtlasData },
    },
  ),
);

/** Label for a node or hub id, for toasts and log lines. */
export const labelFor = (id: ID) => nodeLabel(useAtlas.getState().data, id);

/** Where a captured entry of a given kind can also appear on a map. */
export function nodeTargetLabel(target: { domain?: DomainKey; category?: AtlasNode['category'] }) {
  if (target.domain) return `${DOMAIN_META[target.domain].label} in Orbit`;
  if (target.category) return `${CATEGORY_META[target.category].plural} in Mind`;
  return '';
}

export { hubId };
