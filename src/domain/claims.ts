/**
 * Claims: possible explanations of how a change in one factor may contribute
 * to a change in another.
 *
 * A claim's status is derived from its evidence, never typed in, and the
 * kind of evidence matters more than the count:
 *
 *   proposed   stated, nothing behind it yet: a hunch
 *   plausible  it happened in that order in at least two separate episodes, or
 *              in one where the "how" was also seen happening, or a
 *              prediction from it held
 *   supported  three or more episodes, at least one time without it, and (when
 *              something else could produce the same) at least one time that
 *              tells it apart
 *   tested     a deliberate change produced the predicted difference, and no
 *              test failed as often
 *   weakened   failed tests at least as many as passed ones, or exceptions and
 *              failed predictions that outweigh the support
 *   retired    it held for a while, then stopped, or was revised into a new version
 *
 * Evidence comes from two places, counted per episode, never twice:
 *   - what the person confirmed (a note read as an instance, a contrast, an
 *     exception…): their judgement of that episode stands;
 *   - what the record shows by itself: recorded factor states compared
 *     episode by episode (`compare.ts`). Only recorded states count, never
 *     mentions. Where both speak of one episode and disagree, it is shown.
 *
 * What does not count, by design:
 *   - a written "how": it is an explanation to check, not evidence that it happened;
 *   - the outcome happening without the factor: another route, not a case against;
 *   - a sequence in the wrong order, or further apart than the claim's delay;
 *   - several records of one episode;
 *   - times that fit when the outcome goes that way most times anyway, unless
 *     there is also a time without the cause;
 *   - predictions written after their window began.
 */
import { conditionPhrase, effectPhrase, EFFECT_META, isFactorKind, STATUS_META } from './constants';
import {
  baseRate,
  caseRows,
  commonCauses,
  happensAnyway,
  needsTellingApart,
  othersAt,
  pushes,
  rivalsOf,
  areRivals as rivals,
  lagWindow as window,
  type BaseRate,
  type CaseRow,
} from './compare';
import { predictionCounts, predictionLocked } from './expect';
import { cachedOn, episodeKeyOf, sourceDate } from './factors';
import { historyItems, type HistoryItem } from './history';
import { displayNode } from './selectors';
import { addDays, daysBetween } from '../lib/dates';
import type { AtlasData, Claim, ClaimStatus, Entry, Decision, Evidence, ID, ISODate, Occurrence, SourceRef } from './types';
import { t, tn } from '../i18n';

export { lagRange } from './compare';

export interface EvidenceProfile {
  /** Supporting instances you confirmed: A, then B. */
  instances: number;
  /** Separate episodes with a time it happened in order, or a time without it. */
  episodes: number;
  /** Separate episodes without A, where B did not happen either. */
  contrast: number;
  /** The "how" seen happening in a passage. */
  mechanism: boolean;
  /** The "how" only described in words (not evidence). */
  mechanismDescribed?: boolean;
  testsFor: number;
  testsAgainst: number;
  /** Separate episodes where A was there and B did not follow. */
  counter: number;
  /** Times B happened without A: other routes to B, counted for the unexplained part, never against. */
  elsewhere?: number;
  /** Sequences that do not fit: B before A, or further apart than the delay allows. Not counted. */
  outOfOrder?: number;
  first?: ISODate;
  last?: ISODate;
  /** Of the episodes above, the ones the record showed by itself (recorded states, not your confirmation). */
  fromRecord?: { fits: number; contrast: number; exceptions: number; elsewhere: number; outside: number };
  /** Episodes where your reading and what was recorded point different ways. */
  conflicts?: number;
  /** Direct predictions from this claim that held, or failed. */
  predictionsHeld?: number;
  predictionsFailed?: number;
  /** How often the outcome goes that way anyway. */
  baseRate?: BaseRate;
  /** It goes that way most times anyway, so "A came first" says little on its own. */
  happensAnyway?: boolean;
  /** Something else (a common cause, a rival) could produce the same evidence. */
  needsTellingApart?: boolean;
  /** Supporting episodes where the common causes and rivals were not doing the same. */
  toldApart?: number;
}

