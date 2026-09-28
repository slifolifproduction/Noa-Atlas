/**
 * Workflows that combine the analysis layer with the store. UI components call
 * these instead of talking to providers directly, so every AI output passes
 * through the same review-then-apply path.
 */
import { resolveProvider, type AnalysisProvider } from '../ai';
import { AnalysisError } from '../ai/errors';
import { analyzeEntryLocally } from '../ai/localAnalysis';
import type { ExperimentDraft, ModelUpdateProposal } from '../ai/types';
import { CAPTURE_NODE_TARGET } from '../domain/constants';
import { decisionCode, entryCode, experimentCode, pathCode } from '../domain/selectors';
import type { CaptureKind, Entry, EntryAnalysis, Experiment, ExperimentResult, ID } from '../domain/types';
import { useAtlas, type NewDecision, type NewEntry } from './atlasStore';
import { toast, useUI } from './uiStore';

let warnedFallback = false;

export function provider(): AnalysisProvider {
  return resolveProvider(useUI.getState().settings, (error) => {
    if (warnedFallback) return;
    warnedFallback = true;
    const reason = error instanceof AnalysisError ? error.message : 'The Claude proxy is unavailable.';
    toast(`${reason} Using local heuristics instead.`, { tone: 'warning' });
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

/** Create an entry, optionally place it on a map, then analyse it. */
export async function captureEntry(input: NewEntry, opts: { addToMap?: boolean } = {}): Promise<Entry> {
  const atlas = useAtlas.getState();
  const target = CAPTURE_NODE_TARGET[input.kind as CaptureKind];
  const entry = atlas.addEntry(input);
  if (opts.addToMap && target) {
    const nodeId = atlas.addNode({
      label: input.title,
      summary: '',
      ...target,
      source: target.category ? { kind: 'entry', id: entry.id } : undefined,
    });
    if (!target.category) atlas.updateEntry(entry.id, { nodeIds: [...entry.nodeIds, nodeId] });
  }
  const ui = useUI.getState();
  const analysis = await analyzeEntry(entry.id);
  const pending = analysis ? countPending(analysis) : 0;
  ui.toast(`Saved ${entryCode(entry.seq)}.${pending ? ` Analysis has ${pending} suggestion${pending === 1 ? '' : 's'} to review.` : ''}`, {
    tone: 'success',
    action: { label: 'Review', run: () => useUI.getState().openEntity({ kind: 'entry', id: entry.id }) },
  });
  return useAtlas.getState().data.entries[entry.id];
}

export function captureDecision(input: NewDecision, opts: { addToMap?: boolean } = {}) {
  const atlas = useAtlas.getState();
  const decision = atlas.addDecision(input);
  if (opts.addToMap) {
    atlas.addNode({ label: input.title, summary: '', category: 'decision', source: { kind: 'decision', id: decision.id } });
  }
  toast(`Logged ${decisionCode(decision.seq)}.`, {
    tone: 'success',
    action: { label: 'Open', run: () => useUI.getState().openEntity({ kind: 'decision', id: decision.id }) },
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

export async function proposeExperiments(patternId: ID): Promise<ExperimentDraft[]> {
  const pattern = useAtlas.getState().data.patterns[patternId];
  if (!pattern) return [];
  return withBusy(`propose:${patternId}`, () => provider().proposeExperiments(pattern, useAtlas.getState().data));
}

export function adoptExperimentDraft(draft: ExperimentDraft, links: { patternId?: ID; pathId?: ID; questionId?: ID }): ID {
  const id = useAtlas.getState().addExperiment({
    title: draft.title,
    hypothesis: draft.hypothesis,
    design: draft.design,
    durationDays: draft.durationDays,
    status: 'proposed',
    measures: draft.measures.map((m, i) => ({ id: `m${i + 1}`, ...m })),
    patternLinks: links.patternId ? [{ patternId: links.patternId, ifSupported: 'supports' }] : [],
    pathIds: links.pathId ? [links.pathId] : [],
    questionIds: links.questionId ? [links.questionId] : [],
  });
  const x = useAtlas.getState().data.experiments[id];
  toast(`${experimentCode(x.code)} added as a proposed experiment.`, { tone: 'success' });
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
  toast(`${pathCode(path.code)} is now your direction. A draft plan is ready to edit.`, { tone: 'success' });
}
