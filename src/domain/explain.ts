/**
 * Explaining an outcome: "why might this be happening?", answered from the
 * claims and the history already in the atlas.
 *
 * An explanation is never closed. It lists what may be contributing, by the
 * part each plays (sets it off, adds to it, sets the stage, keeps it going,
 * holds it back), the explanations that compete, what happened to the person
 * from outside, and always what remains unexplained: the recorded times the
 * outcome moved with nothing on the list recorded pushing it that way first,
 * the times it came up with no record of which way it went, and chance.
 * Several contributors never share out the outcome between them; there are no
 * percentages. Where contributors are one cause acting through others (load
 * lowering progress directly, and through fragmented attention), that is
 * said: they are routes of one cause, not separate causes.
 *
 * A single happening can be explained the same way: which of the possible
 * contributors were recorded before it and pushing the way it went, which
 * were recorded pointing the other way, which were not recorded at all, and
 * what else happened to the person then. That reads the general claims
 * against one episode; it proves nothing on its own.
 */
import { areRivals, byStrength, claimsInto, claimStatus } from './claims';
import { lagWindow, liveClaims, pushes } from './compare';
import { CAUSAL_ROLES, EFFECT_META } from './constants';
import { actualItems, episodeOfItem, factorStates, isBackgroundLevel, leanOf, stateBefore, type FactorState, type Lean } from './factors';
import type { HistoryItem } from './history';
import type { AtlasData, AtlasNode, CausalRole, Claim, ClaimStatus, ID, ISODate } from './types';
import { addDays } from '../lib/dates';
import { t } from '../i18n';

export interface Contributor {
  claim: Claim;
  status: ClaimStatus;
  /** Proposed by the analysis, not yet kept by the person. */
  suggested: boolean;
  /** The cause is outside the person's control. */
  external: boolean;
}

/** How one contributor sits among the others: a cause can reach the outcome directly and through others. */
export interface RouteNote {
  /** Elements this cause also acts through (it has claims into them, and they into the outcome). */
  through: ID[];
  /** Causes this one is a route of (they have claims into it and into the outcome). */
  partOf: ID[];
}

export interface OutcomeExplanation {
  groups: { role: CausalRole; items: Contributor[] }[];
  /** Pairs of explanations marked as competing: if one holds, the other may not be needed. */
  rivalries: [Claim, Claim][];
  /** Where contributors are one cause through different routes, not separate causes. */
  routes: Record<ID, RouteNote>;
  /** Things that happened to the person (not by them) in the weeks before the outcome moved. */
  outside: HistoryItem[];
  /** Recorded times the outcome moved (went up or down, happened or not), one per episode. */
  moments: number;
  /** Of those, times nothing on the list was recorded pushing it that way first. */
  unexplained: number;
  /** Episodes where it came up with no record of which way it went. */
  unrecorded: number;
  /** Recorded times it happened without one of these contributors. */
  elsewhere: number;
  /** What would help: more evidence, or evidence that tells explanations apart. */
  missing: string[];
  /** Questions you are working on about it. */
  questions: AtlasNode[];
}

const OUTSIDE_DAYS = 28;

function outsideBefore(data: AtlasData, dates: ISODate[], exclude: Set<ID>): HistoryItem[] {
  const out = new Map<string, HistoryItem>();
  for (const date of dates) {
    for (const h of actualItems(data)) {
      // Only happenings that happened to the person: never their own notes, decisions or actions.
      if (h.ref.kind !== 'occurrence' || h.kind === 'action' || h.date > date || h.date < addDays(date, -OUTSIDE_DAYS)) continue;
      const outside = h.external || h.about.some((a) => data.nodes[a]?.external && !exclude.has(a));
      if (outside && !h.about.some((a) => exclude.has(a))) out.set(h.key, h);
    }
  }
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
}

/** Recorded moves of an element, one per episode (the most telling), newest first. */
function movesOf(data: AtlasData, id: ID): FactorState[] {
  const seen = new Set<string>();
  const out: FactorState[] = [];
  for (const s of factorStates(data, id)) {
    if (isBackgroundLevel(s) || s.lean === 'usual') continue;
    const ep = s.item ? (episodeOfItem(data, s.item.key)?.key ?? s.key) : s.key;
    if (seen.has(ep)) continue;
    seen.add(ep);
    out.push(s);
  }
  return out.reverse();
}

/** Whether a claim's cause was recorded, before this date, going the way that pushes the outcome as it went. */
function pushedBefore(data: AtlasData, c: Claim, date: ISODate, outcome: Lean, notKey?: string): FactorState | undefined {
  const s = stateBefore(data, c.from, date, lagWindow(c), notKey, true);
  return s && s.lean !== 'usual' && pushes(c.effect, s.lean) === outcome ? s : undefined;
}

/** Routes among the contributors to one outcome. */
function routesAmong(data: AtlasData, id: ID, contributors: Claim[]): Record<ID, RouteNote> {
  const live = liveClaims(data);
  const into = new Set(contributors.map((c) => c.from));
  const out: Record<ID, RouteNote> = {};
  for (const c of contributors) {
    const through = live.filter((x) => x.from === c.from && x.to !== id && into.has(x.to)).map((x) => x.to);
    const partOf = live.filter((x) => x.to === c.from && x.from !== id && into.has(x.from)).map((x) => x.from);
    if (through.length || partOf.length) out[c.id] = { through: [...new Set(through)], partOf: [...new Set(partOf)] };
  }
  return out;
}