const kindOf = (e: Evidence) => e.kind ?? 'instance';

/**
 * The longest delay a claim allows between its cause and its effect, in days,
 * read from its "typical delay". Four weeks when nothing is said.
 */
export const lagWindow = window;

/** Whether an instance drawn from two records is in order, and within the delay the claim allows. */
function inOrder(data: AtlasData, claim: Claim, e: Evidence): boolean {
  if (!e.cause) return true;
  const a = sourceDate(data, e.cause);
  const b = sourceDate(data, e.source);
  if (!a || !b) return false;
  const gap = daysBetween(a, b);
  return gap >= 0 && gap <= lagWindow(claim);
}

/** The episode a piece of evidence belongs to. */
export const evidenceEpisode = (data: AtlasData, e: Evidence) => episodeKeyOf(data, e.source, sourceDate(data, e.source));

/** Recorded rows for the episodes you have not judged yourself, and where the two disagree. */
export function recordRows(data: AtlasData, claim: Claim): { counted: CaseRow[]; conflicts: CaseRow[]; judged: Set<string> } {
  const judged = new Set(claim.evidence.filter((e) => kindOf(e) !== 'intervention' && kindOf(e) !== 'mechanism').map((e) => evidenceEpisode(data, e)));
  const rows = caseRows(data, claim);
  const counted = rows.filter((r) => !judged.has(r.episode) && r.verdict !== 'outside');
  const supportIn = new Set(
    claim.evidence.filter((e) => e.stance === 'supports' && (kindOf(e) === 'instance' || kindOf(e) === 'contrast')).map((e) => evidenceEpisode(data, e)),
  );
  const counterIn = new Set(claim.evidence.filter((e) => e.stance === 'counters' && kindOf(e) !== 'intervention').map((e) => evidenceEpisode(data, e)));
  const conflicts = rows.filter(
    (r) => (supportIn.has(r.episode) && (r.verdict === 'exception' || r.verdict === 'elsewhere')) || (counterIn.has(r.episode) && r.verdict === 'fits'),
  );
  return { counted, conflicts, judged };
}

