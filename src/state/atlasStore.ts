/**
 * The atlas store: all of the person's data and every mutation of it.
 *
 * Components never mutate records directly; they call these actions. Each
 * action keeps referential integrity (deleting an element removes the links
 * and claims that depend on it, deleting a note removes the evidence and the
 * history read from it) and records changes in understanding in the
 * append-only model log, with the claim status before and after. After every
 * action, what the Atlas now believes is compared with what it believed
 * before (domain/beliefs), so a belief that moved because of new records is
 * logged too, with what caused it.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { ModelUpdateProposal, PatternCandidate } from '../ai/types';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import { beliefUpdates, currentLedger, sameLedger } from '../domain/beliefs';
import { canBeEvidence, claimCode, claimSentence, claimStatus, DEFAULT_SUPPORTED_EPISODES, LOGIC_VERSION, supportedEpisodes } from '../domain/claims';
import type { InquiryKind } from '../domain/inquiry';
import { calibration, emptyLearning, learnLink, memory, noteSuggestion } from '../domain/learning';
import { EFFECT_META, EXPERIMENT_OUTCOME_LABEL, STATUS_META } from '../domain/constants';
import { repairReferences } from '../domain/integrity';
import { decisionCode, entryCode, experimentCode, pathCode, patternCode, resolveSource, sameRef } from '../domain/selectors';
import type {
  AnalysisSuggestion,
  Area,
  AreaKey,
  ArmorRef,
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
  FactorChange,
  FactorReading,
  ID,
  Investigation,
  LearningMemory,
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
  SuggestionMade,
  View,
} from '../domain/types';
import { addDays, formatDate, todayISO, weekStart } from '../lib/dates';
import { arsenal, canUpgrade, quests } from '../domain/quests';
import type { Untie } from '../domain/weave';
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
export type NewClaim = Pick<Claim, 'from' | 'to' | 'effect'> &
  Partial<Pick<Claim, 'with' | 'via' | 'when' | 'lag' | 'author' | 'state' | 'rivalIds' | 'aspect' | 'condition' | 'scope'>>;
export type ClaimPatch = Partial<Pick<Claim, 'from' | 'to' | 'with' | 'effect' | 'via' | 'when' | 'lag' | 'aspect' | 'condition' | 'scope'>>;
export type NewExpectation = {
  factor: ID;
  reads: FactorReading;
  from: string;
  until: string;
  label: string;
  /** The claims it follows from. */
  basis: ID[];
  /** The test, decision or note it belongs to. */
  source?: SourceRef;
  excerpt?: string;
};
export type NewOccurrence = Omit<Occurrence, 'id' | 'createdAt' | 'origin' | 'mode'> & Partial<Pick<Occurrence, 'origin' | 'mode'>>;
export type NewEntry = Omit<Entry, 'id' | 'seq' | 'createdAt' | 'updatedAt' | 'analysis'>;
export type NewDecision = Omit<Decision, 'id' | 'seq' | 'createdAt' | 'updatedAt'>;
export type NewExperiment = Omit<Experiment, 'id' | 'code' | 'createdAt' | 'updatedAt'>;
export type NewPattern = Pick<Pattern, 'kind' | 'steps' | 'observation' | 'triggers' | 'behaviors' | 'consequences' | 'cues' | 'areas'>;
export type NewEvidence = {
  source: SourceRef;
  /** For an instance drawn from two records: the one showing the cause. */
  cause?: SourceRef;
  stance: Stance;
  excerpt: string;
  kind?: EvidenceKind;
  note?: string;
  addedBy: Evidence['addedBy'];
};

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
  /**
   * Edit a claim. A change of meaning (what it connects, how, or when it
   * holds) to a claim that already has evidence makes a new version: the
   * earlier one is kept, retired, with its evidence. Returns the id of the
   * claim as it now stands.
   */
  updateClaim(id: ID, patch: ClaimPatch): ID;
  /** Make what changes about a whole thing its own element, part of it, and point the claim at it. */
  promoteAspect(claimId: ID, end: 'from' | 'to', label: string): ID | undefined;
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
  /** What changed, as written with a happening. */
  setOccurrenceChanges(id: ID, changes: FactorChange[]): void;
  /** Episodes: keep a happening apart, group it with another, or let the Atlas group it again. */
  keepApart(id: ID): void;
  groupWith(id: ID, otherId: ID): void;
  regroup(id: ID): void;
  addExpectation(input: NewExpectation): ID;
  /** Your own verdict on an expectation, over what was read from the record (null: let the record say). */
  setExpectationVerdict(id: ID, outcome: 'held' | 'failed' | 'unobserved' | null, note?: string): void;
  deleteOccurrence(id: ID): void;
  // record
  addEntry(input: NewEntry): Entry;
  updateEntry(id: ID, patch: Partial<NewEntry>): void;
  deleteEntry(id: ID): void;
  setEntryAnalysis(id: ID, analysis: EntryAnalysis): void;
  /** Say yes or no to what was read from a note; `auto` when the Atlas takes it on its own (see domain/weave). */
  resolveSuggestion(entryId: ID, suggestionId: ID, accept: boolean, opts?: { auto?: boolean }): void;
  /** Take back one thread a note tied: what a suggestion made, a step it finished, a link or an area. */
  untie(entryId: ID, untie: Untie): void;
  /** Tick off steps and targets a note says are finished, on the note's date. */
  finishFromNote(entryId: ID, parts: { kind: 'action' | 'target'; id: ID }[]): void;
  /** Your explanation in a note, made a claim: it starts as a hunch, and the note is not its evidence. */
  claimFromNote(entryId: ID, suggestionId: ID): ID | undefined;
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
  /** Quests: take on a boss that got away again, with a new date; the date that passed is kept with how far it had got. */
  retryDeadline(boss: 'milestone' | ID, due: string): void;
  /**
   * Quests: start a quest of your own, a target with a date and its steps. In
   * the plan (when there is one and `inPlan`), or kept on its own; either way
   * it is a boss, and it shows in Ahead and on Time. Returns the target's id.
   */
  createQuest(input: { title: string; due: string; steps: string[]; inPlan: boolean }): ID;
  /** Quests: a repeat or a cycle that stands in a boss's way, or no longer. */
  addArmor(bossId: string, ref: ArmorRef): void;
  removeArmor(bossId: string, ref: ArmorRef): void;
  /** Quests: raise a skill one step with a level point (after practice); returns the upgrade's id. */
  upgradeSkill(nodeId: ID): ID | undefined;
  undoUpgrade(id: ID): void;
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
  /**
   * Show another copy of the same atlas (the account's, from another device):
   * nothing is logged, since nothing was decided here; what the Atlas
   * believes is taken again silently from what it now reads.
   */
  loadWorld(data: AtlasData): void;
  setProfileName(name: string): void;
  /** "Not now" to something the Atlas asked to find out: not asked again for a while. */
  /** Put a question away for a while (and remember its kind, so kinds often put away are asked later). */
  declineInquiry(key: string, kind?: InquiryKind): void;
  /** Ask for this many separate episodes before a reason reads "supported" (undefined: back to the usual). */
  setSupportedEpisodes(n: number | undefined): void;
  /** Stop suggesting an element from a word. */
  forgetWord(nodeId: ID, word: string): void;
  /** Forget the counts the Atlas learned from (rules you changed stay). */
  forgetLearning(): void;
  /** A search that found nothing: kept (a few dozen, most recent) so the app can be improved where it falls short. */
  noteFriction(query: string, where: string): void;
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