/** Everything that may be contributing to an outcome, what competes, and what is left unexplained. */
export function explainOutcome(data: AtlasData, id: ID): OutcomeExplanation {
  const adopted = claimsInto(data, id).filter((c) => claimStatus(data, c) !== 'retired');
  const suggested = Object.values(data.claims).filter((c) => c.state === 'suggested' && c.to === id && data.nodes[c.from]?.adopted);
  const contributors: Contributor[] = [...adopted, ...suggested.sort(byStrength(data))].map((claim) => ({
    claim,
    status: claimStatus(data, claim),
    suggested: claim.state === 'suggested',
    external: Boolean(data.nodes[claim.from]?.external),
  }));
  const groups = CAUSAL_ROLES.map((r) => ({ role: r.key, items: contributors.filter((c) => EFFECT_META[c.claim.effect].role === r.key) })).filter(
    (g) => g.items.length,
  );

  const rivalries: [Claim, Claim][] = [];
  for (let i = 0; i < adopted.length; i++)
    for (let j = i + 1; j < adopted.length; j++) if (areRivals(adopted[i], adopted[j])) rivalries.push([adopted[i], adopted[j]]);

  // The unexplained part, from what was recorded: times it moved with nothing on the list recorded pushing it that way first.
  const moves = movesOf(data, id);
  const unexplained = moves.filter((m) => !adopted.some((c) => pushedBefore(data, c, m.date, m.lean, m.key))).length;
  const recordedEpisodes = new Set(moves.map((m) => (m.item ? episodeOfItem(data, m.item.key)?.key : undefined)).filter(Boolean));
  const mentionedEpisodes = new Set(
    actualItems(data)
      .filter((h) => h.about.includes(id) || h.instanceOf === id)
      .map((h) => episodeOfItem(data, h.key)?.key)
      .filter((k): k is string => Boolean(k)),
  );
  const unrecorded = [...mentionedEpisodes].filter((k) => !recordedEpisodes.has(k)).length;
  const elsewhere = adopted.reduce((n, c) => n + c.evidence.filter((e) => e.kind === 'elsewhere').length, 0);
  const outside = outsideBefore(
    data,
    moves.slice(0, 6).map((m) => m.date),
    new Set([id]),
  );

  const missing: string[] = [];
  const statuses = adopted.map((c) => claimStatus(data, c));
  if (!contributors.length) missing.push(t('Nothing on the map explains it yet: add a possible reason.'));
  else if (statuses.length && statuses.every((s) => s === 'proposed'))
    missing.push(t('Every explanation here is still a hunch: look for a time it happened, in that order.'));
  if (rivalries.length) missing.push(t('To tell competing explanations apart, look for a time when one was there without the other.'));
  if (adopted.length && !adopted.some((c) => c.evidence.some((e) => e.kind === 'contrast')))
    missing.push(t('No time without any of these yet: what happened to it then?'));
  if (adopted.length && !statuses.includes('tested')) missing.push(t('None of these has been tested: changing one on purpose would tell you more.'));
  if (unrecorded > moves.length)
    missing.push(t('Most times it comes up, nothing says which way it went: noting that (up, down, happened or not) would tell more.'));

  const questions = Object.values(data.nodes).filter((n) => n.kind === 'question' && n.investigation?.anchorId === id);
  return {
    groups,
    rivalries,
    routes: routesAmong(data, id, adopted),
    outside,
    moments: moves.length,
    unexplained,
    unrecorded,
    elsewhere,
    missing,
    questions,
  };
}

export interface MomentExplanation {
  /** The elements this happening is a time of. */
  outcomes: ID[];
  /** What the record says changed here, for each outcome that has it. */
  moved: { factor: ID; lean: Lean; reads: FactorState['reads'] }[];
  /** Possible contributors recorded before it, pushing the way it went (or there, when which way it went is not recorded). */
  present: { claim: Claim; state: FactorState }[];
  /** Possible contributors recorded before it, but pointing the other way. */
  against: { claim: Claim; state: FactorState }[];
  /** Possible contributors with nothing recorded before it this time. */
  absent: Claim[];
  /** What happened to the person from outside in the four weeks before. */
  outside: HistoryItem[];
}

/** One happening read against the general claims: what was recorded before it, and which way it pointed. */
export function explainMoment(data: AtlasData, item: HistoryItem): MomentExplanation {
  const outcomes = [...new Set([...(item.instanceOf ? [item.instanceOf] : []), ...item.about])].filter((id) => data.nodes[id]);
  const own = item.ref.kind === 'occurrence' ? (data.occurrences[item.ref.id]?.changes ?? []) : [];
  const moved = own.filter((c) => outcomes.includes(c.factor)).map((c) => ({ factor: c.factor, lean: leanOf(c.reads), reads: c.reads }));
  const present: MomentExplanation['present'] = [];
  const against: MomentExplanation['against'] = [];
  const absent: Claim[] = [];
  const seen = new Set<ID>();
  for (const id of outcomes) {
    const went = moved.find((m) => m.factor === id)?.lean;
    for (const c of claimsInto(data, id)) {
      if (seen.has(c.id) || claimStatus(data, c) === 'retired') continue;
      seen.add(c.id);
      const state = stateBefore(data, c.from, item.date, lagWindow(c), undefined, true);
      if (!state || state.lean === 'usual') absent.push(c);
      else if (went ? pushes(c.effect, state.lean) === went : state.lean === 'more') present.push({ claim: c, state });
      else against.push({ claim: c, state });
    }
  }
  return { outcomes, moved, present, against, absent, outside: outsideBefore(data, [item.date], new Set(outcomes)).filter((h) => h.key !== item.key) };
}
