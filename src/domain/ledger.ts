/**
 * The prediction ledger: what the model expects, written down before it can
 * be known, and what to make of it when it does not hold.
 *
 *   proposals  When you decide something, start a test, or ask what a change
 *              would do, the Atlas can say what its model expects to follow:
 *              which way, by when, resting on which reasons. These are
 *              proposals: nothing is kept until you keep it, and only what
 *              you keep before its window begins can count.
 *
 *   repairs    When an expectation fails, the model is wrong somewhere. The
 *              Atlas says where it most likely is (for a chain, its least
 *              sure step) and what could be wrong there: it holds only in
 *              some conditions, it takes longer, something else pushed the
 *              other way, something happened from outside, the record was
 *              too thin to show it, or it simply holds less than it seemed.
 *              Each repair is a question to look into, never applied.
 *
 *   surprises  What moved with nothing expecting it: an expectation that
 *              failed, or a recorded move of something you care about with
 *              every known reason pointing elsewhere.
 */
import { claimsInto, claimStatus } from './claims';
import { candidateCondition, caseRows, delaysSeen, lagRange, pushes } from './compare';
import { expectSentence, STATUS_META } from './constants';
import { expectations, type ExpectationView } from './expect';
import { outsideBefore, unexplainedMoves } from './explain';
import { observedIn, oppositeLean, stateBefore, type FactorState, type Lean } from './factors';
import { displayNode } from './selectors';
import { basisOf, whatIf, type IfYouChange } from './whatif';
import type { HistoryItem } from './history';
import type { AtlasData, Claim, ClaimStatus, Condition, Decision, Experiment, FactorReading, ID, ISODate } from './types';
import { addDays, daysBetween, todayISO } from '../lib/dates';
import { t } from '../i18n';

const name = (data: AtlasData, id: ID) => displayNode(data, id)?.label ?? t('(deleted)');

/* ---------------- proposals ---------------- */

export interface ProposedExpectation {
  key: string;
  factor: ID;
  reads: FactorReading;
  from: ISODate;
  until: ISODate;
  basis: ID[];
  label: string;
  weakest: ClaimStatus;
  ifYouChange: IfYouChange;
}

/** How a factor reads when it goes one way. */
export const readsFor = (data: AtlasData, id: ID, lean: Lean): FactorReading =>
  data.nodes[id]?.kind === 'behaviour' ? (lean === 'more' ? 'present' : 'absent') : lean === 'more' ? 'up' : 'down';

/**
 * What the model expects to follow if a factor went one way, starting on a
 * day: one proposal per element it reaches (directly, or one step further
 * along reasons at least seen a few times), with its window and its basis.
 * Where routes disagree, or only make something possible, nothing is
 * proposed: the model cannot say which way. What is already expected is
 * left out.
 */
export function proposeExpectations(data: AtlasData, factor: ID, change: 'more' | 'less', from: ISODate, exclude: ID[] = []): ProposedExpectation[] {
  const pending = expectations(data).filter((e) => e.verdict === 'open' && e.until >= from);
  const out: ProposedExpectation[] = [];
  for (const c of whatIf(data, factor, change, 2)) {
    if (c.lean === 'mixed' || c.lean === 'usual' || exclude.includes(c.id)) continue;
    if (c.routes.every((r) => r.gated)) continue;
    if (c.weakest === 'weakened' || (c.depth > 1 && STATUS_META[c.weakest].rank < STATUS_META.plausible.rank)) continue;
    const reads = readsFor(data, c.id, c.lean);
    if (pending.some((e) => e.factor === c.id && e.lean === c.lean)) continue;
    const until = addDays(from, Math.max(7, c.window[1]));
    out.push({
      key: `${factor}:${change}:${c.id}`,
      factor: c.id,
      reads,
      from,
      until,
      basis: basisOf(c),
      label: expectSentence(name(data, c.id), reads),
      weakest: c.weakest,
      ifYouChange: c.ifYouChange,
    });
  }
  return out;
}

/** The elements a decision is about that other things on the map depend on: what it could change. */
export function decisionLevers(data: AtlasData, d: Decision): ID[] {
  return d.nodeIds.filter((id) => data.nodes[id] && whatIf(data, id, 'more', 1).length > 0);
}

/**
 * What else should move during a test, if the model is right: everything
 * changing its cause would reach, apart from the outcome the test is about.
 * The direction of the change is read from the test's own expectation.
 */
export function testSideEffects(data: AtlasData, x: Experiment): ProposedExpectation[] {
  const claim = x.claimId ? data.claims[x.claimId] : undefined;
  if (!claim || x.result) return [];
  const own = expectations(data).find((e) => e.occurrence.source?.kind === 'experiment' && e.occurrence.source.id === x.id);
  if (!own) return [];
  // The cause went the way that pushes the outcome as expected.
  const cause: 'more' | 'less' = pushes(claim.effect, 'more') === own.lean ? 'more' : 'less';
  const today = todayISO();
  return proposeExpectations(data, claim.from, cause, x.startDate && x.startDate > today ? x.startDate : today, [claim.to]);
}

