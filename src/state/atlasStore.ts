/**
 * The atlas store: all of the person's data and every mutation of it.
 *
 * Components never mutate records directly; they call these actions. Each
 * action keeps referential integrity (deleting an element removes the links
 * and claims that depend on it, deleting a note removes the evidence and the
 * history read from it) and records changes in understanding in the
 * append-only model log, with the claim status before and after.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ModelUpdateProposal, PatternCandidate } from '../ai/types';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import { claimCode, claimSentence, claimStatus } from '../domain/claims';
import { EXPERIMENT_OUTCOME_LABEL, STATUS_META } from '../domain/constants';
import { repairReferences } from '../domain/integrity';
import { decisionCode, entryCode, experimentCode, pathCode, patternCode, resolveSource, sameRef } from '../domain/selectors';
import type {
  AnalysisSuggestion,
  Area,
  AreaKey,
  AtlasData,
  AtlasEdge,
  AtlasNode,
  Claim,
  Decision,
  Entry,
  EntryAnalysis,
  Evidence,
  EvidenceKind,
  Experiment,
  ExperimentResult,
  ID,
  Investigation,
  LinkType,
  ModelUpdate,
  NavActionStatus,
  NavigationPlan,
  Occurrence,
  Pattern,
  PatternVerdict,
  SourceRef,
  Stance,
  StrategicPath,
  View,
} from '../domain/types';
import { todayISO, weekStart } from '../lib/dates';
import { createId } from '../lib/ids';
import { DATA_VERSION, migrateData, safeLocalStorage, STORAGE_KEYS } from '../persistence/storage';
import { t } from '../i18n';

const now = () => new Date().toISOString();

export type NewNode = Pick<AtlasNode, 'label' | 'kind' | 'area'> &
  Partial<
    Pick<
      AtlasNode,
      'summary' | 'since' | 'until' | 'concern' | 'external' | 'scale' | 'level' | 'status' | 'tags' | 'origin' | 'adopted' | 'claimId' | 'investigation'
    >
  >;
export type NewClaim = Pick<Claim, 'from' | 'to' | 'effect'> & Partial<Pick<Claim, 'with' | 'via' | 'when' | 'lag' | 'author' | 'state' | 'rivalIds'>>;
export type NewOccurrence = Omit<Occurrence, 'id' | 'createdAt' | 'origin' | 'mode'> & Partial<Pick<Occurrence, 'origin' | 'mode'>>;
export type NewEntry = Omit<Entry, 'id' | 'seq' | 'createdAt' | 'updatedAt' | 'analysis'>;
export type NewDecision = Omit<Decision, 'id' | 'seq' | 'createdAt' | 'updatedAt'>;
export type NewExperiment = Omit<Experiment, 'id' | 'code' | 'createdAt' | 'updatedAt'>;
export type NewPattern = Pick<Pattern, 'kind' | 'steps' | 'observation' | 'triggers' | 'behaviors' | 'consequences' | 'cues' | 'areas'>;
export type NewEvidence = { source: SourceRef; stance: Stance; excerpt: string; kind?: EvidenceKind; note?: string; addedBy: Evidence['addedBy'] };

interface AtlasActions {
  // map: elements, links, areas
  addNode(input: NewNode): ID;
  updateNode(id: ID, patch: Partial<Omit<AtlasNode, 'id' | 'createdAt'>>): void;
  deleteNode(id: ID): void;
  adoptNode(id: ID): void;
  addLink(source: ID, target: ID, type: LinkType, note?: string): ID | null;
  updateLink(id: ID, patch: Partial<Pick<AtlasEdge, 'type' | 'note'>>): void;
  deleteLink(id: ID): void;
  updateArea(key: AreaKey, patch: Partial<Pick<Area, 'statement' | 'summary'>>): void;
  // understanding: claims
  addClaim(input: NewClaim, evidence?: NewEvidence[]): ID;
  updateClaim(id: ID, patch: Partial<Pick<Claim, 'from' | 'to' | 'with' | 'effect' | 'via' | 'when' | 'lag'>>): void;
  adoptClaim(id: ID): void;
  setClaimAside(id: ID): void;
  deleteClaim(id: ID): void;
  setClaimView(id: ID, stance: View | null, note?: string): void;
  addClaimEvidence(claimId: ID, input: NewEvidence): void;
  removeClaimEvidence(claimId: ID, evidenceId: ID): void;
  toggleRival(claimId: ID, otherId: ID): void;
  retireClaim(id: ID, note?: string): void;
  restoreClaim(id: ID): void;
  nameLoop(loopId: string, name: string): void;
  // history
  addOccurrence(input: NewOccurrence): ID;
  updateOccurrence(id: ID, patch: Partial<Omit<Occurrence, 'id' | 'createdAt'>>): void;
  deleteOccurrence(id: ID): void;
  // record
  addEntry(input: NewEntry): Entry;
  updateEntry(id: ID, patch: Partial<NewEntry>): void;
  deleteEntry(id: ID): void;
  setEntryAnalysis(id: ID, analysis: EntryAnalysis): void;
  resolveSuggestion(entryId: ID, suggestionId: ID, accept: boolean): void;
  addDecision(input: NewDecision): Decision;
  updateDecision(id: ID, patch: Partial<NewDecision>): void;
  deleteDecision(id: ID): void;
  // patterns
  addPatternEvidence(patternId: ID, input: NewEvidence): void;
  removePatternEvidence(patternId: ID, evidenceId: ID): void;
  assessPattern(id: ID, verdict: PatternVerdict, note?: string): void;
  setPatternAside(id: ID, aside: boolean, note?: string): void;
  toggleExplanation(patternId: ID, claimId: ID): void;
  adoptCandidate(candidate: PatternCandidate): ID;
  addPattern(input: NewPattern): ID;
  // investigations
  updateInvestigation(questionId: ID, patch: Partial<Investigation>): void;
  // possibility and plans
  updateCurrentState(patch: Partial<Omit<AtlasData['currentState'], 'updatedAt'>>): void;
  addPath(): ID;
  updatePath(id: ID, patch: Partial<Omit<StrategicPath, 'id' | 'createdAt'>>): void;
  deletePath(id: ID): void;
  addExperiment(input: NewExperiment): ID;
  updateExperiment(id: ID, patch: Partial<NewExperiment>): void;
  deleteExperiment(id: ID): void;
  applyExperimentResult(id: ID, result: ExperimentResult, proposal: ModelUpdateProposal): void;
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
  s.type === 'link_node'
    ? `n:${s.nodeId}`
    : s.type === 'area'
      ? `a:${s.area}`
      : s.type === 'pattern_evidence'
        ? `p:${s.patternId}:${s.stance}`
        : s.type === 'occurrence'
          ? `o:${s.kind}:${s.instanceOf ?? s.label}`
          : `x:${s.excerpt}`;

/** Remove every piece of evidence that cites a source, logging what changed. */
function dropEvidence(d: AtlasData, ref: SourceRef, code: string) {
  for (const p of Object.values(d.patterns)) {
    if (!p.evidence.some((e) => sameRef(e.source, ref))) continue;
    p.evidence = p.evidence.filter((e) => !sameRef(e.source, ref));
    logUpdate(d, {
      kind: 'evidence_removed',
      summary: t('{code} was deleted and removed from {pattern}.', { code, pattern: patternCode(p.code) }),
      patternId: p.id,
    });
  }
  for (const c of Object.values(d.claims)) {
    if (!c.evidence.some((e) => sameRef(e.source, ref))) continue;
    const before = claimStatus(d, c);
    c.evidence = c.evidence.filter((e) => !sameRef(e.source, ref));
    logUpdate(d, {
      kind: 'evidence_removed',
      summary: t('{code} was deleted and removed from {claim}.', { code, claim: claimCode(c.code) }),
      claimId: c.id,
      before,
      after: claimStatus(d, c),
    });
  }
}

