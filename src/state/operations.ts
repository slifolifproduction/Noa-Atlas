/**
 * Workflows that combine the analysis layer with the store. UI components call
 * these instead of talking to providers directly, so every AI output passes
 * through the same review-then-apply path.
 */
import { resolveProvider, type AnalysisProvider } from '../ai';
import { AnalysisError } from '../ai/errors';
import { analyzeEntryLocally } from '../ai/localAnalysis';
import type { ExperimentDraft, ModelUpdateProposal } from '../ai/types';
import { CAPTURE_TARGET } from '../domain/constants';
import { player } from '../domain/quests';
import { decisionCode, experimentCode, pathCode } from '../domain/selectors';
import { areaToTake, decisionIn, finishedIn, knownClaim, takenOnItsOwn } from '../domain/weave';
import type { CaptureKind, Entry, EntryAnalysis, Experiment, ExperimentResult, ID } from '../domain/types';
import { useAtlas, type NewDecision, type NewEntry } from './atlasStore';
import { toast, useUI } from './uiStore';
import { t } from '../i18n';

let warnedFallback = false;

export function provider(): AnalysisProvider {
  return resolveProvider(useUI.getState().settings, (error) => {
    if (warnedFallback) return;
    warnedFallback = true;
    const reason = error instanceof AnalysisError ? error.message : t('The Claude proxy is unavailable.');
    toast(t('{reason} Using local heuristics instead.', { reason }), { tone: 'warning' });
    setTimeout(() => (warnedFallback = false), 30_000);
  });
}

async function withBusy<T>(key: string, fn: () => Promise<T>): Promise<T> {
  useUI.getState().setBusy(key, true);
  try {
    return await fn();
  } finally {
    useUI.getState().setBusy(key, false);
  }
}

function countPending(analysis: EntryAnalysis) {
  return analysis.suggestions.filter((s) => s.state === 'pending').length;
}

export async function analyzeEntry(id: ID): Promise<EntryAnalysis | undefined> {
  const entry = useAtlas.getState().data.entries[id];
  if (!entry) return undefined;
  return withBusy(`entry:${id}`, async () => {
    const analysis = await provider().analyzeEntry(entry, useAtlas.getState().data);
    useAtlas.getState().setEntryAnalysis(id, analysis);
    return useAtlas.getState().data.entries[id]?.analysis;
  });
}

/**
 * Create a note, optionally place what it describes on the map (a goal, a
 * commitment, a behaviour) or in history (a formative experience), then read
 * it and connect it. The note itself always stays the record.
 */
export async function captureEntry(input: NewEntry, opts: { addToMap?: boolean; asDecision?: boolean } = {}): Promise<Entry> {
  const atlas = useAtlas.getState();
  const before = player(atlas.data);
  const target = CAPTURE_TARGET[input.kind as CaptureKind];
  const entry = atlas.addEntry(input);
  if (opts.addToMap && target?.element) {
    const nodeId = atlas.addNode({
      label: input.title,
      summary: '',
      kind: target.element,
      area: input.areas[0] ?? 'projects',
      since: target.element === 'commitment' ? input.date : undefined,
    });
    atlas.updateEntry(entry.id, { nodeIds: [...entry.nodeIds, nodeId] });
  }
  if (opts.addToMap && target?.occurrence) {
    atlas.addOccurrence({
      kind: target.occurrence,
      label: input.title,
      date: input.date,
      about: input.nodeIds,
      landmark: true,
      source: { kind: 'entry', id: entry.id },
      excerpt: input.content,
    });
  }
  await readAndWeave(entry.id, { asDecision: opts.asDecision });
  // What the note connected to, lens by lens, with what it was worth in Quests.
  const after = player(useAtlas.getState().data);
  useUI.getState().showWoven({ entryId: entry.id, xp: after.xp - before.xp, level: after.level > before.level ? after.level : undefined });
  return useAtlas.getState().data.entries[entry.id];
}

/**
 * Connect a note to every lens (see domain/weave): take on its own what only
 * says what the note says, then tick off the steps and targets it says are
 * finished. What only you can say stays offered.
 */