export function evidenceProfile(data: AtlasData, claim: Claim): EvidenceProfile {
  const dated = claim.evidence.map((e) => ({ e, date: sourceDate(data, e.source), ep: evidenceEpisode(data, e) }));
  const supports = dated.filter((x) => x.e.stance === 'supports');
  const counters = dated.filter((x) => x.e.stance === 'counters');
  const ordered = supports.filter((x) => kindOf(x.e) !== 'instance' || inOrder(data, claim, x.e));
  const { counted, conflicts } = recordRows(data, claim);
  const recorded = (v: CaseRow['verdict']) => counted.filter((r) => r.verdict === v);

  const unlockedTests = supports.filter((x) => kindOf(x.e) === 'intervention' && !(x.e.source.kind === 'experiment' && predictionLocked(data, x.e.source.id)));
  const episodes = new Set([
    ...ordered.filter((x) => kindOf(x.e) === 'instance' || kindOf(x.e) === 'contrast').map((x) => x.ep),
    ...unlockedTests.map((x) => x.ep),
    ...recorded('fits').map((r) => r.episode),
    ...recorded('contrast').map((r) => r.episode),
  ]);
  const contrast = new Set([...ordered.filter((x) => kindOf(x.e) === 'contrast').map((x) => x.ep), ...recorded('contrast').map((r) => r.episode)]);
  const counter = new Set([...counters.filter((x) => kindOf(x.e) !== 'intervention').map((x) => x.ep), ...recorded('exception').map((r) => r.episode)]);

  // Times that fit, told apart from what else could produce them.
  const needs = needsTellingApart(data, claim);
  const withCause = pushes(claim.effect, 'more');
  const toldApart = needs
    ? new Set([
        ...ordered.filter((x) => kindOf(x.e) === 'instance' && x.date && othersAt(data, claim, x.date, withCause).toldApart).map((x) => x.ep),
        ...recorded('fits')
          .filter((r) => r.toldApart)
          .map((r) => r.episode),
      ]).size
    : 0;

  const predictions = predictionCounts(data, claim.id);
  // A test counts as a test only if its prediction was written down before it began; otherwise it is one more time it happened.
  const locked = (e: Evidence) => e.source.kind === 'experiment' && predictionLocked(data, e.source.id);
  const base = baseRate(data, claim);
  const dates = dated
    .map((x) => x.date)
    .filter((d): d is ISODate => Boolean(d))
    .sort();
  return {
    instances: ordered.filter((x) => kindOf(x.e) === 'instance').length,
    episodes: episodes.size,
    contrast: contrast.size,
    mechanism: supports.some((x) => kindOf(x.e) === 'mechanism'),
    mechanismDescribed: Boolean(claim.via?.trim()),
    testsFor: supports.filter((x) => kindOf(x.e) === 'intervention' && locked(x.e)).length,
    testsAgainst: counters.filter((x) => kindOf(x.e) === 'intervention' && locked(x.e)).length,
    counter: counter.size,
    elsewhere: dated.filter((x) => kindOf(x.e) === 'elsewhere').length + recorded('elsewhere').length,
    outOfOrder: supports.length - ordered.length,
    first: dates[0],
    last: dates[dates.length - 1],
    fromRecord: {
      fits: recorded('fits').length,
      contrast: recorded('contrast').length,
      exceptions: recorded('exception').length,
      elsewhere: recorded('elsewhere').length,
      outside: caseRows(data, claim).filter((r) => r.verdict === 'outside').length,
    },
    conflicts: conflicts.length,
    predictionsHeld: predictions.held,
    predictionsFailed: predictions.failed,
    baseRate: base,
    happensAnyway: happensAnyway(base),
    needsTellingApart: needs,
    toldApart,
  };
}

export function statusFromProfile(p: EvidenceProfile, retired = false): ClaimStatus {
  if (retired) return 'retired';
  const held = p.predictionsHeld ?? 0;
  const support = p.episodes + p.testsFor + held + (p.mechanism ? 1 : 0);
  const against = p.counter + (p.predictionsFailed ?? 0);
  // A failed test is not cancelled by a passed one: as many failures as passes is not "tested".
  if (p.testsAgainst > 0 && p.testsAgainst >= p.testsFor) return 'weakened';
  if (against >= 2 && against > support) return 'weakened';
  if (p.testsFor > 0) return 'tested';
  // When the outcome goes that way most times anyway, times that fit say little without a time without the cause.
  const saysLittle = Boolean(p.happensAnyway) && p.contrast === 0 && !p.mechanism && held === 0;
  if (saysLittle) return 'proposed';
  // Keeps showing up: repeated, with a time without it, told apart from what else could produce it, and exceptions well in the minority.
  if (p.episodes >= 3 && p.contrast >= 1 && p.episodes > 2 * p.counter && (!p.needsTellingApart || (p.toldApart ?? 0) >= 1)) return 'supported';
  if (p.episodes >= 2 || (p.episodes >= 1 && p.mechanism) || held >= 1) return 'plausible';
  return 'proposed';
}

export function claimStatus(data: AtlasData, claim: Claim): ClaimStatus {
  // Keyed on what can change in place (in tests and drafts): the evidence and whether it was retired.
  return cachedOn(data, claim, `status:${claim.evidence.length}:${claim.retired ? 1 : 0}`, () =>
    statusFromProfile(evidenceProfile(data, claim), Boolean(claim.retired)),
  );
}

