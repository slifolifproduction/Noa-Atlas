/**
 * Expectations: predictions written down before their window, checked
 * against what is recorded in it.
 *
 * An expectation is a happening in the "expected" mode, so it sits in the
 * possibility layer and can never be evidence of what happened. When its
 * window has passed, it is read against the factor's recorded states:
 *
 *   held        the factor went the expected way
 *   failed      it was recorded, and did not go that way
 *   unobserved  nothing was recorded in the window: not a failure
 *   open        the window is still running and nothing matched yet
 *
 * The person's own verdict, when given, stands over what was read.
 *
 * What a verdict means for the claims behind it depends on how many there
 * are. One claim: a direct check of it, which strengthens or weakens it. A
 * chain of claims: the chain was checked together; a failure says one of
 * them did not hold, not which one (the weakest is the one to test).
 * Predictions written after their window began are shown, never counted.
 */
import { cached, factorStates, leanOf, oppositeLean, statesIn, stateBefore, type FactorState, type Lean } from './factors';
import { dateOf, todayISO } from '../lib/dates';
import type { AtlasData, Claim, Experiment, FactorReading, ID, ISODate, Occurrence } from './types';

export type ExpectationVerdict = 'held' | 'failed' | 'unobserved' | 'open';

export interface ExpectationView {
  occurrence: Occurrence;
  factor: ID;
  reads: FactorReading;
  lean: Lean;
  from: ISODate;
  until: ISODate;
  basis: Claim[];
  /** Written down on or before the start of its window. */
  writtenBefore: boolean;
  verdict: ExpectationVerdict;
  /** Who gave the verdict: read from the record, or the person. */
  by: 'record' | 'you';
  /** The recorded state that decided it. */
  shownBy?: FactorState;
}

export const isExpectation = (o: Occurrence) => o.mode === 'expected' && Boolean(o.changes?.length);

function view(data: AtlasData, o: Occurrence, today: ISODate): ExpectationView | undefined {
  const change = o.changes?.[0];
  if (!change || !data.nodes[change.factor]) return undefined;
  const lean = leanOf(change.reads);
  const from = o.date;
  const until = o.until ?? o.date;
  const basis = (o.expectation?.basis ?? []).map((id) => data.claims[id]).filter((c): c is Claim => Boolean(c));
  const base = { occurrence: o, factor: change.factor, reads: change.reads, lean, from, until, basis, writtenBefore: dateOf(o.createdAt) <= from };
  const mine = o.expectation?.verdict;
  if (mine) return { ...base, verdict: mine.outcome, by: 'you' };
  const states = statesIn(data, change.factor, from, until).filter((s) => !(s.basis === 'lifespan' && s.reads === 'usual' && lean !== 'usual'));
  const match = states.find((s) => s.lean === lean);
  if (match) return { ...base, verdict: 'held', by: 'record', shownBy: match };
  if (today <= until) return { ...base, verdict: 'open', by: 'record', shownBy: states.find((s) => s.lean === oppositeLean(lean)) };
  const other = states.find((s) => s.lean !== lean);
  return other ? { ...base, verdict: 'failed', by: 'record', shownBy: other } : { ...base, verdict: 'unobserved', by: 'record' };
}

/** Every expectation, newest first. */
export function expectations(data: AtlasData, today: ISODate = todayISO()): ExpectationView[] {
  return cached(data, `expectations:${today}`, () =>
    Object.values(data.occurrences)
      .filter(isExpectation)
      .map((o) => view(data, o, today))
      .filter((v): v is ExpectationView => Boolean(v))
      .sort((a, b) => b.from.localeCompare(a.from)),
  );
}

export const expectationOf = (data: AtlasData, occurrenceId: ID) => expectations(data).find((e) => e.occurrence.id === occurrenceId);

/** Expectations that rest on a claim: alone, or as part of a chain. */
export function expectationsFor(data: AtlasData, claimId: ID): { direct: ExpectationView[]; chains: ExpectationView[] } {
  const all = expectations(data).filter((e) => e.basis.some((c) => c.id === claimId));
  return { direct: all.filter((e) => e.basis.length === 1), chains: all.filter((e) => e.basis.length > 1) };
}

/**
 * Direct predictions from one claim, written before their window, that held
 * or failed. These count. A test's own prediction is not counted again: the
 * test's result already is.
 */
export function predictionCounts(data: AtlasData, claimId: ID): { held: number; failed: number } {
  const { direct } = expectationsFor(data, claimId);
  const counted = direct.filter((e) => e.writtenBefore && e.occurrence.source?.kind !== 'experiment');
  return { held: counted.filter((e) => e.verdict === 'held').length, failed: counted.filter((e) => e.verdict === 'failed').length };
}

/** Expectations belonging to a test or a decision. */
export function expectationsOfSource(data: AtlasData, kind: 'experiment' | 'decision', id: ID): ExpectationView[] {
  return expectations(data).filter((e) => e.occurrence.source?.kind === kind && e.occurrence.source.id === id);
}

/* ---------------- tests ---------------- */

/**
 * Whether a test's prediction was written down before it began. Only then is
 * its result a test; otherwise it is one more time it happened. A test with
 * no checkable prediction counts if its prediction in words was there when
 * the test was set up, before its start.
 */
export function predictionLocked(data: AtlasData, experimentId: ID): boolean {
  const x = data.experiments[experimentId];
  if (!x?.startDate) return false;
  const own = Object.values(data.occurrences).filter((o) => isExpectation(o) && o.source?.kind === 'experiment' && o.source.id === experimentId);
  if (own.length) return own.some((o) => dateOf(o.createdAt) <= x.startDate!);
  return Boolean(x.prediction?.trim()) && dateOf(x.createdAt) <= x.startDate;
}

export interface TestCheck {
  /** The prediction, as a checkable expectation. */
  expectation?: ExpectationView;
  /** The prediction was written down before the test began. */
  lockedBefore?: boolean;
  /** The outcome was at the other extreme just before the test began: some of the change may come anyway. */
  fromExtreme?: FactorState;
  /** What was recorded in the test's window for each measure linked to an element. */
  window: { measureId: ID; factor: ID; states: FactorState[] }[];
}

export function testCheck(data: AtlasData, x: Experiment, today: ISODate = todayISO()): TestCheck {
  const expectation = expectationsOfSource(data, 'experiment', x.id)[0];
  const start = x.startDate;
  const end = start ? (x.result ? dateOf(x.result.recordedAt) : today) : undefined;
  const lockedBefore = expectation && start ? dateOf(expectation.occurrence.createdAt) <= start : undefined;
  let fromExtreme: FactorState | undefined;
  if (expectation && start) {
    const before = stateBefore(data, expectation.factor, start, 28);
    if (before && before.lean === oppositeLean(expectation.lean)) fromExtreme = before;
  }
  const window =
    start && end
      ? x.measures
          .filter((m) => m.factor && data.nodes[m.factor])
          .map((m) => ({
            measureId: m.id,
            factor: m.factor!,
            states: statesIn(data, m.factor!, start, end).filter((s) => s.basis !== 'lifespan' || s.reads === 'up' || s.reads === 'down'),
          }))
      : [];
  return { expectation, lockedBefore, fromExtreme, window };
}

/** Readings of one factor, for listing next to an expectation. */
export const statesOf = (data: AtlasData, id: ID) => factorStates(data, id);