export function weaveEntry(id: ID, opts: { asDecision?: boolean } = {}) {
  const atlas = useAtlas.getState;
  const entry = atlas().data.entries[id];
  if (!entry) return;
  // In the order they were read: a happening before what changed in it.
  for (const s of entry.analysis?.suggestions ?? [])
    if (s.state === 'pending' && (takenOnItsOwn(s) || knownClaim(atlas().data, s))) atlas().resolveSuggestion(id, s.id, true, { auto: true });
  const area = areaToTake(atlas().data, atlas().data.entries[id]);
  const worded = atlas().data.entries[id].analysis?.suggestions.find((s) => s.type === 'area' && s.area === area && s.state === 'pending');
  if (worded) atlas().resolveSuggestion(id, worded.id, true, { auto: true });
  else if (area) atlas().updateEntry(id, { areas: [area], woven: { parts: [], ...atlas().data.entries[id].woven, area } });
  const now = atlas().data.entries[id];
  const done = finishedIn(atlas().data, now, [...(now.woven?.parts ?? []), ...(now.woven?.declined ?? [])]);
  if (done.length) atlas().finishFromNote(id, done);
  // A decision it says was made (or, written as one, its first sentence), with what the note is about and its area.
  const last = atlas().data.entries[id];
  if (!last.woven?.decision && !last.woven?.decisionDeclined) {
    const decided = decisionIn(last, opts.asDecision);
    if (decided) atlas().decideFromNote(id, decided);
  }
}

/** After a note is changed: read it again, connect what it now says, and show what it is connected to. */
export async function reconnectEntry(id: ID) {
  const before = player(useAtlas.getState().data);
  await readAndWeave(id);
  const after = player(useAtlas.getState().data);
  useUI.getState().showWoven({ entryId: id, xp: after.xp - before.xp, level: after.level > before.level ? after.level : undefined });
}

/** Read a note (again) and connect what it says. */
export async function readAndWeave(id: ID, opts: { asDecision?: boolean } = {}) {
  const analysis = await analyzeEntry(id);
  weaveEntry(id, opts);
  return analysis;
}

/** A decision is a branch point in history; it needs no copy on the map. */
export function captureDecision(input: NewDecision) {
  const atlas = useAtlas.getState();
  const decision = atlas.addDecision(input);
  toast(t('Logged {code}.', { code: decisionCode(decision.seq) }), {
    tone: 'success',
    action: { label: t('Open'), run: () => useUI.getState().openEntity({ kind: 'decision', id: decision.id }) },
  });
  return decision;
}

/** Re-run analysis across every entry; keeps decisions already made on suggestions. */
export async function scanAllEntries(): Promise<number> {
  return withBusy('scan', async () => {
    const p = provider();
    let found = 0;
    for (const entry of Object.values(useAtlas.getState().data.entries)) {
      // The local analyzer is synchronous; skip the simulated latency per entry.
      const analysis = p.id === 'local' ? analyzeEntryLocally(entry, useAtlas.getState().data) : await p.analyzeEntry(entry, useAtlas.getState().data);
      useAtlas.getState().setEntryAnalysis(entry.id, analysis);
      found += countPending(useAtlas.getState().data.entries[entry.id]?.analysis ?? analysis);
    }
    return found;
  });
}

export async function detectDecisionPatterns() {
  return withBusy('decision-patterns', () => provider().detectDecisionPatterns(useAtlas.getState().data));
}

/** Ways to test a claim: change the cause on purpose, or look for contrast cases. */
export async function proposeExperiments(claimId: ID): Promise<ExperimentDraft[]> {
  const claim = useAtlas.getState().data.claims[claimId];
  if (!claim) return [];
  return withBusy(`propose:${claimId}`, () => provider().proposeExperiments(claim, useAtlas.getState().data));
}

export function adoptExperimentDraft(draft: ExperimentDraft, links: { claimId?: ID; patternId?: ID; pathId?: ID; questionId?: ID }): ID {
  const id = useAtlas.getState().addExperiment({
    title: draft.title,
    hypothesis: draft.hypothesis,
    design: draft.design,
    durationDays: draft.durationDays,
    status: 'proposed',
    claimId: links.claimId,
    prediction: draft.prediction,
    criteria: draft.criteria,
    measures: draft.measures.map((m, i) => ({ id: `m${i + 1}`, ...m })),
    patternIds: links.patternId ? [links.patternId] : [],
    pathIds: links.pathId ? [links.pathId] : [],
    questionIds: links.questionId ? [links.questionId] : [],
  });
  const x = useAtlas.getState().data.experiments[id];
  toast(t('{code} added as a proposed experiment.', { code: experimentCode(x.code) }), { tone: 'success' });
  return id;
}

export async function reviewExperimentResult(experiment: Experiment, result: ExperimentResult): Promise<ModelUpdateProposal> {
  return withBusy(`review:${experiment.id}`, () => provider().evaluateExperiment(experiment, result, useAtlas.getState().data));
}

export async function commitDirection(pathId: ID) {
  const path = useAtlas.getState().data.paths[pathId];
  if (!path) return;
  await withBusy(`commit:${pathId}`, async () => {
    const plan = await provider().draftNavigationPlan(path, useAtlas.getState().data);
    useAtlas.getState().setNavigation(plan);
  });
  toast(t('{code} is now your direction. A draft plan is ready to edit.', { code: pathCode(path.code) }), { tone: 'success' });
}