/** The elements a record is about, to tell whether its evidence still bears on a revised claim. */
function aboutOf(d: AtlasData, ref: SourceRef): Set<ID> {
  if (ref.kind === 'entry') return new Set(d.entries[ref.id]?.nodeIds ?? []);
  if (ref.kind === 'decision') return new Set(d.decisions[ref.id]?.nodeIds ?? []);
  if (ref.kind === 'occurrence') {
    const o = d.occurrences[ref.id];
    return new Set([...(o?.about ?? []), ...(o?.instanceOf ? [o.instanceOf] : []), ...(o?.changes ?? []).map((c) => c.factor)]);
  }
  const x = d.experiments[ref.id];
  const c = x?.claimId ? d.claims[x.claimId] : undefined;
  return new Set(c ? [c.from, ...c.with, c.to] : []);
}

const MEANING: (keyof ClaimPatch)[] = ['from', 'to', 'with', 'effect', 'aspect', 'when', 'condition', 'scope'];
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Edit a claim, keeping its history. An edit that only rewords how it may
 * work, or its delay, changes the claim in place. An edit that changes what
 * it says (its ends, direction, what about them changes, or when it holds)
 * to a claim that already has evidence makes a new version: the earlier one
 * stays, retired as revised, with all its evidence; the new one carries over
 * the evidence that still bears on it; whatever relied on the claim now
 * relies on the new version. History and records are never touched.
 */
