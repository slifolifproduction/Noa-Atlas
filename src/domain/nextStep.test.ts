import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import { nextStep } from './nextStep';
import { pendingSuggestions } from './selectors';

const TODAY = '2026-09-28';

describe('next step', () => {
  it('starts an empty atlas with a first note', () => {
    const step = nextStep(createEmptyData('Test'), TODAY);
    expect(step.key).toBe('first-note');
    expect(step.action).toEqual({ kind: 'capture', capture: 'journal' });
  });

  it('asks for pending suggestions to be reviewed before anything else routine', () => {
    const data = createSeedData(TODAY);
    expect(pendingSuggestions(data).length).toBeGreaterThan(0);
    expect(nextStep(data, TODAY).key).toMatch(/^review-/);
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
    const step = nextStep(data, TODAY);
    expect(step.action.kind).toBe('done');
    expect(step.also?.action).toEqual({ kind: 'route', route: 'navigation' });
  });

  it('once this week’s steps are done, asks for the check that would tell two readings of what you care about apart', () => {
    const data = createSeedData(TODAY);
    for (const e of Object.values(data.entries)) for (const s of e.analysis?.suggestions ?? []) s.state = 'dismissed';
    for (const a of data.navigation!.actions) a.status = 'done';
    const step = nextStep(data, TODAY);
    expect(step.key.startsWith('inquiry:')).toBe(true);
    expect(step.also?.action.kind).toBe('decline');
  });

  it('asks for a note after a quiet week', () => {
    const data = createSeedData(TODAY);
    for (const e of Object.values(data.entries)) for (const s of e.analysis?.suggestions ?? []) s.state = 'dismissed';
    // (Experiments would have finished by then, and those come first.)
    for (const x of Object.values(data.experiments)) if (x.status === 'running') x.status = 'completed';
    expect(nextStep(data, '2026-11-20').key).toBe('weekly-note');
  });
});