/** An end of a claim that is a whole thing rather than a factor, with nothing said about what changes. */
export function unnamedAspects(data: AtlasData, claim: Claim): ID[] {
  const out: ID[] = [];
  const check = (id: ID, aspect?: string) => {
    const n = data.nodes[id];
    if (n && !isFactorKind(n.kind) && !aspect?.trim()) out.push(id);
  };
  check(claim.from, claim.aspect?.from);
  check(claim.to, claim.aspect?.to);
  return out;
}

/** What would strengthen a claim, or tell it apart from its rivals, in plain words. */
export function claimGaps(data: AtlasData, claim: Claim): string[] {
  const p = evidenceProfile(data, claim);
  const out: string[] = [];
  for (const id of unnamedAspects(data, claim))
    out.push(t('Say what about “{name}” changes: the thing itself is not the cause.', { name: displayNode(data, id)?.label ?? '' }));
  if (p.episodes === 0) out.push(t('No time yet where A came first and then B.'));
  else if (p.episodes < 3) out.push(tn(p.episodes, 'Seen in {n} episode; three make it a regularity.', 'Seen in {n} episodes; three make it a regularity.'));
  if (!p.mechanism)
    out.push(
      p.mechanismDescribed
        ? t('How it may work is described, not yet seen: a passage where it happens would count.')
        : t('No mechanism: how would A lead to B?'),
    );
  if (p.contrast === 0) out.push(t('No contrast case: a time without A, and what happened to B.'));
  if (p.testsFor + p.testsAgainst === 0) out.push(t('Not tested by a deliberate change.'));
  if (p.outOfOrder)
    out.push(tn(p.outOfOrder, '{n} sequence does not fit: B came first, or too long after.', '{n} sequences do not fit: B came first, or too long after.'));
  const rivals = claim.rivalIds.filter((id) => data.claims[id]?.state === 'adopted').length;
  if (rivals) out.push(tn(rivals, '{n} rival explanation is still open.', '{n} rival explanations are still open.'));
  if (p.happensAnyway && p.contrast === 0)
    out.push(
      t('{outcome} goes that way most times anyway: a time without the cause would tell more than another time with it.', {
        outcome: nodeLabel(data, claim.to),
      }),
    );
  if (p.needsTellingApart && !p.toldApart) {
    const names = [...commonCauses(data, claim).map((c) => c.factor), ...rivalsOf(data, claim).map((r) => r.from)].map((id) => nodeLabel(data, id));
    out.push(t('Nothing yet tells it apart from {names}: a time when this was there and they were not.', { names: [...new Set(names)].join(', ') }));
  }
  if (p.conflicts)
    out.push(
      tn(
        p.conflicts,
        'In {n} episode, your reading and what was recorded point different ways.',
        'In {n} episodes, your reading and what was recorded point different ways.',
      ),
    );
  return out;
}

const nodeLabel = (data: AtlasData, id: ID) => displayNode(data, id)?.label ?? t('(deleted)');

/** An end of a claim as a factor: the element, and what about it changes when that is said. */
export function factorLabel(data: AtlasData, id: ID, aspect?: string): string {
  const label = nodeLabel(data, id);
  return aspect?.trim() ? t('{thing} ({aspect})', { thing: label, aspect: aspect.trim() }) : label;
}

/**
 * "Active commitments may lower Night Ferry progress (in deadline weeks)",
 * hedged by what the evidence supports; a tested claim says it was tested.
 */
export function claimSentence(data: AtlasData, claim: Claim, status: ClaimStatus = claimStatus(data, claim)): string {
  const cause = factorLabel(data, claim.from, claim.aspect?.from);
  const from = claim.with.length ? t('{a}, together with {b},', { a: cause, b: claim.with.map((id) => nodeLabel(data, id)).join(', ') }) : cause;
  const when = [
    claim.when?.trim(),
    claim.condition && data.nodes[claim.condition.factor] ? conditionPhrase(nodeLabel(data, claim.condition.factor), claim.condition.reads) : '',
  ]
    .filter(Boolean)
    .join('; ');
  const failed = claim.evidence.some((e) => e.kind === 'intervention' && e.stance === 'counters');
  const tested = status === 'tested' ? ` ${failed ? t('when you tested it, though not every time') : t('when you tested it')}` : '';
  return `${from} ${effectPhrase(claim.effect, status)} ${factorLabel(data, claim.to, claim.aspect?.to)}${when ? ` (${when})` : ''}${tested}`;
}

