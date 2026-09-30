/**
 * Comparing episodes: what the record shows about a claim "A may contribute
 * to B", read from recorded factor states (never from mentions).
 *
 * Each time B's state was recorded, the latest recorded state of A before it
 * (within the claim's delay) is read, and the pair is one row:
 *
 *   fits       A was there (or high), and B moved the way the claim says
 *   exception  A was there, and B did not move that way
 *   contrast   A was not there (or low), and B did not move that way either
 *   elsewhere  A was not there, and B moved that way anyway: another route
 *   outside    the claim's condition was recorded as not met: not a test of it
 *
 * These are Mill's methods of agreement and difference, counted per
 * episode. Two threats are checked on every row that fits:
 *
 *   a common cause   C with claims into both A and B: if C was also pushing B
 *                    that way (or its state is unknown), the row cannot tell A
 *                    apart from C;
 *   a rival          an explanation marked as competing: if it was recorded
 *                    pushing B the same way, the row fits both.
 *
 * Nothing here is a probability. Every row keeps the moments behind it.
 */
import { EFFECT_META } from './constants';
import {
  cached,
  episodeAround,
  isBackgroundLevel,
  episodeOfItem,
  factorStates,
  oppositeLean,
  coverage,
  stateBefore,
  leanOf,
  type FactorState,
  type Lean,
} from './factors';
import { addDays, daysBetween, weekStart } from '../lib/dates';
import type { AtlasData, Claim, Condition, Effect, ID, ISODate } from './types';

/* ---------------- delays ---------------- */

const DEFAULT_WINDOW = 28;

/**
 * The delay a claim allows between cause and effect, in days, read from its
 * "typical delay" ("1–4 days", "2–6 weeks", "a month"): the shortest and the
 * longest. Up to four weeks when nothing is said.
 */
