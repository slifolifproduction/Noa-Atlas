/**
 * Active Inquiry: what to find out next, and why.
 *
 * When the Atlas cannot tell its explanations apart, it looks for the one
 * observation, comparison or small change whose answer would differ between
 * them. This is information-seeking, never advice: its object is the
 * model's uncertainty, not the person's outcome, and it succeeds when two
 * readings are told apart, whichever way the answer goes.
 *
 * Where uncertainty comes from:
 *   - other readings of an outcome you care about (or ask why about) that are
 *     still open (see `accounts.ts`), and explanations marked as competing;
 *   - reasons one step short of the next status, especially the least sure
 *     step of a cycle;
 *   - expectations that failed, not yet located;
 *   - moves of what you care about that nothing on the map accounts for.
 *
 * What can be asked for, cheapest first:
 *   reread   judge something already written
 *   ask      one precise question about a past time
 *   compare  watch for a time that differs in one respect
 *   track    record something regularly for a few weeks
 *   test     a small, reversible change you make yourself
 *
 * Ordered, never scored: first what would decide between readings, then
 * what only narrows them; within each, the cheapest; then what matters most
 * to you (what you care about, a decision or a cycle resting on it).
 *
 * It stops asking when the readings are told apart, when what is left is a
 * question of value (yours to settle), when a check would intrude (tracking
 * a person), and for a while when you say not now. Changes are suggested
 * only for what you do yourself, reversibly, and never where health or money
 * is at stake: there it looks for a natural comparison instead.
 */
import { accountLabel, accountsFor, type Account, type Discriminator } from './accounts';
import { areRivals, claimCode, claimsInto, claimSentence, claimStatus, evidenceProfile, orderedEpisodes } from './claims';
import { liveClaims } from './compare';
import { findLoops } from './loops';
import { repairsFor, surprises } from './ledger';
import { watchedOutcomes } from './beliefs';
import { displayNode } from './selectors';
import type { AtlasData, Claim, EntityRef, ID, ISODate } from './types';
import { addDays, todayISO } from '../lib/dates';
import { t, tn } from '../i18n';

export type InquiryKind = Discriminator['kind'];

export interface Inquiry {
  /** Stable, so a declined inquiry is not asked again soon. */
  key: string;
  kind: InquiryKind;
  decisive: boolean;
  question: string;
  /** The readings it would tell apart. */
  between: string[];
  ifSo: string;
  ifNot: string;
  outcome?: ID;
  claimId?: ID;
  /** Where to look into it. */
  open: EntityRef;
  /** Something you care about, a cycle, or a decision rests on it. */
  relevance: number;
}

const COST: Record<InquiryKind, number> = { reread: 0, ask: 1, compare: 2, track: 3, test: 4 };
/** Not asked again for this long after "not now". */
export const DECLINE_DAYS = 30;

const name = (data: AtlasData, id?: ID) => (id ? (displayNode(data, id)?.label ?? '') : '');

/** Whether a small change of this cause may be suggested: something you do, reversible, and not where health or money is at stake. */
export function changeable(data: AtlasData, c: Claim): boolean {
  const from = data.nodes[c.from];
  const to = data.nodes[c.to];
  if (!from || !to || from.kind !== 'behaviour' || from.external) return false;
  return ![from.area, to.area].some((a) => a === 'health' || a === 'money');
}

/** How much rests on a claim or an outcome for you: what you care about, a cycle's least sure step, a decision or an option relying on it. */
function relevanceOf(data: AtlasData, claimId?: ID, outcome?: ID): number {
  let r = 0;
  const c = claimId ? data.claims[claimId] : undefined;
  const to = outcome ?? c?.to;
  if (to && data.nodes[to]?.concern) r += 2;
  if (claimId && findLoops(data).some((l) => l.leastCertain.includes(claimId))) r += 1;
  if (
    claimId &&
    (Object.values(data.decisions).some((d) => d.claimIds.includes(claimId)) || Object.values(data.paths).some((p) => p.assumptionIds.includes(claimId)))
  )
    r += 1;
  return r;
}