export const useAtlas = create<AtlasState>()(
  persist(
    immer((setDraft, get) => {
      // Every change leaves the atlas whole, in the same step: whatever pointed at something that
      // was removed is removed or unlinked too (domain/integrity). The Map, Causes, Time, Repeats
      // and Ahead all read these records, so they always agree.
      const set = (change: (s: AtlasState) => void) =>
        setDraft((s) => {
          change(s);
          repairReferences(s.data);
        });
      return {
        data: createSeedData(),

        /* ---------------- map ---------------- */

        addNode(input) {
          const id = createId('node');
          const at = now();
          set((s) => {
            s.data.nodes[id] = {
              id,
              label: input.label.trim(),
              summary: input.summary?.trim() ?? '',
              kind: input.kind,
              area: input.area,
              origin: input.origin ?? 'user',
              adopted: input.adopted ?? true,
              since: input.since,
              until: input.until,
              concern: input.concern,
              external: input.external,
              scale: input.scale,
              level: input.level,
              claimId: input.claimId,
              status: input.kind === 'question' ? (input.status ?? 'open') : input.status,
              investigation: input.investigation,
              tags: input.tags ?? [],
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
            // A pattern step that stands for this element reads with its new name in Repeats too.
            const label = patch.label?.trim();
            if (label)
              for (const p of Object.values(s.data.patterns)) for (const step of p.steps) if (step.elementId === id && step.label !== label) step.label = label;
          });
        },

        deleteNode(id) {
          // Its links and the claims about it go with it; notes, decisions, happenings, patterns,
          // tests and questions that mentioned it are unlinked (repairReferences, via set).
          set((s) => {
            delete s.data.nodes[id];
          });
        },

        adoptNode(id) {
          set((s) => {
            const n = s.data.nodes[id];
            if (!n || n.adopted) return;
            n.adopted = true;
            n.updatedAt = now();
            logUpdate(s.data, {
              kind: 'element_adopted',
              summary: t('You confirmed “{label}”, proposed by the analysis. It is now on your map.', { label: n.label }),
            });
          });
        },

        addLink(source, target, type, note) {
          if (source === target) return null;
          const symmetric = type === 'conflicts' || type === 'aligns';
          const existing = Object.values(get().data.edges).find(
            (e) => e.type === type && ((e.source === source && e.target === target) || (symmetric && e.source === target && e.target === source)),
          );
          if (existing) return existing.id;
          const id = createId('edge');
          set((s) => {
            s.data.edges[id] = { id, source, target, type, note, origin: 'user', createdAt: now() };
          });
          return id;
        },

        updateLink(id, patch) {
          set((s) => {
            const e = s.data.edges[id];
            if (e) Object.assign(e, patch);
          });
        },

        deleteLink(id) {
          set((s) => {
            delete s.data.edges[id];
          });
        },

        updateArea(key, patch) {
          set((s) => {
            Object.assign(s.data.areas[key], patch, { updatedAt: now() });
          });
        },

        /* ---------------- claims ---------------- */

        addClaim(input, evidence = []) {
          const existing = Object.values(get().data.claims).find(
            (c) => c.from === input.from && c.to === input.to && c.effect === input.effect && c.state !== 'set_aside',
          );
          if (existing) return existing.id;
          const id = createId('claim');
          set((s) => {
            const d = s.data;
            const at = now();
            const code = ++d.counters.claim;
            d.claims[id] = {
              id,
              code,
              from: input.from,
              with: input.with ?? [],
              to: input.to,
              effect: input.effect,
              via: input.via?.trim() || undefined,
              when: input.when?.trim() || undefined,
              lag: input.lag?.trim() || undefined,
              author: input.author ?? 'user',
              state: input.state ?? 'adopted',
              evidence: evidence.map((e) => ({ id: createId('ev'), ...e, kind: e.kind ?? 'instance', addedAt: at })),
              rivalIds: input.rivalIds ?? [],
              createdAt: at,
              updatedAt: at,
            };
            if (d.claims[id].state === 'adopted') {
              logUpdate(d, {
                kind: 'claim_added',
                summary: t('You added {claim}: {sentence}.', { claim: claimCode(code), sentence: claimSentence(d, d.claims[id]!) }),
                claimId: id,
                after: claimStatus(d, d.claims[id]!),
              });
            }
          });
          return id;
        },

        updateClaim(id, patch) {
          set((s) => {
            const c = s.data.claims[id];
            if (c) Object.assign(c, patch, { updatedAt: now() });
          });
        },

        adoptClaim(id) {
          set((s) => {
            const c = s.data.claims[id];
            if (!c || c.state === 'adopted') return;
            c.state = 'adopted';
            c.updatedAt = now();
            logUpdate(s.data, {
              kind: 'claim_adopted',
              summary: t('You adopted {claim} as a hypothesis: {sentence}.', { claim: claimCode(c.code), sentence: claimSentence(s.data, c) }),
              claimId: id,
              after: claimStatus(s.data, c),
            });
          });
        },

        setClaimAside(id) {
          set((s) => {
            const c = s.data.claims[id];
            if (c) c.state = 'set_aside';
          });
        },

        deleteClaim(id) {
          // Options, tests, patterns, decisions, questions and rivals that relied on it let go of it.
          set((s) => {
            delete s.data.claims[id];
          });
        },

        setClaimView(id, stance, note) {
          set((s) => {
            const c = s.data.claims[id];
            if (!c) return;
            c.view = stance ? { stance, note: note?.trim() || undefined, at: now() } : undefined;
            if (stance) {
              const said =
                stance === 'agree'
                  ? t('You said {claim} matches your experience.', { claim: claimCode(c.code) })
                  : stance === 'disagree'
                    ? t('You said {claim} does not match your experience.', { claim: claimCode(c.code) })
                    : t('You are not sure about {claim}.', { claim: claimCode(c.code) });
              logUpdate(s.data, { kind: 'claim_view', summary: `${said} ${t('Its status still comes from the evidence.')}`, claimId: id });
            }
          });
        },

        addClaimEvidence(claimId, input) {
          set((s) => {
            const d = s.data;
            const c = d.claims[claimId];
            if (!c || c.evidence.some((e) => sameRef(e.source, input.source) && (e.kind ?? 'instance') === (input.kind ?? 'instance'))) return;
            const before = claimStatus(d, c);
            c.evidence.push({ id: createId('ev'), ...input, kind: input.kind ?? 'instance', addedAt: now() });
            c.updatedAt = now();
            const code = resolveSource(d, input.source).code;
            logUpdate(d, {
              kind: 'evidence_added',
              summary:
                input.stance === 'supports'
                  ? t('{code} added as supporting evidence to {claim}.', { code, claim: claimCode(c.code) })
                  : t('{code} added as counter-evidence to {claim}.', { code, claim: claimCode(c.code) }),
              claimId,
              before,
              after: claimStatus(d, c),
              source: input.source,
            });
          });
        },

        removeClaimEvidence(claimId, evidenceId) {
          set((s) => {
            const d = s.data;
            const c = d.claims[claimId];
            const ev = c?.evidence.find((e) => e.id === evidenceId);
            if (!c || !ev) return;
            const before = claimStatus(d, c);
            c.evidence = c.evidence.filter((e) => e.id !== evidenceId);
            logUpdate(d, {
              kind: 'evidence_removed',
              summary: t('You removed {code} from {claim}.', { code: resolveSource(d, ev.source).code, claim: claimCode(c.code) }),
              claimId,
              before,
              after: claimStatus(d, c),
              source: ev.source,
            });
          });
        },

        toggleRival(claimId, otherId) {
          set((s) => {
            const c = s.data.claims[claimId];
            const o = s.data.claims[otherId];
            if (!c || !o) return;
            const on = c.rivalIds.includes(otherId) || o.rivalIds.includes(claimId);
            c.rivalIds = on ? c.rivalIds.filter((x) => x !== otherId) : [...c.rivalIds, otherId];
            if (on) o.rivalIds = o.rivalIds.filter((x) => x !== claimId);
          });
        },

        retireClaim(id, note) {
          set((s) => {
            const c = s.data.claims[id];
            if (!c) return;
            const before = claimStatus(s.data, c);
            c.retired = { at: todayISO(), note: note?.trim() || undefined };
            logUpdate(s.data, {
              kind: 'claim_retired',
              summary: t('You marked {claim} as no longer holding.', { claim: claimCode(c.code) }),
              claimId: id,
              before,
              after: 'retired',
            });
          });
        },

        restoreClaim(id) {
          set((s) => {
            const c = s.data.claims[id];
            if (c) c.retired = undefined;
          });
        },

        nameLoop(loopId, name) {
          set((s) => {
            if (name.trim()) s.data.loopNames[loopId] = name.trim();
            else delete s.data.loopNames[loopId];
          });
        },

        /* ---------------- history ---------------- */

        addOccurrence(input) {
          const id = createId('occ');
          set((s) => {
            s.data.occurrences[id] = { ...input, id, mode: input.mode ?? 'actual', origin: input.origin ?? 'user', createdAt: now() };
          });
          return id;
        },

        updateOccurrence(id, patch) {
          set((s) => {
            const o = s.data.occurrences[id];
            if (o) Object.assign(o, patch);
          });
        },

        deleteOccurrence(id) {
          set((s) => {
            const d = s.data;
            const o = d.occurrences[id];
            if (!o) return;
            delete d.occurrences[id];
            dropEvidence(d, { kind: 'occurrence', id }, o.label);
          });
        },

        /* ---------------- notes ---------------- */

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
            dropEvidence(d, ref, entryCode(entry.seq));
            // What was read from the note goes with it: history keeps its trail or nothing.
            for (const o of Object.values(d.occurrences)) {
              if (o.source && sameRef(o.source, ref)) {
                delete d.occurrences[o.id];
                dropEvidence(d, { kind: 'occurrence', id: o.id }, o.label);
              }
            }
          });
        },

        setEntryAnalysis(id, analysis) {
          set((s) => {
            const e = s.data.entries[id];
            if (!e) return;
            // Keep decisions the person already made on equivalent suggestions.
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
            get().addPatternEvidence(sug.patternId, { source: { kind: 'entry', id: entryId }, stance: sug.stance, excerpt: sug.excerpt, addedBy: 'user' });
          }
          if (accept && sug.type === 'occurrence') {
            get().addOccurrence({
              kind: sug.kind,
              label: sug.label,
              date: entry.date,
              about: sug.about,
              instanceOf: sug.instanceOf,
              source: { kind: 'entry', id: entryId },
              excerpt: sug.excerpt,
            });
          }
          set((s) => {
            const e = s.data.entries[entryId];
            const x = e?.analysis?.suggestions.find((y) => y.id === suggestionId);
            if (!e || !x) return;
            x.state = accept ? 'accepted' : 'dismissed';
            if (!accept) return;
            if (x.type === 'link_node' && !e.nodeIds.includes(x.nodeId)) e.nodeIds.push(x.nodeId);
            if (x.type === 'area' && !e.areas.includes(x.area)) e.areas.push(x.area);
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
            dropEvidence(d, { kind: 'decision', id }, decisionCode(dec.seq));
          });
        },

        /* ---------------- patterns ---------------- */

        addPatternEvidence(patternId, input) {
          set((s) => {
            const d = s.data;
            const p = d.patterns[patternId];
            if (!p || p.evidence.some((e) => sameRef(e.source, input.source))) return;
            p.evidence.push({
              id: createId('ev'),
              source: input.source,
              stance: input.stance,
              excerpt: input.excerpt,
              note: input.note,
              addedBy: input.addedBy,
              addedAt: now(),
            });
            p.updatedAt = now();
            const code = resolveSource(d, input.source).code;
            logUpdate(d, {
              kind: 'evidence_added',
              summary:
                input.stance === 'supports'
                  ? t('{code} added as an instance of {pattern}.', { code, pattern: patternCode(p.code) })
                  : t('{code} added as a counter-case to {pattern}.', { code, pattern: patternCode(p.code) }),
              patternId,
              source: input.source,
            });
          });
        },

        removePatternEvidence(patternId, evidenceId) {
          set((s) => {
            const d = s.data;
            const p = d.patterns[patternId];
            const ev = p?.evidence.find((e) => e.id === evidenceId);
            if (!p || !ev) return;
            p.evidence = p.evidence.filter((e) => e.id !== evidenceId);
            logUpdate(d, {
              kind: 'evidence_removed',
              summary: t('You removed {code} from {pattern}.', { code: resolveSource(d, ev.source).code, pattern: patternCode(p.code) }),
              patternId,
              source: ev.source,
            });
          });
        },

        assessPattern(id, verdict, note) {
          set((s) => {
            const p = s.data.patterns[id];
            if (!p) return;
            p.userAssessment = { verdict, note: note?.trim() || undefined, at: now() };
            const said =
              verdict === 'resonates'
                ? t('You said {pattern} matches your experience.', { pattern: patternCode(p.code) })
                : verdict === 'partial'
                  ? t('You said {pattern} partly matches your experience.', { pattern: patternCode(p.code) })
                  : t('You said {pattern} does not match your experience.', { pattern: patternCode(p.code) });
            logUpdate(s.data, { kind: 'pattern_assessed', summary: `${said} ${t('What the evidence shows is unchanged.')}`, patternId: id });
          });
        },

        setPatternAside(id, aside, note) {
          set((s) => {
            const p = s.data.patterns[id];
            if (!p) return;
            p.setAside = aside ? { at: now(), note: note?.trim() || undefined } : undefined;
            if (aside) {
              logUpdate(s.data, {
                kind: 'pattern_set_aside',
                summary: t('You set {pattern} aside. It stays here for reference and no longer informs paths.', { pattern: patternCode(p.code) }),
                patternId: id,
              });
            }
          });
        },

        toggleExplanation(patternId, claimId) {
          set((s) => {
            const p = s.data.patterns[patternId];
            if (!p) return;
            p.explainedBy = p.explainedBy.includes(claimId) ? p.explainedBy.filter((c) => c !== claimId) : [...p.explainedBy, claimId];
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
              addedBy: 'inferred',
              addedAt: at,
            });
            const evidence = [
              ...candidate.supporting.map((x) => mk(x.decisionId, 'supports', x.excerpt)),
              ...candidate.counter.map((x) => mk(x.decisionId, 'counters', x.excerpt)),
            ];
            const nodeIds = [...new Set(evidence.flatMap((e) => d.decisions[e.source.id]?.nodeIds ?? []))];
            d.patterns[id] = {
              id,
              code,
              kind: candidate.kind,
              title: candidate.title,
              steps: candidate.steps.map((label) => ({ label })),
              observation: candidate.statement,
              triggers: candidate.triggers,
              behaviors: candidate.behaviors,
              consequences: candidate.consequences,
              evidence,
              explainedBy: [],
              implications: candidate.implication ? [{ id: createId('im'), statement: candidate.implication, pathIds: [] }] : [],
              areas: candidate.areas,
              nodeIds,
              cues: { supports: [], counters: [] },
              signature: candidate.signature,
              origin: 'inferred',
              createdAt: at,
              updatedAt: at,
            };
            logUpdate(d, {
              kind: 'pattern_created',
              summary: t('{pattern} added from {support} decisions that fit it and {counter} that do not.', {
                pattern: patternCode(code),
                support: candidate.supporting.length,
                counter: candidate.counter.length,
              }),
              patternId: id,
            });
          });
          return id;
        },

        addPattern(input) {
          const id = createId('pat');
          set((s) => {
            const d = s.data;
            const code = ++d.counters.pattern;
            const at = now();
            d.patterns[id] = {
              ...input,
              id,
              code,
              title: input.steps[0]?.label ?? t('Untitled pattern'),
              evidence: [],
              explainedBy: [],
              implications: [],
              nodeIds: input.steps.map((step) => step.elementId).filter((x): x is ID => Boolean(x)),
              origin: 'user',
              createdAt: at,
              updatedAt: at,
            };
            logUpdate(d, {
              kind: 'pattern_created',
              summary: t('You described {pattern}. It has no instances yet; it becomes recurring once three separate episodes are found.', {
                pattern: patternCode(code),
              }),
              patternId: id,
            });
          });
          return id;
        },

        /* ---------------- investigations ---------------- */

        updateInvestigation(questionId, patch) {
          set((s) => {
            const q = s.data.nodes[questionId];
            if (!q) return;
            const current: Investigation = q.investigation ?? { kind: 'why', claimIds: [] };
            const next = { ...current, ...patch };
            if (patch.conclusion !== undefined && patch.conclusion.trim() && patch.conclusion !== current.conclusion) {
              next.concludedAt = now();
              logUpdate(s.data, { kind: 'investigation_concluded', summary: t('You wrote a provisional answer to “{question}”.', { question: q.label }) });
            }
            q.investigation = next;
            q.updatedAt = now();
          });
        },

        /* ---------------- possibility and plans ---------------- */

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
              title: t('Untitled path'),
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
              assumptionIds: [],
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
          // A plan for this direction ends with it; tests and pattern implications let go of it.
          set((s) => {
            delete s.data.paths[id];
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
            dropEvidence(s.data, { kind: 'experiment', id }, t('Test'));
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
              const c = d.claims[change.claimId];
              if (!c || c.evidence.some((e) => sameRef(e.source, ref))) continue;
              const before = claimStatus(d, c);
              c.evidence.push({
                id: createId('ev'),
                source: ref,
                stance: change.stance,
                kind: 'intervention',
                excerpt: change.excerpt,
                addedBy: 'user',
                addedAt: now(),
              });
              logUpdate(d, {
                kind: 'experiment_result',
                summary:
                  change.stance === 'supports'
                    ? t('{exp}: the prediction held. {claim} gets a test result as evidence.', { exp: experimentCode(x.code), claim: claimCode(c.code) })
                    : t('{exp}: the prediction did not hold. {claim} gets a failed test as evidence.', {
                        exp: experimentCode(x.code),
                        claim: claimCode(c.code),
                      }),
                claimId: c.id,
                before,
                after: claimStatus(d, c),
                source: ref,
              });
            }
            if (!proposal.changes.length) {
              logUpdate(d, {
                kind: 'experiment_result',
                summary: t('{exp} result recorded ({outcome}); no claim changed.', {
                  exp: experimentCode(x.code),
                  outcome: EXPERIMENT_OUTCOME_LABEL[result.outcome],
                }),
                source: ref,
              });
            }
          });
        },

        setNavigation(plan) {
          set((s) => {
            s.data.navigation = plan;
            const path = s.data.paths[plan.pathId];
            logUpdate(s.data, {
              kind: 'direction_set',
              summary: path
                ? t('You chose {path} ({title}) as your direction.', { path: pathCode(path.code), title: path.title })
                : t('You chose a path as your direction.'),
            });
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
            const x = s.data.navigation?.targets.find((y) => y.id === id);
            if (x) x.done = !x.done;
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
            nav.targets = nav.targets.filter((x) => x.id !== id);
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
          set((s) => {
            s.data = createSeedData();
          });
        },

        clearAll(name) {
          set((s) => {
            s.data = createEmptyData(name);
          });
        },

        replaceData(data) {
          // Imported files and restored versions are made whole on the way in (a copy, so the source stays as it was).
          set((s) => {
            s.data = structuredClone(data);
          });
        },

        setProfileName(name) {
          set((s) => {
            s.data.profile.name = name;
          });
        },
      };
    }),
    {
      name: STORAGE_KEYS.data,
      version: DATA_VERSION,
      storage: createJSONStorage(() => safeLocalStorage),
      partialize: (state) => ({ data: state.data }),
      // An atlas saved by an earlier version may hold references to things deleted back then: repair it on load.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<AtlasState> | undefined)?.data;
        if (!saved) return current;
        const data = structuredClone(saved);
        repairReferences(data);
        return { ...current, data };
      },
      migrate: (persisted, version) => migrateData(persisted, version) as { data: AtlasData },
    },
  ),
);

/** Where a status went, in words ("Plausible → Supported"). */
export const statusChange = (before?: string, after?: string) =>
  [before, after]
    .filter(Boolean)
    .map((s) => STATUS_META[s as keyof typeof STATUS_META]?.label ?? s)
    .join(' → ');
