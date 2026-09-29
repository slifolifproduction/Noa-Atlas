import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { claimStatus } from '../domain/claims';
import { findLoops } from '../domain/loops';
import { patternStats, pendingSuggestions } from '../domain/selectors';
import type { SourceRef } from '../domain/types';
import { analyzeEntryLocally, detectDecisionPatternsLocally, draftNavigationPlanLocally, evaluateExperimentLocally } from './localAnalysis';

const data = createSeedData('2026-09-28');

const exists = (ref: SourceRef) =>
  Boolean(
    ref.kind === 'entry'
      ? data.entries[ref.id]
      : ref.kind === 'decision'
        ? data.decisions[ref.id]
        : ref.kind === 'experiment'
          ? data.experiments[ref.id]
          : data.occurrences[ref.id],
  );

describe('seed data', () => {
  it('references only records that exist', () => {
    for (const e of Object.values(data.edges)) for (const end of [e.source, e.target]) expect(data.nodes[end], `link ${e.id} → ${end}`).toBeDefined();
    for (const entry of Object.values(data.entries)) for (const n of entry.nodeIds) expect(data.nodes[n], `${entry.id} → ${n}`).toBeDefined();
    for (const d of Object.values(data.decisions)) {
      for (const n of d.nodeIds) expect(data.nodes[n], `${d.id} → ${n}`).toBeDefined();
      for (const c of d.claimIds) expect(data.claims[c], `${d.id} → ${c}`).toBeDefined();
    }
    for (const c of Object.values(data.claims)) {
      for (const n of [c.from, c.to, ...c.with]) expect(data.nodes[n], `${c.id} → ${n}`).toBeDefined();
      for (const ev of c.evidence) expect(exists(ev.source), `${c.id} evidence ${ev.source.kind}:${ev.source.id}`).toBe(true);
      for (const r of c.rivalIds) expect(data.claims[r], `${c.id} rival ${r}`).toBeDefined();
    }
    for (const p of Object.values(data.patterns)) {
      for (const n of p.nodeIds) expect(data.nodes[n], `${p.id} → ${n}`).toBeDefined();
      for (const c of p.explainedBy) expect(data.claims[c], `${p.id} explained by ${c}`).toBeDefined();
      for (const ev of p.evidence) expect(exists(ev.source), `${p.id} evidence ${ev.source.id}`).toBe(true);
    }
    for (const o of Object.values(data.occurrences)) {
      if (o.source) expect(exists(o.source), `${o.id} source`).toBe(true);
      for (const n of [...o.about, ...(o.instanceOf ? [o.instanceOf] : [])]) expect(data.nodes[n], `${o.id} → ${n}`).toBeDefined();
    }
    for (const n of Object.values(data.nodes)) {
      if (n.claimId) expect(data.claims[n.claimId], `${n.id} claim`).toBeDefined();
      if (n.investigation?.anchorId) expect(data.nodes[n.investigation.anchorId], `${n.id} anchor`).toBeDefined();
      for (const c of n.investigation?.claimIds ?? []) expect(data.claims[c], `${n.id} investigation → ${c}`).toBeDefined();
    }
    for (const x of Object.values(data.experiments)) if (x.claimId) expect(data.claims[x.claimId], `${x.id} claim`).toBeDefined();
    for (const p of Object.values(data.paths)) for (const c of p.assumptionIds) expect(data.claims[c], `${p.id} relies on ${c}`).toBeDefined();
  });

  it('keeps possibility out of the evidence', () => {
    for (const c of Object.values(data.claims)) {
      for (const ev of c.evidence) {
        if (ev.source.kind === 'occurrence') expect(data.occurrences[ev.source.id].mode).toBe('actual');
      }
    }
  });

  it('names only loops the claims actually close', () => {
    const ids = new Set(findLoops(data).map((l) => l.id));
    for (const id of Object.keys(data.loopNames)) expect(ids.has(id), id).toBe(true);
  });

  it('derives pattern regularity from when instances fell', () => {
    const stats = patternStats(data, data.patterns.pat_07, '2026-09-28');
    expect(stats.regularity).toBe('recurring');
    expect(stats.instances).toBe(8);
    expect(stats.counter).toBe(3);
    expect(stats.firstObserved).toBe('2026-03-02');
    expect(Object.keys(stats)).not.toContain('confidence');
  });

  it('shows a spread of claim statuses, none of them numeric', () => {
    const statuses = new Set(Object.values(data.claims).map((c) => claimStatus(data, c)));
    for (const s of ['proposed', 'plausible', 'supported', 'tested', 'weakened'] as const) expect(statuses.has(s), s).toBe(true);
  });

  it('keeps a small, recent analysis inbox', () => {
    const pending = pendingSuggestions(data);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.length).toBeLessThan(12);
    expect(pending.every((p) => p.entry.date >= '2026-09-10')).toBe(true);
    expect(pending.some((p) => p.suggestion.type === 'attribution')).toBe(true);
  });
});