function fromAccount(data: AtlasData, outcome: ID, leading: Claim | undefined, a: Account): Inquiry | undefined {
  const d = a.tell;
  if (!d || a.standing === 'set_aside') return undefined;
  // Tracking a person would intrude.
  if (d.kind === 'track' && d.factor && data.nodes[d.factor]?.kind === 'person') return undefined;
  let kind = d.kind;
  let decisive = d.decisive;
  const claim = d.claimId ? data.claims[d.claimId] : undefined;
  if (kind === 'test' && (!claim || !changeable(data, claim))) {
    kind = 'compare';
    decisive = false;
  }
  return {
    key: d.key,
    kind,
    decisive,
    question: d.question,
    between: [claim ? claimSentence(data, claim) : leading ? claimSentence(data, leading) : name(data, outcome), accountLabel(data, a)],
    ifSo: d.ifSo,
    ifNot: d.ifNot,
    outcome,
    claimId: d.claimId,
    open: d.claimId ? { kind: 'claim', id: d.claimId } : { kind: 'node', id: outcome },
    relevance: relevanceOf(data, d.claimId, outcome),
  };
}

/** Inquiries about one outcome: its open readings and its competing explanations. */
function aboutOutcome(data: AtlasData, outcome: ID): Inquiry[] {
  const set = accountsFor(data, outcome);
  if (set.distinguished) return [];
  const out: Inquiry[] = [];
  for (const a of set.accounts) {
    if (a.kind === 'claim') continue;
    const q = fromAccount(data, outcome, set.leading, a);
    if (q) out.push(q);
  }
  // Explanations marked as competing: a time one was there without the other.
  const claims = claimsInto(data, outcome).filter((c) => !c.retired);
  for (let i = 0; i < claims.length; i++)
    for (let j = i + 1; j < claims.length; j++) {
      const [x, y] = [claims[i], claims[j]];
      if (!areRivals(x, y)) continue;
      out.push({
        key: `rivals:${[x.id, y.id].sort().join(':')}`,
        kind: 'compare',
        decisive: true,
        question: t('A time when {a} was there and {b} was not: did {o} move?', { a: name(data, x.from), b: name(data, y.from), o: name(data, outcome) }),
        between: [claimSentence(data, x), claimSentence(data, y)],
        ifSo: t('{a} does something {b} does not.', { a: name(data, x.from), b: name(data, y.from) }),
        ifNot: t('{b} may be the better explanation.', { b: name(data, y.from) }),
        outcome,
        claimId: x.id,
        open: { kind: 'node', id: outcome },
        relevance: relevanceOf(data, x.id, outcome),
      });
    }
  return out;
}

/** Inquiries that would move one claim a step: what is already written, and a time without it. */
function aboutClaim(data: AtlasData, c: Claim): Inquiry[] {
  const status = claimStatus(data, c);
  if (status !== 'proposed' && status !== 'plausible') return [];
  const out: Inquiry[] = [];
  const a = name(data, c.from);
  const b = name(data, c.to);
  const times = orderedEpisodes(data, c);
  if (times.length)
    out.push({
      key: `reread:${c.id}`,
      kind: 'reread',
      decisive: false,
      question: tn(
        times.length,
        'Look at one time {a} came first and {b} followed: does it show one leading to the other?',
        'Look at {n} times {a} came first and {b} followed: do they show one leading to the other?',
        {
          a,
          b,
        },
      ),
      between: [claimSentence(data, c), t('They only happened close together')],
      ifSo: t('It is seen in more than one episode.'),
      ifNot: t('Coming first was a coincidence of timing.'),
      claimId: c.id,
      open: { kind: 'claim', id: c.id },
      relevance: relevanceOf(data, c.id),
    });
  if (evidenceProfile(data, c).contrast === 0)
    out.push({
      key: `without:${c.id}`,
      kind: 'compare',
      decisive: false,
      question: t('A time without {a}: what did {b} do?', { a, b }),
      between: [claimSentence(data, c), t('{b} goes that way with or without {a}', { a, b })],
      ifSo: t('If {b} did not move, that is a time without it, and it counts.', { b }),
      ifNot: t('If {b} moved anyway, something else can bring it about.', { b }),
      claimId: c.id,
      open: { kind: 'claim', id: c.id },
      relevance: relevanceOf(data, c.id),
    });
  return out;
}

