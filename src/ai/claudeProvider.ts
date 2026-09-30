/**
 * Claude-backed provider.
 *
 * The browser never holds an API key. It posts compact, structured context to
 * a small proxy (server/claude-proxy.ts) that calls the Messages API with the
 * task's Zod schema as the structured output format. Responses are validated
 * again here, then checked for referential integrity: any id the model returns
 * that does not exist in the atlas is dropped rather than trusted.
 */
import { claimSentence, claimStatus } from '../domain/claims';
import { decisionCode, entryCode, mapElements, patternCode, patternLive, patternTitle } from '../domain/selectors';
import type { AnalysisSuggestion, AtlasData, Decision, EntryAnalysis, NavigationPlan } from '../domain/types';
import { addDays, todayISO, weekStart } from '../lib/dates';
import { createId } from '../lib/ids';
import { evaluateExperimentLocally } from './localAnalysis';
import { accountCall } from './account';
import { AnalysisError } from './errors';
import { TASKS, type TaskName, type TaskOutput } from './schemas';
import type { AnalysisProvider, PatternCandidate } from './types';
import { t, getLang } from '../i18n';

function elementCatalogue(data: AtlasData) {
  return mapElements(data).map((n) => ({ id: n.id, label: n.label, kind: n.kind, area: n.area }));
}

function patternCatalogue(data: AtlasData) {
  return Object.values(data.patterns)
    .filter(patternLive)
    .map((p) => ({ id: p.id, code: patternCode(p.code), title: patternTitle(p), observation: p.observation, cues: p.cues }));
}

function decisionRecord(d: Decision) {
  return {
    id: d.id,
    code: decisionCode(d.seq),
    date: d.date,
    title: d.title,
    context: d.context,
    options: d.options.map((o) => ({ label: o.label, rationale: o.rationale, expected: o.expected ?? null, chosen: o.id === d.chosenOptionId })),
    optimizing_for: d.optimizingFor,
    expected: d.expectedOutcome,
    actual: d.actualOutcome ?? null,
    outcome_rating: d.outcomeRating ?? null,
    learned: d.learned ?? null,
  };
}

/** Runs one task and returns its checked output. */
type Call = <T extends TaskName>(task: T, input: unknown) => Promise<TaskOutput<T>>;