/** The role a claim gives its cause, and the direction it pushes the outcome. */
export const claimRole = (claim: Pick<Claim, 'effect'>) => EFFECT_META[claim.effect].role;

export const claimCode = (code: number) => t('Reason {code}', { code: String(code).padStart(2, '0') });

/** Claims the person has on their map (adopted, still holding or not). */
export const activeClaims = (data: AtlasData) => Object.values(data.claims).filter((c) => c.state === 'adopted');

/** What affects an element: adopted claims pointing into it. */
export function claimsInto(data: AtlasData, id: ID): Claim[] {
  return activeClaims(data)
    .filter((c) => c.to === id)
    .sort(byStrength(data));
}

/** What an element affects: adopted claims out of it (or where it is a joint condition). */
export function claimsOutOf(data: AtlasData, id: ID): Claim[] {
  return activeClaims(data)
    .filter((c) => c.from === id || c.with.includes(id))
    .sort(byStrength(data));
}

export const byStrength = (data: AtlasData) => (a: Claim, b: Claim) =>
  STATUS_META[claimStatus(data, b)].rank - STATUS_META[claimStatus(data, a)].rank || a.code - b.code;

export function claimsTouching(data: AtlasData, id: ID): Claim[] {
  return activeClaims(data).filter((c) => c.from === id || c.to === id || c.with.includes(id));
}

/**
 * Other claims about the same outcome. Most contribute alongside this one
 * (several things can be true at once); rivals compete with it: if one
 * holds, the other may not be needed.
 */
export function otherExplanations(data: AtlasData, claim: Claim): { claim: Claim; rival: boolean }[] {
  return activeClaims(data)
    .filter((c) => c.id !== claim.id && c.to === claim.to)
    .map((c) => ({ claim: c, rival: areRivals(claim, c) }))
    .sort((a, b) => Number(b.rival) - Number(a.rival) || byStrength(data)(a.claim, b.claim));
}

export const areRivals = rivals;

export interface EvidenceCandidate {
  source: { kind: 'entry'; id: ID } | { kind: 'decision'; id: ID } | { kind: 'occurrence'; id: ID };
  date: ISODate;
  title: string;
  body: string;
  /**
   * Which sides of the claim the record mentions. Both: a possible instance,
   * if it tells A first and then B, or a place where the "how" shows. The
   * cause only: a possible exception, if B did not follow. (The outcome
   * alone is not offered: B without A is another route to B, not a case
   * against A.)
   */
  sides: 'both' | 'from';
}

