import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { computeConfidence } from '../domain/confidence';
import { patternStats, pendingSuggestions } from '../domain/selectors';
import {
  analyzeEntryLocally,
  detectDecisionPatternsLocally,
  draftNavigationPlanLocally,
  evaluateExperimentLocally,
} from './localAnalysis';

const data = createSeedData('2026-09-28');

describe('confidence', () => {
  it('starts at 50% and moves with evidence', () => {
    expect(computeConfidence([])).toBe(0.5);
    expect(computeConfidence([{ stance: 'supports', weight: 1 }])).toBeCloseTo(3 / 5);
    expect(computeConfidence([{ stance: 'counters', weight: 1 }])).toBeCloseTo(2 / 5);
  });
});

describe('seed data', () => {
  it('references only records that exist', () => {
    const ids = new Set([...Object.keys(data.nodes), ...Object.keys(data.patterns)]);
    for (const e of Object.values(data.edges)) {
      for (const end of [e.source, e.target]) {
        expect(end.startsWith('domain:') || ids.has(end), `edge ${e.id} → ${end}`).toBe(true);
      }
    }
    for (const entry of Object.values(data.entries)) for (const n of entry.nodeIds) expect(data.nodes[n], `${entry.id} → ${n}`).toBeDefined();
    for (const d of Object.values(data.decisions)) for (const n of d.nodeIds) expect(data.nodes[n], `${d.id} → ${n}`).toBeDefined();
    for (const p of Object.values(data.patterns)) {
      for (const n of p.nodeIds) expect(data.nodes[n], `${p.id} → ${n}`).toBeDefined();
      for (const ev of p.evidence) {
        const coll = ev.source.kind === 'entry' ? data.entries : ev.source.kind === 'decision' ? data.decisions : data.experiments;
        expect(coll[ev.source.id], `${p.id} evidence ${ev.source.id}`).toBeDefined();
      }
    }
    for (const n of Object.values(data.nodes)) {
      if (n.source) {
        const coll = n.source.kind === 'entry' ? data.entries : data.decisions;
        expect(coll[n.source.id], `${n.id} source`).toBeDefined();
      }
    }
  });

  it('derives pattern statistics from evidence', () => {
    const stats = patternStats(data, data.patterns.pat_07);
    expect(stats.supportCount).toBe(9);
    expect(stats.counterCount).toBe(2);
    expect(Math.round(stats.confidence * 100)).toBe(73);
    expect(stats.firstObserved).toBe('2026-03-02');
    expect(stats.history.length).toBe(11);
  });

  it('keeps a small, recent analysis inbox', () => {
    const pending = pendingSuggestions(data);
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.length).toBeLessThan(12);
    expect(pending.every((p) => p.entry.date >= '2026-09-10')).toBe(true);
    const counter = pending.find((p) => p.entry.id === 'ent_28' && p.suggestion.type === 'pattern_evidence');
    expect(counter?.suggestion.type === 'pattern_evidence' && counter.suggestion.stance).toBe('counters');
  });
});

describe('entry analysis', () => {
  it('explains every observation and suggestion', () => {
    const a = analyzeEntryLocally(data.entries.ent_01, data);
    expect(a.observations.length).toBeGreaterThan(0);
    for (const o of a.observations) expect(o.basis.length).toBeGreaterThan(0);
    const ev = a.suggestions.find((s) => s.type === 'pattern_evidence' && s.patternId === 'pat_07');
    expect(ev?.type === 'pattern_evidence' && ev.matched).toContain('said yes');
    // Already counted as evidence, so it is not re-proposed as pending.
    expect(ev?.state).toBe('accepted');
  });

  it('finds counter-evidence', () => {
    const entry = { ...data.entries.ent_28, id: 'ent_new', analysis: undefined };
    const a = analyzeEntryLocally(entry, data);
    const ev = a.suggestions.find((s) => s.type === 'pattern_evidence' && s.patternId === 'pat_07');
    expect(ev?.type === 'pattern_evidence' && ev.stance).toBe('counters');
    expect(ev?.state).toBe('pending');
  });
});

describe('decision patterns', () => {
  it('detects the immediate-opportunity pattern with counter-evidence', () => {
    const [first] = detectDecisionPatternsLocally(data);
    expect(first.signature).toBe('decision:immediate-over-long-term');
    expect(first.supporting.length).toBe(5);
    expect(first.counter.length).toBe(2);
    const confidence = computeConfidence([
      ...first.supporting.map(() => ({ stance: 'supports' as const, weight: 1 })),
      ...first.counter.map(() => ({ stance: 'counters' as const, weight: 1 })),
    ]);
    expect(Math.round(confidence * 100)).toBe(64);
  });
});

describe('experiments', () => {
  it('turns a supported result into weighted evidence', () => {
    const exp = data.experiments.exp_02;
    const proposal = evaluateExperimentLocally(exp, { outcome: 'supports', summary: 'Held the cap.', learning: '', recordedAt: '' }, data);
    expect(proposal.changes).toHaveLength(1);
    expect(proposal.changes[0].weight).toBe(2);
    expect(proposal.changes[0].after).toBeGreaterThan(proposal.changes[0].before);
  });

  it('does not move confidence on an inconclusive result', () => {
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