/** Claude through a proxy you run (server/claude-proxy.ts), with the API key on the server. */
export function createClaudeProvider(endpoint: string): AnalysisProvider {
  const base = endpoint.replace(/\/+$/, '');

  async function call<T extends TaskName>(task: T, input: unknown): Promise<TaskOutput<T>> {
    let res: Response;
    try {
      res = await fetch(`${base}/${task}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ input, language: getLang() }),
      });
    } catch {
      throw new AnalysisError(t('Could not reach the analysis proxy at {url}.', { url: base }), task);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new AnalysisError(`${t('Analysis proxy returned {status}', { status: res.status })}${detail ? `: ${detail.slice(0, 200)}` : ''}`, task);
    }
    const json = (await res.json()) as { output?: unknown };
    const parsed = TASKS[task].schema.safeParse(json.output);
    if (!parsed.success) throw new AnalysisError(t('The model response did not match the expected structure.'), task);
    return parsed.data as TaskOutput<T>;
  }

  return withCall(call, 'claude', t('Claude'));
}

/** Claude on the viewer's own claude.ai account (inside claude.ai only; see ai/account). */
export function createAccountProvider(): AnalysisProvider {
  return withCall(accountCall, 'account', t('Claude (your account)'));
}

/** The same reading of every task's output, whichever way Claude was reached. */
function withCall(call: Call, id: AnalysisProvider['id'], label: string): AnalysisProvider {
  return {
    id,
    label,

    async analyzeEntry(entry, data): Promise<EntryAnalysis> {
      const out = await call('entry_analysis', {
        entry: {
          id: entry.id,
          code: entryCode(entry.seq),
          date: entry.date,
          kind: entry.kind,
          title: entry.title,
          content: entry.content,
          context: entry.context ?? null,
        },
        elements: elementCatalogue(data),
        patterns: patternCatalogue(data),
      });
      const suggestions: AnalysisSuggestion[] = [];
      for (const l of out.node_links) {
        if (!data.nodes[l.node_id]) continue;
        suggestions.push({
          id: createId('sug'),
          type: 'link_node',
          nodeId: l.node_id,
          reason: l.reason,
          state: entry.nodeIds.includes(l.node_id) ? 'accepted' : 'pending',
        });
      }
      for (const p of out.pattern_evidence) {
        const pattern = data.patterns[p.pattern_id];
        if (!pattern) continue;
        const already = pattern.evidence.some((e) => e.source.kind === 'entry' && e.source.id === entry.id);
        suggestions.push({
          id: createId('sug'),
          type: 'pattern_evidence',
          patternId: p.pattern_id,
          stance: p.stance,
          excerpt: p.excerpt,
          matched: p.matched,
          reason: p.reason,
          state: already ? 'accepted' : 'pending',
        });
      }
      for (const a of out.areas) {
        suggestions.push({ id: createId('sug'), type: 'area', area: a.area, reason: a.reason, state: entry.areas.includes(a.area) ? 'accepted' : 'pending' });
      }
      for (const o of out.occurrences.slice(0, 3)) {
        const instanceOf = o.instance_of && data.nodes[o.instance_of]?.kind === 'behaviour' ? o.instance_of : undefined;
        suggestions.push({
          id: createId('sug'),
          type: 'occurrence',
          kind: o.kind,
          label: o.label.slice(0, 90),
          about: o.about.filter((id) => data.nodes[id]),
          instanceOf,
          excerpt: o.excerpt,
          reason: t('Reported in this note.'),
          state: 'pending',
        });
      }
      for (const a of out.attributions.slice(0, 2)) {
        suggestions.push({ id: createId('sug'), type: 'attribution', excerpt: a.excerpt, reason: a.reason, state: 'pending' });
      }
      for (const c of out.changes.slice(0, 4)) {
        if (!data.nodes[c.node_id]) continue;
        suggestions.push({ id: createId('sug'), type: 'change', factor: c.node_id, reads: c.reads, excerpt: c.excerpt, reason: c.reason, state: 'pending' });
      }
      for (const e of out.expectations.slice(0, 2)) {
        if (!data.nodes[e.node_id]) continue;
        suggestions.push({
          id: createId('sug'),
          type: 'expectation',
          factor: e.node_id,
          reads: e.reads,
          within: Math.max(1, Math.min(365, Math.round(e.within_days))),
          excerpt: e.excerpt,
          reason: e.reason,
          state: 'pending',
        });
      }
      return {
        generatedAt: new Date().toISOString(),
        provider: 'Claude',
        observations: out.observations.map((o) => ({ id: createId('obs'), statement: o.statement, basis: o.basis })),
        suggestions,
      };
    },

    async detectDecisionPatterns(data): Promise<PatternCandidate[]> {
      const existing = Object.values(data.patterns)
        .filter((p) => p.signature)
        .map((p) => ({ signature: p.signature, id: p.id }));
      const out = await call('decision_patterns', { decisions: Object.values(data.decisions).map(decisionRecord), existing });
      const bySig = new Map(existing.map((e) => [e.signature!, e.id]));
      return out.candidates
        .map((c) => {
          const supporting = c.supporting.filter((s) => data.decisions[s.decision_id]).map((s) => ({ decisionId: s.decision_id, excerpt: s.excerpt }));
          const counter = c.counter.filter((s) => data.decisions[s.decision_id]).map((s) => ({ decisionId: s.decision_id, excerpt: s.excerpt }));
          return {
            signature: c.signature,
            kind: 'decision' as const,
            title: c.title,
            steps: c.steps.slice(0, 4),
            statement: c.statement,
            observation: c.observation,
            triggers: c.triggers,
            behaviors: c.behaviors,
            consequences: c.consequences,
            supporting,
            counter,
            explanation: c.explanation || undefined,
            counterStatement: c.counter_statement || undefined,
            implication: c.implication || undefined,
            areas: c.areas,
            existingPatternId: bySig.get(c.signature),
          };
        })
        .filter((c) => c.supporting.length >= 3);
    },

    async proposeExperiments(claim, data) {
      const out = await call('experiment_proposals', {
        claim: {
          statement: claimSentence(data, claim),
          status: claimStatus(data, claim),
          mechanism: claim.via ?? null,
          evidence: claim.evidence.map((e) => ({ stance: e.stance, kind: e.kind ?? 'instance', excerpt: e.excerpt })),
        },
      });
      return out.experiments.map((x) => ({
        title: x.title,
        hypothesis: x.hypothesis,
        design: x.design,
        durationDays: Math.max(7, Math.round(x.duration_days) || 30),
        prediction: x.prediction,
        criteria: x.criteria,
        measures: x.measures.map((m) => ({ label: m.label, baseline: m.baseline || undefined, target: m.target || undefined })),
      }));
    },

    async evaluateExperiment(experiment, result, data) {
      // Status changes stay deterministic; Claude only contributes the narrative.
      const proposal = evaluateExperimentLocally(experiment, result, data);
      const claim = experiment.claimId ? data.claims[experiment.claimId] : undefined;
      const out = await call('experiment_review', {
        experiment: { title: experiment.title, hypothesis: experiment.hypothesis, prediction: experiment.prediction ?? null, measures: experiment.measures },
        result,
        claim: claim ? claimSentence(data, claim) : null,
      });
      return { ...proposal, learningNote: out.learning_note || proposal.learningNote };
    },

    async draftNavigationPlan(path, data): Promise<NavigationPlan> {
      const out = await call('navigation_plan', { path, current_state: data.currentState });
      const today = todayISO();
      const targets = out.targets.map((t) => ({ id: createId('tgt'), title: t.title, due: addDays(today, Math.max(7, Math.round(t.days))), done: false }));
      const actions = out.actions.map((a) => ({
        id: createId('act'),
        title: a.title,
        targetId: targets[a.target_index]?.id,
        week: weekStart(today),
        status: 'todo' as const,
      }));
      const experiment = path.experimentIds.map((id) => data.experiments[id]).find((x) => x && x.status !== 'completed' && x.status !== 'abandoned');
      return {
        pathId: path.id,
        committedAt: today,
        position: data.currentState.position,
        objective: { title: out.objective.title, description: out.objective.description, targetDate: addDays(today, Math.round(out.objective.months * 30.4)) },
        experimentId: experiment?.id,
        milestone: { title: out.milestone.title, due: addDays(today, Math.round(out.milestone.weeks * 7)) },
        targets,
        actions,
        currentActionId: actions[0]?.id,
      };
    },
  };
}