/** Records that might bear on a claim, found through what they are linked to. You judge what each shows. */
export function evidenceCandidates(data: AtlasData, claim: Claim): EvidenceCandidate[] {
  const used = new Set(claim.evidence.map((e) => `${e.source.kind}:${e.source.id}`));
  const from = new Set([claim.from, ...claim.with]);
  const side = (ids: ID[]): EvidenceCandidate['sides'] | null => {
    const a = ids.some((id) => from.has(id));
    const b = ids.includes(claim.to);
    return a && b ? 'both' : a ? 'from' : null;
  };
  const out: EvidenceCandidate[] = [];
  const push = (c: EvidenceCandidate) => !used.has(`${c.source.kind}:${c.source.id}`) && out.push(c);
  for (const e of Object.values(data.entries) as Entry[]) {
    const s = side(e.nodeIds);
    if (s) push({ source: { kind: 'entry', id: e.id }, date: e.date, title: e.title, body: e.content, sides: s });
  }
  for (const d of Object.values(data.decisions) as Decision[]) {
    const s = side(d.nodeIds);
    if (s) push({ source: { kind: 'decision', id: d.id }, date: d.date, title: d.title, body: d.actualOutcome ?? d.context, sides: s });
  }
  for (const o of Object.values(data.occurrences) as Occurrence[]) {
    if (o.mode !== 'actual' || (o.source && used.has(`${o.source.kind}:${o.source.id}`))) continue;
    const s = side([...o.about, ...(o.instanceOf ? [o.instanceOf] : [])]);
    if (s) push({ source: { kind: 'occurrence', id: o.id }, date: o.date, title: o.label, body: o.excerpt ?? '', sides: s });
  }
  const rank = { both: 0, from: 1 };
  return out.sort((a, b) => rank[a.sides] - rank[b.sides] || b.date.localeCompare(a.date));
}

/**
 * Only what actually happened can be evidence: a note, a decision, a
 * happening in history, or a test that has a result. Plans, expectations and
 * imagined branches never count, whatever they say.
 */
export function canBeEvidence(data: AtlasData, ref: SourceRef): boolean {
  if (ref.kind === 'entry') return ref.id in data.entries;
  if (ref.kind === 'decision') return ref.id in data.decisions;
  if (ref.kind === 'occurrence') return data.occurrences[ref.id]?.mode === 'actual';
  return Boolean(data.experiments[ref.id]?.result);
}

/* ---------------- episodes from history ---------------- */

/** A dated record in history, as a source that evidence can point at. */
export function historySource(h: HistoryItem): SourceRef | undefined {
  const r = h.ref;
  return r.kind === 'entry' || r.kind === 'decision' || r.kind === 'occurrence' || r.kind === 'experiment' ? { kind: r.kind, id: r.id } : undefined;
}

export interface OrderedEpisode {
  /** The moment showing the cause. */
  cause: HistoryItem;
  /** The moment showing the outcome, on or after it, within the claim's delay. */
  effect: HistoryItem;
  days: number;
  /** The episode it falls in. */
  week: string;
}

/**
 * Times in history where the cause came first and the outcome followed within
 * the claim's delay: the ordered sequences that could be instances. Found by
 * date, never counted until you confirm one: coming before is a reason to
 * look, not proof. One per week, newest first, leaving out weeks already counted.
 */
export function orderedEpisodes(data: AtlasData, claim: Claim, limit = 6): OrderedEpisode[] {
  const window = lagWindow(claim);
  const causes = new Set([claim.from, ...claim.with]);
  const items = historyItems(data, { records: true }).filter((h) => h.mode === 'actual' && h.kind !== 'reading' && historySource(h));
  const about = (h: HistoryItem, ids: Set<ID>) => h.about.some((a) => ids.has(a)) || (h.instanceOf !== undefined && ids.has(h.instanceOf));
  const aMoments = items.filter((h) => about(h, causes));
  const bMoments = items.filter((h) => about(h, new Set([claim.to])));
  const counted = new Set(claim.evidence.filter((e) => e.stance === 'supports').map((e) => evidenceEpisode(data, e)));
  const out: OrderedEpisode[] = [];
  const seen = new Set<string>();
  for (const b of bMoments) {
    const source = historySource(b)!;
    const episode = episodeKeyOf(data, source, b.date);
    if (counted.has(episode) || seen.has(episode)) continue;
    // The latest cause moment before it, within the delay, from a different record.
    const a = aMoments.find((x) => x.key !== b.key && x.date <= b.date && x.date >= addDays(b.date, -window) && !about(x, new Set([claim.to])));
    if (!a) continue;
    seen.add(episode);
    out.push({ cause: a, effect: b, days: daysBetween(a.date, b.date), week: episode });
    if (out.length >= limit) break;
  }
  return out;
}