/* ---------------- repairs ---------------- */

export type RepairKind = 'scope' | 'timescale' | 'rival' | 'outside' | 'recording' | 'weaken';

export interface Repair {
  kind: RepairKind;
  text: string;
  claimId?: ID;
  /** Scope: the condition it may hold under. */
  condition?: Condition;
  /** Timescale: how many days it may need. */
  days?: number;
  /** Rival: the other reason pushing the other way. */
  otherClaimId?: ID;
  outside?: HistoryItem[];
}

/** The least sure step of a chain, where a failure most likely is. */
function leastSure(data: AtlasData, basis: Claim[]): Claim | undefined {
  return [...basis].sort((a, b) => STATUS_META[claimStatus(data, a)].rank - STATUS_META[claimStatus(data, b)].rank || a.evidence.length - b.evidence.length)[0];
}

/** Where a failed expectation most likely went wrong, and what could be wrong there. */
export function repairsFor(data: AtlasData, view: ExpectationView): { located?: Claim; chain: boolean; repairs: Repair[] } {
  if (view.verdict !== 'failed') return { chain: false, repairs: [] };
  const located = leastSure(data, view.basis);
  const at = view.shownBy?.date ?? view.until;
  const repairs: Repair[] = [];
  const factor = name(data, view.factor);

  if (located) {
    // It may hold only in some conditions: a factor that was one way every time it held, and the other way now.
    const held = caseRows(data, located)
      .filter((r) => r.verdict === 'fits')
      .map((r) => r.outcome.date);
    const cond = candidateCondition(data, located, held, [at]);
    if (cond)
      repairs.push({
        kind: 'scope',
        claimId: located.id,
        condition: { factor: cond.factor, reads: cond.reads },
        text: t('Every time it held, {f} was {state}; this time it was not. It may hold only then.', {
          f: name(data, cond.factor),
          state: cond.reads === 'high' ? t('high') : t('low'),
        }),
      });
    // It may take longer.
    const span = daysBetween(view.from, view.until);
    const seen = delaysSeen(data, located);
    const needs = Math.max(lagRange(located)[1], seen?.[1] ?? 0);
    if (needs > span)
      repairs.push({
        kind: 'timescale',
        claimId: located.id,
        days: needs,
        text: t('The window was {n} days; this can take up to {m}. It may not have shown yet.', { n: span, m: needs }),
      });
  }

  // Something else was pushing the other way.
  for (const c of claimsInto(data, view.factor)) {
    if (view.basis.some((b) => b.id === c.id) || claimStatus(data, c) === 'retired') continue;
    const s = stateBefore(data, c.from, at, lagRange(c)[1], undefined, true);
    if (s && s.lean !== 'usual' && pushes(c.effect, s.lean) === oppositeLean(view.lean)) {
      repairs.push({
        kind: 'rival',
        otherClaimId: c.id,
        text: t('{c} was pushing {f} the other way then.', { c: name(data, c.from), f: factor }),
      });
      if (repairs.filter((r) => r.kind === 'rival').length >= 2) break;
    }
  }

  // Something happened from outside.
  const outside = outsideBefore(data, [at], new Set([view.factor]));
  if (outside.length)
    repairs.push({
      kind: 'outside',
      outside,
      text: t('Something happened to you from outside then: {what}.', { what: outside.map((h) => h.label).join('; ') }),
    });

  // The record was too thin to show it.
  const seen = observedIn(data, view.factor, view.from, view.until);
  if (seen !== 'tracked')
    repairs.push({
      kind: 'recording',
      text:
        seen === 'silent'
          ? t('Almost nothing was written down in that window.')
          : t('{f} was barely recorded in that window: one reading can miss what happened.', { f: factor }),
    });

  if (located)
    repairs.push({
      kind: 'weaken',
      claimId: located.id,
      text: t('Or it simply holds less often than it seemed. The failure already counts against it.'),
    });
  return { located, chain: view.basis.length > 1, repairs };
}

/* ---------------- surprises ---------------- */

export interface Surprise {
  key: string;
  kind: 'failed' | 'unexplained';
  factor: ID;
  date: ISODate;
  expectation?: ExpectationView;
  state?: FactorState;
}

/** What moved lately with nothing expecting it. */
export function surprises(data: AtlasData, today: ISODate = todayISO(), days = 42): Surprise[] {
  const since = addDays(today, -days);
  const out: Surprise[] = [];
  for (const e of expectations(data, today))
    if (e.verdict === 'failed' && e.until >= since)
      out.push({ key: `failed:${e.occurrence.id}`, kind: 'failed', factor: e.factor, date: e.until, expectation: e });
  for (const n of Object.values(data.nodes)) {
    if (!n.concern || !n.adopted) continue;
    for (const s of unexplainedMoves(data, n.id)) {
      if (s.date < since || s.date > today) continue;
      out.push({ key: `move:${s.key}`, kind: 'unexplained', factor: n.id, date: s.date, state: s });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