/** Everything worth finding out now, in order. */
export function inquiries(data: AtlasData, today: ISODate = todayISO()): Inquiry[] {
  const out: Inquiry[] = [];
  for (const id of watchedOutcomes(data)) out.push(...aboutOutcome(data, id));

  // The least sure steps of cycles, and reasons about what you care about.
  const least = new Set(findLoops(data).flatMap((l) => l.leastCertain));
  for (const c of liveClaims(data)) if (least.has(c.id) || data.nodes[c.to]?.concern) out.push(...aboutClaim(data, c));

  // Expectations that failed: where the model was wrong.
  for (const s of surprises(data, today)) {
    if (s.kind === 'failed' && s.expectation) {
      const { located, repairs } = repairsFor(data, s.expectation);
      const first = repairs[0];
      if (!first) continue;
      out.push({
        key: `failed:${s.expectation.occurrence.id}`,
        kind: 'ask',
        decisive: false,
        question: t('“{label}” did not hold. {repair} Is that what happened?', { label: s.expectation.occurrence.label, repair: first.text }),
        between: located ? [claimSentence(data, located), t('It holds, and something else got in the way')] : [],
        ifSo: t('The reason may hold only in some conditions, or over a longer time.'),
        ifNot: t('The failure counts against the reason it rested on.'),
        outcome: s.factor,
        claimId: located?.id,
        open: { kind: 'occurrence', id: s.expectation.occurrence.id },
        relevance: relevanceOf(data, located?.id, s.factor) + 1,
      });
    } else if (s.kind === 'unexplained' && s.state) {
      out.push({
        key: `move:${s.state.key}`,
        kind: 'ask',
        decisive: false,
        question: t('{o} moved around {date} with every known reason pointing elsewhere. What else was going on?', { o: name(data, s.factor), date: s.date }),
        between: [t('Something not yet on the map'), t('Chance')],
        ifSo: t('Something new to put on the map, and to look for next time.'),
        ifNot: t('It may be chance, or something not noticed yet.'),
        outcome: s.factor,
        open: { kind: 'node', id: s.factor },
        relevance: relevanceOf(data, undefined, s.factor),
      });
    }
  }

  const declined = data.inquiry?.declined ?? {};
  const seen = new Set<string>();
  return out
    .filter((q) => {
      if (seen.has(q.key)) return false;
      seen.add(q.key);
      const when = declined[q.key];
      return !when || addDays(when, DECLINE_DAYS) <= today;
    })
    .sort(
      (x, y) =>
        Number(y.decisive) - Number(x.decisive) ||
        putAway(data, x.kind) - putAway(data, y.kind) ||
        COST[x.kind] - COST[y.kind] ||
        y.relevance - x.relevance ||
        x.key.localeCompare(y.key),
    );
}

/** Inquiries about one outcome or one claim, in order. */
export function inquiriesFor(data: AtlasData, about: { outcome?: ID; claimId?: ID }, today: ISODate = todayISO()): Inquiry[] {
  const all = inquiries(data, today);
  const extra: Inquiry[] = [];
  if (about.outcome && !watchedOutcomes(data).includes(about.outcome)) extra.push(...aboutOutcome(data, about.outcome));
  if (about.claimId && data.claims[about.claimId]) extra.push(...aboutClaim(data, data.claims[about.claimId]));
  const keys = new Set(all.map((q) => q.key));
  const declined = data.inquiry?.declined ?? {};
  const pool = [...all, ...extra.filter((q) => !keys.has(q.key) && (!declined[q.key] || addDays(declined[q.key], DECLINE_DAYS) <= today))];
  return pool
    .filter((q) => (about.outcome && q.outcome === about.outcome) || (about.claimId && q.claimId === about.claimId))
    .sort(
      (x, y) =>
        Number(y.decisive) - Number(x.decisive) || putAway(data, x.kind) - putAway(data, y.kind) || COST[x.kind] - COST[y.kind] || y.relevance - x.relevance,
    );
}

/** Kinds of question the person put away three or more times are asked after the others (see `domain/learning.ts`). */
const putAway = (data: AtlasData, kind: InquiryKind) => ((data.learning?.declined?.[kind] ?? 0) >= 3 ? 1 : 0);

/** What an inquiry asks for, in a word. */
export const INQUIRY_KIND_LABEL: Record<InquiryKind, () => string> = {
  reread: () => t('Look again'),
  ask: () => t('A question'),
  compare: () => t('Watch for a time'),
  track: () => t('Keep a record'),
  test: () => t('A small change'),
};

export const inquiryCode = (data: AtlasData, q: Inquiry) => (q.claimId && data.claims[q.claimId] ? claimCode(data.claims[q.claimId].code) : '');