function reviseClaim(d: AtlasData, id: ID, patch: ClaimPatch, promotion: boolean): ID {
  const old = d.claims[id];
  if (!old) return id;
  const changed = (Object.keys(patch) as (keyof ClaimPatch)[]).filter((k) => !same(old[k], patch[k]));
  if (!changed.length) return id;
  const meaning = changed.some((k) => MEANING.includes(k));
  if (!meaning || !old.evidence.length || old.state !== 'adopted' || old.retired) {
    const before = claimSentence(d, old);
    Object.assign(old, patch, { updatedAt: now() });
    logUpdate(d, {
      kind: 'claim_edited',
      summary: t('You edited {claim}. Before: {before}. Now: {after}.', { claim: claimCode(old.code), before, after: claimSentence(d, old) }),
      claimId: id,
    });
    return id;
  }

  const next: Claim = { ...old, ...patch } as Claim;
  const flipped = EFFECT_META[next.effect].polarity !== EFFECT_META[old.effect].polarity;
  const endsMoved = !promotion && (next.from !== old.from || next.to !== old.to || !same(next.with, old.with));
  const causes = [next.from, ...next.with];
  const bears = (e: Evidence) => {
    if (flipped) return false;
    if (!endsMoved) return true;
    const about = aboutOf(d, e.source);
    const outcome = about.has(next.to);
    const cause = causes.some((c) => about.has(c)) || (e.cause ? causes.some((c) => aboutOf(d, e.cause!).has(c)) : false);
    return e.kind === 'contrast' || e.kind === 'elsewhere' ? outcome : outcome && cause;
  };
  const before = claimStatus(d, old);
  const nid = createId('claim');
  const code = ++d.counters.claim;
  const at = now();
  const carried = old.evidence.filter(bears).map((e) => ({ ...e, id: createId('ev'), carriedFrom: id }));
  d.claims[nid] = {
    ...next,
    id: nid,
    code,
    revises: id,
    evidence: carried,
    rivalIds: [...old.rivalIds],
    view: undefined,
    retired: undefined,
    createdAt: at,
    updatedAt: at,
  };
  old.retired = { at: todayISO(), note: t('Revised into {claim}.', { claim: claimCode(code) }), revisedInto: nid };
  old.updatedAt = at;

  // What relied on the claim relies on the new version; a test stays with the version it tested.
  const swap = (ids: ID[]) => (ids.includes(id) ? [...new Set(ids.map((x) => (x === id ? nid : x)))] : ids);
  for (const c of Object.values(d.claims)) if (c.id !== nid && c.id !== id && c.rivalIds.includes(id)) c.rivalIds = swap(c.rivalIds);
  for (const p of Object.values(d.paths)) p.assumptionIds = swap(p.assumptionIds);
  for (const x of Object.values(d.decisions)) x.claimIds = swap(x.claimIds);
  for (const p of Object.values(d.patterns)) p.explainedBy = swap(p.explainedBy);
  for (const n of Object.values(d.nodes)) {
    if (n.claimId === id) n.claimId = nid;
    if (n.investigation) n.investigation.claimIds = swap(n.investigation.claimIds);
  }
  for (const o of Object.values(d.occurrences))
    if (o.expectation && o.mode === 'expected' && o.date >= todayISO()) o.expectation.basis = swap(o.expectation.basis);
  for (const [key, name] of Object.entries(d.loopNames)) {
    const ids = key.split('|');
    if (!ids.includes(id)) continue;
    delete d.loopNames[key];
    d.loopNames[
      ids
        .map((x) => (x === id ? nid : x))
        .sort()
        .join('|')
    ] = name;
  }

  logUpdate(d, {
    kind: 'claim_revised',
    summary: t(
      '{old} revised into {claim}: {sentence}. {carried} of its {total} pieces of evidence still bear on it and came along; the earlier version is kept, retired.',
      {
        old: claimCode(old.code),
        claim: claimCode(code),
        sentence: claimSentence(d, d.claims[nid]!),
        carried: carried.length,
        total: old.evidence.length,
      },
    ),
    claimId: nid,
    before,
    after: claimStatus(d, d.claims[nid]!),
  });
  return nid;
}

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
      // What the Atlas believes is compared before and after every change (domain/beliefs). The first
      // comparison is a silent baseline: nothing is logged for what was already believed.
      const set = (change: (s: AtlasState) => void, cause?: SourceRef) => {
        if (!get().data.beliefs) {
          const baseline = currentLedger(get().data);
          setDraft((s) => {
            s.data.beliefs = baseline;
          });
        }
        const since = get().data.modelLog.length;
        setDraft((s) => {
          change(s);
          repairReferences(s.data);
        });
        const d = get().data;
        const { log, ledger } = beliefUpdates(d, cause, since);
        if (!log.length && sameLedger(d.beliefs, ledger)) return;
        setDraft((s) => {
          for (const u of log) s.data.modelLog.push({ id: createId('log'), at: now(), ...u });
          s.data.beliefs = ledger;
        });
      };
      // What the Atlas learns from the person is only counted: it changes no record, so it skips the checks above.
      const learn = (fn: (mem: LearningMemory, d: AtlasData) => void) =>
        setDraft((s) => {
          fn(memory(s.data), s.data);
        });
      const learnLinks = (entryId: ID, nodeIds: ID[]) => {
        const e = get().data.entries[entryId];
        if (!e || !nodeIds.length) return;
        learn((mem, d) => {
          for (const id of nodeIds) if (d.nodes[id]) learnLink(mem, e, id, d.nodes[id].label);
        });
      };
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
              aspect: input.aspect,
              condition: input.condition,
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
          let current = id;
          set((s) => {
            current = reviseClaim(s.data, id, patch, false);
          });
          return current;
        },

        promoteAspect(claimId, end, label) {
          const c = get().data.claims[claimId];
          const thing = c && get().data.nodes[c[end]];
          const aspect = c?.aspect?.[end]?.trim();
          if (!c || !thing || !aspect || !label.trim()) return undefined;
          const nodeId = createId('node');
          let current: ID | undefined;
          set((s) => {
            const d = s.data;
            const at = now();
            const kind = thing.kind === 'behaviour' || /^[a-z]+ing\b/i.test(aspect) ? 'behaviour' : 'state';
            d.nodes[nodeId] = {
              id: nodeId,
              label: label.trim(),
              summary: t('What changes about {thing}: {aspect}.', { thing: thing.label, aspect }),
              kind,
              area: thing.area,
              origin: 'user',
              adopted: true,
              tags: [],
              createdAt: at,
              updatedAt: at,
            };
            const edgeId = createId('edge');
            d.edges[edgeId] = { id: edgeId, source: nodeId, target: thing.id, type: 'part_of', origin: 'user', createdAt: at };
            current = reviseClaim(d, claimId, { [end]: nodeId, aspect: { ...c.aspect, [end]: undefined } }, true);
          });
          return current;
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
            // Only what happened counts; a plan or an imagined branch never becomes evidence.
            if (!canBeEvidence(d, input.source) || (input.cause && !canBeEvidence(d, input.cause))) return;
            const before = claimStatus(d, c);
            c.evidence.push({ id: createId('ev'), ...input, kind: input.kind ?? 'instance', addedAt: now() });
            c.updatedAt = now();
            const code = resolveSource(d, input.source).code;
            logUpdate(d, {
              kind: 'evidence_added',
              summary:
                input.stance === 'supports'
                  ? t('{code} added as supporting evidence to {claim}.', { code, claim: claimCode(c.code) })
                  : input.stance === 'neutral'
                    ? t('{code} noted on {claim}: it happened without the cause.', { code, claim: claimCode(c.code) })
                    : t('{code} added as counter-evidence to {claim}.', { code, claim: claimCode(c.code) }),
              claimId,
              before,
              after: claimStatus(d, c),
              source: input.source,
            });
          }, input.source);
        },

        removeClaimEvidence(claimId, evidenceId) {
          set(
            (s) => {
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
            },
            get().data.claims[claimId]?.evidence.find((e) => e.id === evidenceId)?.source,
          );
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
          set(
            (s) => {
              s.data.occurrences[id] = { ...input, id, mode: input.mode ?? 'actual', origin: input.origin ?? 'user', createdAt: now() };
            },
            { kind: 'occurrence', id },
          );
          return id;
        },

        updateOccurrence(id, patch) {
          set(
            (s) => {
              const o = s.data.occurrences[id];
              if (o) Object.assign(o, patch);
            },
            { kind: 'occurrence', id },
          );
        },

        setOccurrenceChanges(id, changes) {
          set(
            (s) => {
              const o = s.data.occurrences[id];
              if (!o) return;
              const kept = changes.filter((c, i) => s.data.nodes[c.factor] && changes.findIndex((x) => x.factor === c.factor) === i);
              o.changes = kept.length ? kept : undefined;
            },
            { kind: 'occurrence', id },
          );
        },

        keepApart(id) {
          set((s) => {
            const o = s.data.occurrences[id];
            if (o) o.episode = createId('ep');
          });
        },

        groupWith(id, otherId) {
          set((s) => {
            const o = s.data.occurrences[id];
            const other = s.data.occurrences[otherId];
            if (!o || !other || o === other) return;
            other.episode ??= createId('ep');
            o.episode = other.episode;
          });
        },

        regroup(id) {
          set((s) => {
            const o = s.data.occurrences[id];
            if (o) o.episode = undefined;
          });
        },

        addExpectation(input) {
          const id = createId('occ');
          set(
            (s) => {
              const d = s.data;
              const basis = input.basis.filter((c) => d.claims[c]);
              d.occurrences[id] = {
                id,
                kind: 'event',
                label: input.label.trim(),
                date: input.from,
                until: input.until,
                about: [input.factor],
                source: input.source,
                excerpt: input.excerpt,
                changes: [{ factor: input.factor, reads: input.reads }],
                expectation: { basis },
                mode: 'expected',
                origin: 'user',
                createdAt: now(),
              };
              logUpdate(d, {
                kind: 'expectation_added',
                summary:
                  basis.length > 1
                    ? t('You expect: {label}, by {date}. It rests on {n} reasons together.', {
                        label: input.label.trim(),
                        date: formatDate(input.until),
                        n: basis.length,
                      })
                    : t('You expect: {label}, by {date}.', { label: input.label.trim(), date: formatDate(input.until) }),
                claimId: basis.length === 1 ? basis[0] : undefined,
              });
            },
            { kind: 'occurrence', id },
          );
          return id;
        },

        setExpectationVerdict(id, outcome, note) {
          set(
            (s) => {
              const o = s.data.occurrences[id];
              if (!o?.expectation) return;
              o.expectation.verdict = outcome ? { outcome, note: note?.trim() || undefined, at: now() } : undefined;
              if (outcome)
                logUpdate(s.data, {
                  kind: 'expectation_checked',
                  summary: t('You checked an expectation: {label}. {verdict}.', {
                    label: o.label,
                    verdict: outcome === 'held' ? t('It held') : outcome === 'failed' ? t('It did not hold') : t('Nothing was recorded to tell'),
                  }),
                  claimId: o.expectation.basis.length === 1 ? o.expectation.basis[0] : undefined,
                });
            },
            { kind: 'occurrence', id },
          );
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
          set(
            (s) => {
              const seq = ++s.data.counters.entry;
              created = { ...input, id, seq, createdAt: at, updatedAt: at };
              s.data.entries[id] = created;
            },
            { kind: 'entry', id },
          );
          learnLinks(id, input.nodeIds ?? []);
          return get().data.entries[id] ?? created;
        },

        updateEntry(id, patch) {
          const before = get().data.entries[id]?.nodeIds ?? [];
          set(
            (s) => {
              const e = s.data.entries[id];
              if (e) Object.assign(e, patch, { updatedAt: now() });
            },
            { kind: 'entry', id },
          );
          if (patch.nodeIds)
            learnLinks(
              id,
              patch.nodeIds.filter((n) => !before.includes(n)),
            );
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
            // Keep decisions already made on equivalent suggestions, and what taking them made, so they can still be taken back.
            const prior = new Map((e.analysis?.suggestions ?? []).filter((x) => x.state !== 'pending').map((x) => [suggestionKey(x), x]));
            for (const sug of analysis.suggestions) {
              const was = prior.get(suggestionKey(sug));
              if (!was || sug.state !== 'pending') continue;
              sug.state = was.state;
              if (was.auto) sug.auto = true;
              if (was.made) sug.made = was.made;
            }
            e.analysis = analysis;
          });
        },

        resolveSuggestion(entryId, suggestionId, accept, opts = {}) {
          const entry = get().data.entries[entryId];
          const sug = entry?.analysis?.suggestions.find((x) => x.id === suggestionId);
          if (!entry || !sug || sug.state !== 'pending') return;
          // What taking it makes, kept with it so it can be taken back exactly.
          const made: SuggestionMade = {};
          if (accept && sug.type === 'pattern_evidence') {
            const source: SourceRef = { kind: 'entry', id: entryId };
            get().addPatternEvidence(sug.patternId, { source, stance: sug.stance, excerpt: sug.excerpt, addedBy: opts.auto ? 'inferred' : 'user' });
            made.evidence = get().data.patterns[sug.patternId]?.evidence.find((e) => sameRef(e.source, source))?.id;
          }
          if (accept && sug.type === 'occurrence') {
            made.occurrence = get().addOccurrence({
              kind: sug.kind,
              label: sug.label,
              date: entry.date,
              about: sug.about,
              instanceOf: sug.instanceOf,
              source: { kind: 'entry', id: entryId },
              excerpt: sug.excerpt,
            });
          }
          if (accept && sug.type === 'change') {
            // What changed goes with the note's happening about it, or becomes one.
            const d = get().data;
            const fromNote = Object.values(d.occurrences).filter((o) => o.mode === 'actual' && o.source?.kind === 'entry' && o.source.id === entryId);
            const host = fromNote.find((o) => o.about.includes(sug.factor) || o.instanceOf === sug.factor);
            const change = { factor: sug.factor, reads: sug.reads };
            if (host) {
              get().setOccurrenceChanges(host.id, [...(host.changes ?? []).filter((c) => c.factor !== sug.factor), change]);
              made.host = host.id;
            } else {
              const behaviour = d.nodes[sug.factor]?.kind === 'behaviour';
              made.occurrence = get().addOccurrence({
                kind: behaviour && sug.reads === 'present' ? 'action' : 'event',
                label: sug.excerpt.length > 72 ? `${sug.excerpt.slice(0, 70).trimEnd()}…` : sug.excerpt.replace(/[.!]$/, ''),
                date: entry.date,
                about: [sug.factor],
                instanceOf: behaviour && sug.reads === 'present' ? sug.factor : undefined,
                source: { kind: 'entry', id: entryId },
                excerpt: sug.excerpt,
                changes: [change],
              });
            }
          }
          if (accept && sug.type === 'expectation') {
            made.occurrence = get().addExpectation({
              factor: sug.factor,
              reads: sug.reads,
              from: entry.date,
              until: addDays(entry.date, sug.within),
              label: sug.excerpt.length > 72 ? `${sug.excerpt.slice(0, 70).trimEnd()}…` : sug.excerpt.replace(/[.!]$/, ''),
              basis: [],
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
            if (opts.auto) x.auto = true;
            if (Object.keys(made).length) x.made = made;
            if (x.type === 'link_node' && !e.nodeIds.includes(x.nodeId)) e.nodeIds.push(x.nodeId);
            if (x.type === 'area' && !e.areas.includes(x.area)) e.areas.push(x.area);
          });
          // Only what you decide teaches the Atlas what you take; what it took on its own does not.
          if (opts.auto) return;
          learn((mem) => noteSuggestion(mem, sug.type, accept));
          if (accept && sug.type === 'link_node') learnLinks(entryId, [sug.nodeId]);
        },

        untie(entryId, what) {
          const entry = get().data.entries[entryId];
          if (!entry) return;
          if (what.kind === 'unlink') return get().updateEntry(entryId, { nodeIds: entry.nodeIds.filter((n) => n !== what.node) });
          if (what.kind === 'area')
            return get().updateEntry(entryId, {
              areas: entry.areas.filter((a) => a !== what.area),
              woven: entry.woven ? { ...entry.woven, area: undefined } : undefined,
            });
          if (what.kind === 'part') {
            set((s) => {
              const d = s.data;
              const e = d.entries[entryId];
              const nav = d.navigation;
              const action = nav?.actions.find((a) => a.id === what.id) ?? d.quests?.own?.actions.find((a) => a.id === what.id);
              const target = nav?.targets.find((x) => x.id === what.id) ?? d.quests?.own?.targets.find((x) => x.id === what.id);
              if (action) {
                action.status = 'todo';
                action.doneAt = undefined;
              }
              if (target) {
                target.done = false;
                target.doneAt = undefined;
              }
              // Never ticked again from this note.
              if (e?.woven) e.woven = { parts: e.woven.parts.filter((p) => p !== what.id), declined: [...new Set([...(e.woven.declined ?? []), what.id])] };
            });
            return;
          }
          const sug = entry.analysis?.suggestions.find((x) => x.id === what.id);
          if (!sug || sug.state !== 'accepted') return;
          const made = sug.made ?? {};
          const d = get().data;
          if (sug.type === 'link_node') get().updateEntry(entryId, { nodeIds: entry.nodeIds.filter((n) => n !== sug.nodeId) });
          if (sug.type === 'area') get().updateEntry(entryId, { areas: entry.areas.filter((a) => a !== sug.area) });
          if (sug.type === 'pattern_evidence' && made.evidence) get().removePatternEvidence(sug.patternId, made.evidence);
          if (made.occurrence && d.occurrences[made.occurrence]) get().deleteOccurrence(made.occurrence);
          if (sug.type === 'change' && made.host && d.occurrences[made.host])
            get().setOccurrenceChanges(
              made.host,
              (d.occurrences[made.host].changes ?? []).filter((c) => c.factor !== sug.factor),
            );
          if (made.claim && d.claims[made.claim]) get().deleteClaim(made.claim);
          set((s) => {
            const x = s.data.entries[entryId]?.analysis?.suggestions.find((y) => y.id === what.id);
            if (!x) return;
            x.state = 'dismissed';
            x.made = undefined;
          });
          learn((mem) => noteSuggestion(mem, sug.type, false));
        },

        finishFromNote(entryId, parts) {
          set((s) => {
            const d = s.data;
            const e = d.entries[entryId];
            if (!e || !parts.length) return;
            // Finished on the day the note is about, never later than today.
            const on = e.date < todayISO() ? e.date : todayISO();
            const nav = d.navigation;
            for (const part of parts) {
              if (part.kind === 'action') {
                const a = nav?.actions.find((x) => x.id === part.id) ?? d.quests?.own?.actions.find((x) => x.id === part.id);
                if (!a || a.status !== 'todo') continue;
                a.status = 'done';
                a.doneAt = on;
                if (nav && nav.currentActionId === a.id)
                  nav.currentActionId =
                    nav.actions.find((x) => x.status === 'todo' && x.week >= a.week)?.id ?? nav.actions.find((x) => x.status === 'todo')?.id;
              } else {
                const x = nav?.targets.find((y) => y.id === part.id) ?? d.quests?.own?.targets.find((y) => y.id === part.id);
                if (!x || x.done) continue;
                x.done = true;
                x.doneAt = on;
              }
              e.woven = { ...e.woven, parts: [...new Set([...(e.woven?.parts ?? []), part.id])] };
            }
          });
        },

        claimFromNote(entryId, suggestionId) {
          const sug = get().data.entries[entryId]?.analysis?.suggestions.find((x) => x.id === suggestionId);
          if (!sug || sug.type !== 'attribution' || sug.state !== 'pending' || !sug.claim) return undefined;
          const { from, to, effect } = sug.claim;
          if (!get().data.nodes[from] || !get().data.nodes[to]) return undefined;
          // A reason you already have is connected to, never made twice (and never taken away with the note's).
          const known = Object.values(get().data.claims).some((c) => c.from === from && c.to === to && c.effect === effect && c.state !== 'set_aside');
          const id = get().addClaim({ from, to, effect, author: 'user', state: 'adopted' });
          set((s) => {
            const x = s.data.entries[entryId]?.analysis?.suggestions.find((y) => y.id === suggestionId);
            if (!x) return;
            x.state = 'accepted';
            if (!known) x.made = { claim: id };
          });
          learn((mem) => noteSuggestion(mem, 'attribution', true));
          return id;
        },

        /* ---------------- decisions ---------------- */

        addDecision(input) {
          const id = createId('dec');
          const at = now();
          set(
            (s) => {
              const seq = ++s.data.counters.decision;
              s.data.decisions[id] = { ...input, id, seq, createdAt: at, updatedAt: at };
            },
            { kind: 'decision', id },
          );
          return get().data.decisions[id];
        },

        updateDecision(id, patch) {
          set(
            (s) => {
              const x = s.data.decisions[id];
              if (x) Object.assign(x, patch, { updatedAt: now() });
            },
            { kind: 'decision', id },
          );
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
            if (!p || p.evidence.some((e) => sameRef(e.source, input.source)) || !canBeEvidence(d, input.source)) return;
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
          set(
            (s) => {
              const x = s.data.experiments[id];
              if (x) Object.assign(x, patch, { updatedAt: now() });
            },
            { kind: 'experiment', id },
          );
        },

        deleteExperiment(id) {
          set((s) => {
            delete s.data.experiments[id];
            dropEvidence(s.data, { kind: 'experiment', id }, t('Test'));
          });
        },

        applyExperimentResult(id, result, proposal) {
          set(
            (s) => {
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
            },
            { kind: 'experiment', id },
          );
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
            const x = s.data.navigation?.targets.find((y) => y.id === id) ?? s.data.quests?.own?.targets.find((y) => y.id === id);
            if (!x) return;
            x.done = !x.done;
            x.doneAt = x.done ? todayISO() : undefined;
          });
        },

        retryDeadline(boss, due) {
          set((s) => {
            const nav = s.data.navigation;
            const b = quests(s.data).bosses.find((x) => (boss === 'milestone' ? x.kind === 'milestone' : x.targetId === boss));
            if (!b) return;
            const missed = { due: b.due, done: b.maxHp - b.hp, total: b.maxHp };
            if (boss === 'milestone') {
              if (nav) nav.milestone = { ...nav.milestone, due, missed: [...(nav.milestone.missed ?? []), missed] };
            } else {
              const x = nav?.targets.find((y) => y.id === boss) ?? s.data.quests?.own?.targets.find((y) => y.id === boss);
              if (!x) return;
              x.missed = [...(x.missed ?? []), missed];
              x.due = due;
            }
          });
        },

        createQuest({ title, due, steps, inPlan }) {
          const id = createId('tgt');
          set((s) => {
            const week = weekStart(todayISO());
            const target = { id, title: title.trim(), due, done: false };
            const actions = steps
              .map((x) => x.trim())
              .filter(Boolean)
              .map((x) => ({ id: createId('act'), title: x, targetId: id, week, status: 'todo' as const }));
            const nav = s.data.navigation;
            if (inPlan && nav) {
              nav.targets.push(target);
              nav.actions.push(...actions);
              if (!nav.currentActionId || !nav.actions.some((a) => a.id === nav.currentActionId && a.status === 'todo')) nav.currentActionId = actions[0]?.id;
            } else {
              const q = (s.data.quests ??= { armor: {}, upgrades: [] });
              const own = (q.own ??= { targets: [], actions: [] });
              own.targets.push(target);
              own.actions.push(...actions);
            }
          });
          return id;
        },

        addArmor(bossId, ref) {
          set((s) => {
            const q = (s.data.quests ??= { armor: {}, upgrades: [] });
            const list = (q.armor[bossId] ??= []);
            if (!list.some((r) => r.kind === ref.kind && r.id === ref.id)) list.push({ kind: ref.kind, id: ref.id });
          });
        },

        removeArmor(bossId, ref) {
          set((s) => {
            const q = s.data.quests;
            if (!q?.armor[bossId]) return;
            q.armor[bossId] = q.armor[bossId].filter((r) => !(r.kind === ref.kind && r.id === ref.id));
            if (!q.armor[bossId].length) delete q.armor[bossId];
          });
        },

        upgradeSkill(nodeId) {
          const data = get().data;
          const a = arsenal(data);
          const item = a.items.find((i) => i.node.id === nodeId);
          if (!item || canUpgrade(a, item) !== 'ok') return undefined;
          const id = createId('up');
          set((s) => {
            const node = s.data.nodes[nodeId];
            if (!node) return;
            const q = (s.data.quests ??= { armor: {}, upgrades: [] });
            q.upgrades.push({ id, nodeId, from: item.level, to: item.next!, at: todayISO() });
            node.level = item.next;
            node.updatedAt = now();
            // The direction's own list of skills says the same.
            const path = s.data.navigation ? s.data.paths[s.data.navigation.pathId] : undefined;
            const req = path?.skills.find((r) => r.label === item.asked);
            if (req) req.status = item.next!;
          });
          return id;
        },

        undoUpgrade(id) {
          set((s) => {
            const q = s.data.quests;
            const u = q?.upgrades.find((x) => x.id === id);
            if (!q || !u) return;
            q.upgrades = q.upgrades.filter((x) => x.id !== id);
            const node = s.data.nodes[u.nodeId];
            if (node && node.level === u.to) {
              node.level = u.from;
              node.updatedAt = now();
              const path = s.data.navigation ? s.data.paths[s.data.navigation.pathId] : undefined;
              const req = path?.skills.find(
                (r) =>
                  r.status === u.to && (r.label.toLowerCase().includes(node.label.toLowerCase()) || node.label.toLowerCase().includes(r.label.toLowerCase())),
              );
              if (req) req.status = u.from;
            }
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
            const own = s.data.quests?.own;
            if (own?.targets.some((x) => x.id === id)) {
              // A quest of your own goes with its steps: they belong to nothing else.
              own.targets = own.targets.filter((x) => x.id !== id);
              own.actions = own.actions.filter((a) => a.targetId !== id);
              return;
            }
            if (!nav) return;
            nav.targets = nav.targets.filter((x) => x.id !== id);
            nav.actions.forEach((a) => a.targetId === id && (a.targetId = undefined));
          });
        },

        addAction(title, targetId) {
          set((s) => {
            const nav = s.data.navigation;
            const own = s.data.quests?.own;
            const id = createId('act');
            if (targetId && own?.targets.some((x) => x.id === targetId)) {
              own.actions.push({ id, title, targetId, week: weekStart(todayISO()), status: 'todo' });
              return;
            }
            if (!nav) return;
            nav.actions.push({ id, title, targetId, week: weekStart(todayISO()), status: 'todo' });
            if (!nav.currentActionId || !nav.actions.some((a) => a.id === nav.currentActionId && a.status === 'todo')) nav.currentActionId = id;
          });
        },

        setActionStatus(id, status) {
          set((s) => {
            const nav = s.data.navigation;
            const own = s.data.quests?.own?.actions.find((x) => x.id === id);
            if (own) {
              own.status = status;
              own.doneAt = status === 'done' ? (own.doneAt ?? todayISO()) : undefined;
              return;
            }
            const a = nav?.actions.find((x) => x.id === id);
            if (!nav || !a) return;
            a.status = status;
            a.doneAt = status === 'done' ? (a.doneAt ?? todayISO()) : undefined;
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
            const own = s.data.quests?.own;
            if (own?.actions.some((a) => a.id === id)) {
              own.actions = own.actions.filter((a) => a.id !== id);
              return;
            }
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

        loadWorld(data) {
          const next = structuredClone(data);
          repairReferences(next);
          next.beliefs = currentLedger(next);
          setDraft((s) => {
            s.data = next;
          });
        },

        setProfileName(name) {
          set((s) => {
            s.data.profile.name = name;
          });
        },

        declineInquiry(key, kind) {
          set((s) => {
            s.data.inquiry ??= { declined: {} };
            s.data.inquiry.declined[key] = todayISO();
          });
          if (kind) learn((mem) => void (mem.declined[kind] = (mem.declined[kind] ?? 0) + 1));
        },

        setSupportedEpisodes(n) {
          const from = supportedEpisodes(get().data);
          const row = calibration(get().data).find((c) => c.status === 'supported');
          set((s) => {
            const mem = memory(s.data);
            if (n === undefined || n === DEFAULT_SUPPORTED_EPISODES) mem.rules = {};
            else mem.rules = { supportedEpisodes: n, since: todayISO() };
            logUpdate(s.data, {
              kind: 'rule_changed',
              summary:
                n === undefined || n === DEFAULT_SUPPORTED_EPISODES
                  ? t('“Supported” asks for {n} separate episodes again, as it did at first.', { n: DEFAULT_SUPPORTED_EPISODES })
                  : t(
                      '“Supported” now asks for {n} separate episodes (it asked for {m}): predictions from supported reasons held {held} times and did not hold {failed} times.',
                      {
                        n,
                        m: from,
                        held: row?.held ?? 0,
                        failed: row?.failed ?? 0,
                      },
                    ),
              rule: 'supported',
              logicVersion: LOGIC_VERSION,
            });
          });
        },

        forgetWord(nodeId, word) {
          learn((mem, d) => {
            if (!mem.forgotten.includes(`${nodeId}:${word}`)) mem.forgotten.push(`${nodeId}:${word}`);
            if (mem.words[nodeId]) delete mem.words[nodeId][word];
            logUpdate(d, {
              kind: 'learning_forgotten',
              summary: t('The Atlas no longer suggests {element} from the word “{word}”.', { element: d.nodes[nodeId]?.label ?? '', word }),
            });
          });
        },

        noteFriction(query, where) {
          const q = query.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
          if (q.length < 3) return;
          learn((mem) => {
            const today = todayISO();
            const found = mem.friction.find((f) => f.q === q && f.where === where);
            if (found) {
              found.n++;
              found.last = today;
            } else mem.friction.push({ q, where, n: 1, last: today });
            mem.friction.sort((a, b) => a.last.localeCompare(b.last));
            if (mem.friction.length > 40) mem.friction.splice(0, mem.friction.length - 40);
          });
        },

        forgetLearning() {
          learn((mem, d) => {
            d.learning = { ...emptyLearning(), rules: mem.rules };
            logUpdate(d, { kind: 'learning_forgotten', summary: t('The Atlas forgot what it had learned from you (rules you changed stay).') });
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
