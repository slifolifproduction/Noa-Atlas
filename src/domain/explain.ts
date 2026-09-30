/**
 * Explaining an outcome: "why might this be happening?", answered from the
 * claims and the history already in the atlas.
 *
 * An explanation is never closed. It lists what may be contributing, by the
 * part each plays (sets it off, adds to it, sets the stage, keeps it going,
 * holds it back), the explanations that compete, what happened to the person
 * from outside, and always what remains unexplained: the times the outcome
 * came up with nothing known to contribute before it, the times it happened
 * without one of these, and chance. Several contributors never share out the
 * outcome between them; there are no percentages.
 *
 * A single happening can be explained the same way: which of the possible
 * contributors were there in the weeks before it, which were not, and what
 * else happened to the person then. That reads the general claims against one
 * episode; it proves nothing on its own.
 */
import { areRivals, byStrength, claimsInto, claimStatus, historySource, lagWindow } from './claims';
import { CAUSAL_ROLES, EFFECT_META } from './constants';
import { historyItems, type HistoryItem } from './history';
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

export interface OutcomeExplanation {
  groups: { role: CausalRole; items: Contributor[] }[];
  /** Pairs of explanations marked as competing: if one holds, the other may not be needed. */
  rivalries: [Claim, Claim][];
  /** Things that happened to the person (not by them) in the weeks before the outcome came up. */
  outside: HistoryItem[];
  /** Times the outcome came up in history. */
  moments: number;
  /** Of those, times none of its possible reasons came up first. */
  unexplained: number;
  /** Recorded times it happened without one of these contributors. */
  elsewhere: number;
  /** What would help: more evidence, or evidence that tells explanations apart. */
  missing: string[];
  /** Questions you are working on about it. */
  questions: AtlasNode[];
}

/** Moments in history that can show an element: happenings, notes, decisions, tests (not energy readings). */
function momentsAbout(data: AtlasData, ids: Set<ID>, items = historyItems(data, { records: true })): HistoryItem[] {
  return items.filter(
    (h) =>
      h.mode === 'actual' &&
      h.kind !== 'reading' &&
      historySource(h) &&
      (h.about.some((a) => ids.has(a)) || (h.instanceOf !== undefined && ids.has(h.instanceOf))),
  );
}

/** The latest moment of any of `causes` before `date`, within `days`, from a different record. */
function cameBefore(moments: HistoryItem[], date: ISODate, days: number, notKey: string): HistoryItem | undefined {
  const from = addDays(date, -days);
  return moments.find((m) => m.key !== notKey && m.date <= date && m.date >= from);
}

const OUTSIDE_DAYS = 28;

function outsideBefore(data: AtlasData, items: HistoryItem[], dates: ISODate[], exclude: Set<ID>): HistoryItem[] {
  const out = new Map<string, HistoryItem>();
  for (const date of dates) {
    for (const h of items) {
      // Only happenings that happened to the person: never their own notes, decisions or actions.
      if (h.ref.kind !== 'occurrence' || h.kind === 'action' || h.mode !== 'actual' || h.date > date || h.date < addDays(date, -OUTSIDE_DAYS)) continue;
      const outside = h.external || h.about.some((a) => data.nodes[a]?.external && !exclude.has(a));
      if (outside && !h.about.some((a) => exclude.has(a))) out.set(h.key, h);
    }
  }
  return [...out.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
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

  // The unexplained part: times the outcome came up with nothing known to contribute before it.
  const items = historyItems(data, { records: true });
  const outcome = momentsAbout(data, new Set([id]), items);
  const causeMoments = new Map(adopted.map((c) => [c.id, momentsAbout(data, new Set([c.from, ...c.with]), items)]));
  let unexplained = 0;
  for (const m of outcome) {
    const known = adopted.some((c) => cameBefore(causeMoments.get(c.id)!, m.date, lagWindow(c), m.key));
    if (!known) unexplained++;
  }
  const elsewhere = adopted.reduce((n, c) => n + c.evidence.filter((e) => e.kind === 'elsewhere').length, 0);
  const outside = outsideBefore(
    data,
    items,
    outcome.slice(0, 6).map((m) => m.date),
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

  const questions = Object.values(data.nodes).filter((n) => n.kind === 'question' && n.investigation?.anchorId === id);
  return { groups, rivalries, outside, moments: outcome.length, unexplained, elsewhere, missing, questions };
}

export interface MomentExplanation {
  /** The elements this happening is a time of. */
  outcomes: ID[];
  /** Possible contributors that came up in the weeks before it, with the moment that shows it. */
  present: { claim: Claim; moment: HistoryItem }[];
  /** Possible contributors with nothing recorded before it this time. */
  absent: Claim[];
  /** What happened to the person from outside in the four weeks before. */
  outside: HistoryItem[];
}

/** One happening read against the general claims: what was there before it, and what was not. */
export function explainMoment(data: AtlasData, item: HistoryItem): MomentExplanation {
  const outcomes = [...new Set([...(item.instanceOf ? [item.instanceOf] : []), ...item.about])].filter((id) => data.nodes[id]);
  const items = historyItems(data, { records: true });
  const present: MomentExplanation['present'] = [];
  const absent: Claim[] = [];
  for (const id of outcomes) {
    for (const c of claimsInto(data, id)) {
      if (claimStatus(data, c) === 'retired' || present.some((p) => p.claim.id === c.id) || absent.includes(c)) continue;
      const moment = cameBefore(momentsAbout(data, new Set([c.from, ...c.with]), items), item.date, lagWindow(c), item.key);
      if (moment) present.push({ claim: c, moment });
      else absent.push(c);
    }
  }
  return { outcomes, present, absent, outside: outsideBefore(data, items, [item.date], new Set(outcomes)).filter((h) => h.key !== item.key) };
}
