import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import { nextStep } from './nextStep';

const TODAY = '2026-09-28';

describe('next step', () => {
  it('starts an empty atlas with a first note', () => {
    const step = nextStep(createEmptyData('Test'), TODAY);
    expect(step.key).toBe('first-note');
    expect(step.action).toEqual({ kind: 'capture', capture: 'journal' });
  });

  it('asks one thing only you can say about the latest note, answered in place, before anything routine', () => {
    const data = createSeedData(TODAY);
    for (const e of Object.values(data.entries)) for (const s of e.analysis?.suggestions ?? []) s.state = 'dismissed';
    const latest = Object.values(data.entries).sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq)[0];
    latest.analysis!.suggestions.push({
      id: 'sug_hunch',
      type: 'attribution',
      excerpt: 'Energy dropped because of the late deadline sprint.',
      reason: '',
      claim: { from: 'n_afternoons', to: 'n_energy', effect: 'lowers' },
      state: 'pending',
    });
    const step = nextStep(data, TODAY);
    expect(step.key).toBe('offer:sug_hunch');
    expect(step.action).toEqual({ kind: 'offer', entryId: latest.id, suggestionId: 'sug_hunch', take: true });
    expect(step.also?.action).toEqual({ kind: 'offer', entryId: latest.id, suggestionId: 'sug_hunch', take: false });
  });

  it('never asks to review what was connected on its own, or what is not yours to say', () => {
    const data = createSeedData(TODAY);
    // Everything still waiting is a link, an area, a happening or another time something repeated.
    for (const e of Object.values(data.entries))
      for (const s of e.analysis?.suggestions ?? []) s.state = s.type === 'attribution' || s.type === 'pattern_evidence' ? 'dismissed' : 'pending';
    expect(nextStep(data, TODAY).key).not.toMatch(/^(offer|review)/);
  });

  it('asks how a decision turned out once it has had time, with one tap, and not again soon after "not now"', () => {
    const data = createSeedData(TODAY);
    for (const e of Object.values(data.entries)) for (const s of e.analysis?.suggestions ?? []) s.state = 'dismissed';
    const open = Object.values(data.decisions).filter((d) => !d.outcomeRating);
    for (const d of open) d.date = '2026-09-01';
    const step = nextStep(data, TODAY);
    expect(step.key).toMatch(/^outcome:/);
    expect(step.choices?.map((c) => c.action)).toEqual(
      (['better', 'as_expected', 'mixed', 'worse'] as const).map((rating) => ({ kind: 'outcome', decisionId: step.key.slice(8), rating })),
    );
    for (const d of open) (data.inquiry ??= { declined: {} }).declined[`outcome:${d.id}`] = TODAY;
    expect(nextStep(data, TODAY).key).not.toMatch(/^outcome:/);
  });

  it('puts a finished experiment first', () => {
    const data = createSeedData(TODAY);
    const running = Object.values(data.experiments).find((x) => x.status === 'running')!;
    running.startDate = '2026-01-01';
    const step = nextStep(data, TODAY);
    expect(step.key).toBe(`result:${running.id}`);
    expect(step.action).toEqual({ kind: 'open', ref: { kind: 'experiment', id: running.id } });
  });

  it('falls through to this week’s action once everything is reviewed and recent', () => {
    const data = createSeedData(TODAY);
    for (const e of Object.values(data.entries)) for (const s of e.analysis?.suggestions ?? []) s.state = 'dismissed';
    for (const d of Object.values(data.decisions)) d.outcomeRating ??= 'as_expected';
    const step = nextStep(data, TODAY);
    expect(step.action.kind).toBe('done');
    expect(step.also?.action).toEqual({ kind: 'route', route: 'navigation' });
  });

  it('once this week’s steps are done, asks for the check that would tell two readings of what you care about apart', () => {
    const data = createSeedData(TODAY);
    for (const e of Object.values(data.entries)) for (const s of e.analysis?.suggestions ?? []) s.state = 'dismissed';
    for (const d of Object.values(data.decisions)) d.outcomeRating ??= 'as_expected';
    for (const a of data.navigation!.actions) a.status = 'done';
    const step = nextStep(data, TODAY);
    expect(step.key.startsWith('inquiry:')).toBe(true);
    expect(step.also?.action.kind).toBe('decline');
  });

  it('asks for a note after a quiet week', () => {
    const data = createSeedData(TODAY);
    for (const e of Object.values(data.entries)) for (const s of e.analysis?.suggestions ?? []) s.state = 'dismissed';
    for (const d of Object.values(data.decisions)) d.outcomeRating ??= 'as_expected';
    // (Experiments would have finished by then, and those come first.)
    for (const x of Object.values(data.experiments)) if (x.status === 'running') x.status = 'completed';
    expect(nextStep(data, '2026-11-20').key).toBe('weekly-note');
  });
});
