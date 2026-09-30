/**
 * Claims: possible explanations of how a change in one factor may contribute
 * to a change in another.
 *
 * A claim's status is derived from its evidence, never typed in, and the
 * kind of evidence matters more than the count:
 *
 *   proposed   stated, nothing behind it yet: a hunch
 *   plausible  it happened in that order in at least two separate episodes, or
 *              in one where the "how" was also seen happening
 *   supported  three or more episodes, and at least one time without it
 *   tested     a deliberate change produced the predicted difference
 *   weakened   a failed test, or exceptions that outweigh the support
 *   retired    it held for a while, then stopped (people change)
 *
 * What does not count, by design:
 *   - a written "how": it is an explanation to check, not evidence that it happened;
 *   - the outcome happening without the factor: that shows another route to
 *     the outcome (other contributors, chance, what is not on the map), not a
 *     case against this one. Only "the factor was there and the outcome did
 *     not follow" is an exception;
 *   - a sequence in the wrong order, or further apart than the claim's delay;
 *   - several records of one episode: everything is counted per week, for and against.
 */
import { effectPhrase, EFFECT_META, isFactorKind, STATUS_META } from './constants';
import { historyItems, type HistoryItem } from './history';
import { displayNode, resolveSource } from './selectors';
import { addDays, daysBetween, weekStart } from '../lib/dates';
import type { AtlasData, Claim, ClaimStatus, Entry, Decision, Evidence, ID, ISODate, Occurrence, SourceRef } from './types';
import { t, tn } from '../i18n';

export interface EvidenceProfile {
  /** Supporting instances: A, then B. */
  instances: number;
  /** Separate weeks with an instance or a contrast. */
  episodes: number;
  /** Separate weeks without A, where B did not happen either. */
  contrast: number;
  /** The "how" seen happening in a passage. */
  mechanism: boolean;
  /** The "how" only described in words (not evidence). */
  mechanismDescribed?: boolean;
  testsFor: number;
  testsAgainst: number;
  /** Separate weeks where A was there and B did not follow. */
  counter: number;
  /** Times B happened without A: other routes to B, counted for the unexplained part, never against. */
  elsewhere?: number;
  /** Sequences that do not fit: B before A, or further apart than the delay allows. Not counted. */
  outOfOrder?: number;
  first?: ISODate;
  last?: ISODate;
}

const kindOf = (e: Evidence) => e.kind ?? 'instance';
const episodeOf = (date: ISODate | undefined, fallback: string) => (date ? weekStart(date) : fallback);

/**
 * The longest delay a claim allows between its cause and its effect, in days,
 * read from its "typical delay" ("1–4 days", "2–6 weeks", "a month"). Four
 * weeks when nothing is said.
 */
export function lagWindow(claim: Pick<Claim, 'lag'>): number {
  const text = claim.lag?.toLowerCase() ?? '';
  if (!text.trim()) return 28;
  const numbers = [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((m) => Number(m[0].replace(',', '.')));
  const most = numbers.length ? Math.max(...numbers) : 1;
  const unit = /month|bulan/.test(text) ? 30 : /week|minggu|pekan/.test(text) ? 7 : /day|hari/.test(text) ? 1 : 7;
  return Math.max(1, Math.round(most * unit));
}

/** Whether an instance drawn from two records is in order, and within the delay the claim allows. */
function inOrder(data: AtlasData, claim: Claim, e: Evidence): boolean {
  if (!e.cause) return true;
  const a = resolveSource(data, e.cause).date;
  const b = resolveSource(data, e.source).date;
  if (!a || !b) return false;
  const gap = daysBetween(a, b);
  return gap >= 0 && gap <= lagWindow(claim);
}

export function evidenceProfile(data: AtlasData, claim: Claim): EvidenceProfile {
  const dated = claim.evidence.map((e) => ({ e, date: resolveSource(data, e.source).date }));
  const supports = dated.filter((x) => x.e.stance === 'supports');
  const counters = dated.filter((x) => x.e.stance === 'counters');
  const ordered = supports.filter((x) => kindOf(x.e) !== 'instance' || inOrder(data, claim, x.e));
  const episodic = ordered.filter((x) => kindOf(x.e) === 'instance' || kindOf(x.e) === 'contrast');
  const weeks = (list: typeof dated) => new Set(list.map((x) => episodeOf(x.date, x.e.id))).size;
  const dates = dated
    .map((x) => x.date)
    .filter((d): d is ISODate => Boolean(d))
    .sort();
  return {
    instances: ordered.filter((x) => kindOf(x.e) === 'instance').length,
    episodes: weeks(episodic),
    contrast: weeks(ordered.filter((x) => kindOf(x.e) === 'contrast')),
    mechanism: supports.some((x) => kindOf(x.e) === 'mechanism'),
    mechanismDescribed: Boolean(claim.via?.trim()),
    testsFor: supports.filter((x) => kindOf(x.e) === 'intervention').length,
    testsAgainst: counters.filter((x) => kindOf(x.e) === 'intervention').length,
    counter: weeks(counters.filter((x) => kindOf(x.e) !== 'intervention')),
    elsewhere: dated.filter((x) => kindOf(x.e) === 'elsewhere').length,
    outOfOrder: supports.length - ordered.length,
    first: dates[0],
    last: dates[dates.length - 1],
  };
}

export function statusFromProfile(p: EvidenceProfile, retired = false): ClaimStatus {
  if (retired) return 'retired';
  const support = p.episodes + p.testsFor + (p.mechanism ? 1 : 0);
  if (p.testsAgainst > p.testsFor) return 'weakened';
  if (p.counter >= 2 && p.counter > support) return 'weakened';
  if (p.testsFor > 0) return 'tested';
  if (p.episodes >= 3 && p.contrast >= 1) return 'supported';
  if (p.episodes >= 2 || (p.episodes >= 1 && p.mechanism)) return 'plausible';
  return 'proposed';
}

export function claimStatus(data: AtlasData, claim: Claim): ClaimStatus {
  return statusFromProfile(evidenceProfile(data, claim), Boolean(claim.retired));
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
  const when = claim.when?.trim() ? ` (${claim.when.trim()})` : '';
  const tested = status === 'tested' ? ` ${t('when you tested it')}` : '';
  return `${from} ${effectPhrase(claim.effect, status)} ${factorLabel(data, claim.to, claim.aspect?.to)}${when}${tested}`;
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

export const areRivals = (a: Claim, b: Claim) => a.rivalIds.includes(b.id) || b.rivalIds.includes(a.id);

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
  week: ISODate;
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
  const counted = new Set(
    claim.evidence
      .filter((e) => e.stance === 'supports')
      .map((e) => resolveSource(data, e.source).date)
      .filter((d): d is ISODate => Boolean(d))
      .map((d) => weekStart(d)),
  );
  const out: OrderedEpisode[] = [];
  const weeks = new Set<ISODate>();
  for (const b of bMoments) {
    const week = weekStart(b.date);
    if (counted.has(week) || weeks.has(week)) continue;
    // The latest cause moment before it, within the delay, from a different record.
    const a = aMoments.find((x) => x.key !== b.key && x.date <= b.date && x.date >= addDays(b.date, -window) && !about(x, new Set([claim.to])));
    if (!a) continue;
    weeks.add(week);
    out.push({ cause: a, effect: b, days: daysBetween(a.date, b.date), week });
    if (out.length >= limit) break;
  }
  return out;
}