export function lagRange(claim: Pick<Claim, 'lag'>): [number, number] {
  const text = claim.lag?.toLowerCase() ?? '';
  if (!text.trim()) return [0, DEFAULT_WINDOW];
  const numbers = [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
  const unit = /month|bulan/.test(text) ? 30 : /week|minggu|pekan/.test(text) ? 7 : /day|hari/.test(text) ? 1 : 7;
  if (!numbers.length) return [0, Math.max(1, unit)];
  const lo = numbers.length > 1 ? Math.min(...numbers) : 0;
  const hi = Math.max(...numbers);
  return [Math.round(lo * unit), Math.max(1, Math.round(hi * unit))];
}

/** The longest delay a claim allows, in days. */
export const lagWindow = (claim: Pick<Claim, 'lag'>): number => lagRange(claim)[1];

/* ---------------- shared vocabulary ---------------- */

/** Claims on the map that still hold (adopted, not retired). */
export const liveClaims = (data: AtlasData) => Object.values(data.claims).filter((c) => c.state === 'adopted' && !c.retired);

export const areRivals = (a: Claim, b: Claim) => a.rivalIds.includes(b.id) || b.rivalIds.includes(a.id);

/** Which way a cause pushes the outcome through a claim, given which way the cause went. */
export const pushes = (effect: Effect, lean: Lean): Lean => (lean === 'usual' ? 'usual' : EFFECT_META[effect].polarity > 0 ? lean : oppositeLean(lean));

/** Links that make something possible or limit it: gates, not amounts. */
export const isGate = (effect: Effect) => effect === 'enables' || effect === 'constrains';

/** The episode a factor state falls in, as a key for counting. */
export function episodeOfState(data: AtlasData, s: FactorState): string {
  if (s.item) return episodeOfItem(data, s.item.key)?.key ?? `wk:${weekStart(s.date)}`;
  return episodeAround(data, s.date)?.key ?? `wk:${weekStart(s.date)}`;
}

/* ---------------- common causes and rivals ---------------- */

export interface CommonCause {
  factor: ID;
  /** C → A */
  toCause: Claim;
  /** C → B */
  toOutcome: Claim;
}

/** Factors with claims into both ends of this claim: whatever they do shows up as A and B together. */
export function commonCauses(data: AtlasData, claim: Claim): CommonCause[] {
  const live = liveClaims(data);
  const ends = new Set([claim.from, ...claim.with]);
  const out: CommonCause[] = [];
  for (const a of live) {
    if (a.id === claim.id || !ends.has(a.to) || ends.has(a.from) || a.from === claim.to) continue;
    const b = live.find((x) => x.id !== claim.id && x.from === a.from && x.to === claim.to);
    if (b && !out.some((o) => o.factor === a.from)) out.push({ factor: a.from, toCause: a, toOutcome: b });
  }
  return out;
}

export const rivalsOf = (data: AtlasData, claim: Claim) => liveClaims(data).filter((c) => c.id !== claim.id && areRivals(claim, c));

/** Whether this claim has anything it must be told apart from. */
export const needsTellingApart = (data: AtlasData, claim: Claim) => commonCauses(data, claim).length > 0 || rivalsOf(data, claim).length > 0;

export interface Other {
  factor: ID;
  claim: Claim;
  kind: 'common' | 'rival';
  state?: FactorState;
  /** It was recorded pushing B the same way. */
  explains: boolean;
}

/**
 * What the common causes and rivals were doing when B went a given way on a
 * given date, and whether this time tells the claim apart from them.
 */
export function othersAt(data: AtlasData, claim: Claim, date: ISODate, outcome: Lean): { others: Other[]; toldApart: boolean } {
  const others: Other[] = [];
  for (const c of commonCauses(data, claim)) {
    const state = stateBefore(data, c.factor, date, lagWindow(c.toOutcome));
    others.push({
      factor: c.factor,
      claim: c.toOutcome,
      kind: 'common',
      state,
      explains: Boolean(state && pushes(c.toOutcome.effect, state.lean) === outcome),
    });
  }
  for (const r of rivalsOf(data, claim)) {
    const state = stateBefore(data, r.from, date, lagWindow(r));
    others.push({ factor: r.from, claim: r, kind: 'rival', state, explains: Boolean(state && pushes(r.effect, state.lean) === outcome) });
  }
  // A common cause must be known not to be pushing; a rival only must not be recorded pushing.
  const toldApart = others.every((o) => (o.kind === 'common' ? Boolean(o.state) && !o.explains : !o.explains));
  return { others, toldApart };
}

/* ---------------- rows ---------------- */

export type Verdict = 'fits' | 'exception' | 'contrast' | 'elsewhere' | 'outside';

export interface CaseRow {
  /** The episode of the outcome. */
  episode: string;
  cause: FactorState;
  causeLean: Lean;
  outcome: FactorState;
  /** Days from the cause to the outcome. */
  days: number;
  verdict: Verdict;
  condition?: 'met' | 'not_met' | 'unknown';
  /** Outside the stretch of time the claim is about (its scope), so not a test of it. */
  outsidePeriod?: boolean;
  others: Other[];
  /** For rows that fit: the common causes and rivals were not doing the same. */
  toldApart: boolean;
  /**
   * The cause was written down on or after the day of the outcome: the order
   * was put together afterwards, knowing how it turned out. Such a row can
   * count against a claim, never for it.
   */
  hindsight: boolean;
}

/** Every condition a claim names: its first, and any further ones in its scope. */
export const conditionsOf = (c: Pick<Claim, 'condition' | 'scope'>): Condition[] => [...(c.condition ? [c.condition] : []), ...(c.scope?.also ?? [])];

/** Whether a claim is about a cause kept up over several episodes rather than one change. */
export const isCumulative = (c: Pick<Claim, 'scope'>) => c.scope?.timescale === 'cumulative';

const signature = (c: Claim) =>
  [
    c.id,
    c.from,
    c.to,
    c.effect,
    c.with.join(','),
    c.lag ?? '',
    conditionsOf(c)
      .map((x) => `${x.factor}:${x.reads}`)
      .join(','),
    c.scope?.from ?? '',
    c.scope?.until ?? '',
    c.scope?.timescale ?? '',
    c.rivalIds.join(','),
  ].join('|');

/** The conditions a claim names, read at a date: all met, one not met, or not known. */
export function conditionAt(data: AtlasData, claim: Pick<Claim, 'condition' | 'scope'>, date: ISODate): 'met' | 'not_met' | 'unknown' | undefined {
  const all = conditionsOf(claim);
  if (!all.length) return undefined;
  let unknown = false;
  for (const c of all) {
    const s = stateBefore(data, c.factor, date, DEFAULT_WINDOW);
    if (!s) unknown = true;
    else if (s.lean !== leanOf(c.reads)) return 'not_met';
  }
  return unknown ? 'unknown' : 'met';
}

/** Whether a date falls in the stretch of time a claim is about. */
export const inPeriod = (claim: Pick<Claim, 'scope'>, date: ISODate) =>
  (!claim.scope?.from || date >= claim.scope.from) && (!claim.scope?.until || date <= claim.scope.until);

/**
 * A cause kept up over the weeks before a date, for claims about what builds
 * over time: at least two of its states known in the delay before, and two
 * in three of them leaning the same way. Read against the usual level over
 * the whole record, not the period's, because a lasting shift is the very
 * thing such a claim is about.
 */
export function exposureBefore(data: AtlasData, id: ID, date: ISODate, days: number): FactorState | undefined {
  const from = addDays(date, -days);
  const states = factorStates(data, id, 'overall').filter((s) => s.date >= from && s.date < date);
  if (states.length < 2) return undefined;
  const more = states.filter((s) => s.lean === 'more');
  const less = states.filter((s) => s.lean === 'less');
  const lean: Lean = more.length * 3 >= states.length * 2 ? 'more' : less.length * 3 >= states.length * 2 ? 'less' : 'usual';
  const pick = lean === 'more' ? more : lean === 'less' ? less : states;
  const last = pick[pick.length - 1];
  return { ...last, lean };
}

/** Every recorded time A's state and then B's state are known, in order and within the delay. */
export function caseRows(data: AtlasData, claim: Claim): CaseRow[] {
  return cached(data, `rows:${signature(claim)}`, () => {
    const window = lagWindow(claim);
    const cumulative = isCumulative(claim);
    const withCause = pushes(claim.effect, 'more');
    const causes = [claim.from, ...claim.with];
    const statesOf = (id: ID) => factorStates(data, id, cumulative ? 'overall' : 'phase');
    const rows: CaseRow[] = [];
    const usedCause = new Set<string>();
    const usedEpisode = new Set<string>();
    for (const b of statesOf(claim.to)) {
      if (isBackgroundLevel(b)) continue;
      // A cause recorded the same day as an outcome has no known order with it, and is not paired with a later one.
      const sameDay = cumulative ? [] : causes.flatMap((f) => statesOf(f).filter((s) => s.date === b.date && !isBackgroundLevel(s)));
      const consume = () => sameDay.forEach((s) => usedCause.add(s.key));
      if (b.lean === 'usual') {
        consume();
        continue;
      }
      // Only what came before: the same day has no known order. A cumulative cause is what was kept up over the delay.
      const states = causes.map((f) => (cumulative ? exposureBefore(data, f, b.date, window) : stateBefore(data, f, b.date, window, b.key, true)));
      const known = states.filter((s): s is FactorState => Boolean(s));
      const causeLean: Lean =
        known.length < states.length ? 'usual' : known.every((s) => s.lean === 'more') ? 'more' : known.some((s) => s.lean === 'less') ? 'less' : 'usual';
      const cause = known[0];
      const episode = episodeOfState(data, b);
      if (causeLean === 'usual' || usedEpisode.has(episode) || (!cumulative && usedCause.has(cause.key))) {
        consume();
        continue;
      }
      consume();
      const condition = conditionAt(data, claim, b.date);
      const outsidePeriod = !inPeriod(claim, b.date);
      // With the cause, B should go the claim's way; without it (or with less of it), the other way or not at all.
      let verdict: Verdict = causeLean === 'more' ? (b.lean === withCause ? 'fits' : 'exception') : b.lean === withCause ? 'elsewhere' : 'contrast';
      if (condition === 'not_met' || outsidePeriod) verdict = 'outside';
      const { others, toldApart } = othersAt(data, claim, b.date, b.lean);
      usedCause.add(cause.key);
      usedEpisode.add(episode);
      rows.push({
        episode,
        cause,
        causeLean,
        outcome: b,
        days: daysBetween(cause.date, b.date),
        verdict,
        condition,
        outsidePeriod: outsidePeriod || undefined,
        others,
        toldApart,
        hindsight: Boolean(cause.written && cause.written >= b.date),
      });
    }
    return rows;
  });
}

/* ---------------- base rate ---------------- */

export interface BaseRate {
  /** Episodes where B went the way the claim says A pushes it. */
  same: number;
  /** Episodes where B's state was recorded at all. */
  known: number;
}

/**
 * How often B goes the way the claim predicts anyway, with or without A. Only
 * read when B has been recorded going both ways (or is recorded regularly):
 * a behaviour only ever written down when it happened has no base rate.
 */
export function baseRate(data: AtlasData, claim: Claim): BaseRate | undefined {
  return cached(data, `base:${claim.to}:${claim.effect}`, () => {
    const withCause = pushes(claim.effect, 'more');
    const seen = new Map<string, Lean>();
    // Instances of a behaviour are written down when it happens, so they cannot say how often it does.
    for (const s of factorStates(data, claim.to)) {
      if (isBackgroundLevel(s) || s.basis === 'instance') continue;
      const ep = episodeOfState(data, s);
      if (!seen.has(ep)) seen.set(ep, s.lean);
    }
    const leans = [...seen.values()];
    const same = leans.filter((l) => l === withCause).length;
    const tracked = coverage(data, claim.to) === 'tracked';
    if (!tracked && (same < 2 || leans.length - same < 2)) return undefined;
    return { same, known: leans.length };
  });
}

/** B goes that way in at least three of every four recorded episodes: that A came first says little on its own. */
export const happensAnyway = (b: BaseRate | undefined) => Boolean(b && b.known >= 4 && b.same * 4 >= b.known * 3);

/* ---------------- delays seen ---------------- */

/** How long the effect took in the times the record shows it, in days. */
export function delaysSeen(data: AtlasData, claim: Claim, confirmed: number[] = []): [number, number] | undefined {
  // A level of what was already running has no start to measure a delay from.
  const days = [
    ...caseRows(data, claim)
      .filter((r) => r.verdict === 'fits' && !isBackgroundLevel(r.cause))
      .map((r) => r.days),
    ...confirmed,
  ];
  return days.length ? [Math.min(...days), Math.max(...days)] : undefined;
}

/* ---------------- the state of other factors, for conditions ---------------- */

/** Factors whose state the record gives at least sometimes, apart from the claim's own ends. */
export function recordedFactors(data: AtlasData, claim: Claim): ID[] {
  const ends = new Set([claim.from, claim.to, ...claim.with]);
  return Object.keys(data.nodes).filter((id) => !ends.has(id) && data.nodes[id].adopted && factorStates(data, id).length > 0);
}

/**
 * A condition worth checking: a factor that was one way every time the claim
 * held, and not that way every time it did not (Mill's method of difference,
 * run on the exceptions). A suggestion, never a conclusion.
 */
export function candidateCondition(
  data: AtlasData,
  claim: Claim,
  held: ISODate[],
  failed: ISODate[],
): { factor: ID; reads: 'high' | 'low'; held: number; failed: number } | undefined {
  if (held.length < 2 || failed.length < 1) return undefined;
  for (const f of recordedFactors(data, claim)) {
    const at = (d: ISODate) => stateBefore(data, f, d, 14)?.lean;
    const a = held.map(at);
    const b = failed.map(at);
    if (a.some((x) => !x || x === 'usual') || b.some((x) => !x)) continue;
    if (a.every((x) => x === a[0]) && b.every((x) => x !== a[0]))
      return { factor: f, reads: a[0] === 'more' ? 'high' : 'low', held: held.length, failed: failed.length };
  }
  return undefined;
}

/**
 * Contexts a claim has never been seen outside: a factor that was the same
 * way every time the claim was put to the record (at least three times),
 * though it has been recorded the other way at other times. Until a time
 * without that context, the claim is known only for it.
 */
export function untestedContexts(data: AtlasData, claim: Claim): { factor: ID; reads: 'high' | 'low'; times: number }[] {
  return cached(data, `untested:${signature(claim)}`, () => {
    const dates = caseRows(data, claim)
      .filter((r) => r.verdict !== 'outside')
      .map((r) => r.outcome.date);
    if (dates.length < 3) return [];
    const bounded = new Set(conditionsOf(claim).map((c) => c.factor));
    const out: { factor: ID; reads: 'high' | 'low'; times: number }[] = [];
    for (const f of recordedFactors(data, claim)) {
      if (bounded.has(f) || !data.nodes[f] || data.nodes[f].kind === 'question') continue;
      const leans = dates.map((d) => stateBefore(data, f, d, 14)?.lean);
      if (leans.some((l) => !l || l === 'usual') || !leans.every((l) => l === leans[0])) continue;
      const states = factorStates(data, f);
      if (!states.some((s) => s.lean === oppositeLean(leans[0]!))) continue;
      out.push({ factor: f, reads: leans[0] === 'more' ? 'high' : 'low', times: dates.length });
      if (out.length >= 2) break;
    }
    return out;
  });
}

/**
 * The same relationship under other bounds: claims on the map from the same
 * cause to the same outcome. A relationship can act one way in one context
 * and another way, or not at all, in another; together they are its family.
 */
export const familyOf = (data: AtlasData, claim: Claim): Claim[] =>
  liveClaims(data).filter((c) => c.id !== claim.id && c.from === claim.from && c.to === claim.to);

/* ---------------- moving back toward usual ---------------- */

/**
 * Rows where the outcome had been at the other extreme just before: some of
 * the move may have come anyway, as things drift back toward their usual level.
 */
export function backFromExtreme(data: AtlasData, claim: Claim): number {
  return caseRows(data, claim).filter((r) => {
    if (r.verdict !== 'fits' || r.outcome.lean === 'usual') return false;
    const before = stateBefore(data, claim.to, addDays(r.cause.date, -1), 21);
    return before?.lean === oppositeLean(r.outcome.lean);
  }).length;
}