describe('entry analysis', () => {
  it('explains every observation and suggestion', () => {
    const a = analyzeEntryLocally(data.entries.ent_01, data);
    expect(a.observations.length).toBeGreaterThan(0);
    for (const o of a.observations) expect(o.basis.length).toBeGreaterThan(0);
    for (const s of a.suggestions) expect(s.reason.length).toBeGreaterThan(0);
    const ev = a.suggestions.find((s) => s.type === 'pattern_evidence' && s.patternId === 'pat_07');
    // Already counted as an instance, so it is not re-proposed as pending.
    expect(ev?.state).toBe('accepted');
  });

  it('reads happenings for the timeline, and finds counter-cases', () => {
    const entry = { ...data.entries.ent_28, id: 'ent_new', analysis: undefined };
    const a = analyzeEntryLocally(entry, data);
    expect(a.suggestions.some((s) => s.type === 'occurrence' && s.state === 'pending')).toBe(true);
    const ev = a.suggestions.find((s) => s.type === 'pattern_evidence' && s.patternId === 'pat_07');
    expect(ev?.type === 'pattern_evidence' && ev.stance).toBe('counters');
    expect(ev?.state).toBe('pending');
  });

  it('treats a cause named in a note as the person’s hypothesis, not evidence', () => {
    const entry = { ...data.entries.ent_28, id: 'ent_new', analysis: undefined };
    const a = analyzeEntryLocally(entry, data);
    const attribution = a.suggestions.find((s) => s.type === 'attribution');
    expect(attribution).toBeDefined();
    expect(attribution && 'stance' in attribution).toBe(false);
  });
});

describe('decision patterns', () => {
  it('detects the immediate-opportunity pattern with counter-cases and no score', () => {
    const [first] = detectDecisionPatternsLocally(data);
    expect(first.signature).toBe('decision:immediate-over-long-term');
    expect(first.supporting.length).toBe(5);
    expect(first.counter.length).toBe(2);
    expect(first.steps.length).toBeGreaterThanOrEqual(2);
    expect(first.explanation?.trim().endsWith('?')).toBe(true);
    expect(Object.keys(first)).not.toContain('confidence');
  });
});

describe('tests of claims', () => {
  it('turns a result that went as predicted into intervention evidence on the claim', () => {
    const exp = data.experiments.exp_02;
    const proposal = evaluateExperimentLocally(exp, { outcome: 'supports', summary: 'Held the cap.', learning: '', recordedAt: '' }, data);
    expect(proposal.changes).toHaveLength(1);
    expect(proposal.changes[0].claimId).toBe(exp.claimId);
    expect(proposal.changes[0].before).toBe('supported');
    expect(proposal.changes[0].after).toBe('tested');
  });

  it('lets a failed test weaken the claim', () => {
    const exp = data.experiments.exp_02;
    const proposal = evaluateExperimentLocally(exp, { outcome: 'contradicts', summary: 'Output did not change.', learning: '', recordedAt: '' }, data);
    expect(proposal.changes[0].stance).toBe('counters');
    expect(proposal.changes[0].after).toBe('weakened');
  });

  it('changes nothing on an inconclusive result', () => {
    const proposal = evaluateExperimentLocally(data.experiments.exp_02, { outcome: 'inconclusive', summary: '', learning: '', recordedAt: '' }, data);
    expect(proposal.changes).toHaveLength(0);
  });

  it('drafts a navigation plan from a path', () => {
    const plan = draftNavigationPlanLocally(data.paths.path_a, data, '2026-09-28');
    expect(plan.pathId).toBe('path_a');
    expect(plan.targets.length).toBeGreaterThan(0);
    expect(plan.actions.every((a) => a.week === '2026-09-28')).toBe(true);
  });
});
