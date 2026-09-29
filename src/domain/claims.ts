/**
 * Claims: explanations of how one thing changes another.
 *
 * A claim's status is derived from its evidence, never typed in, and the
 * kind of evidence matters more than the count:
 *
 *   proposed   stated, nothing behind it yet
 *   plausible  instances in at least two episodes, or one with a described mechanism
 *   supported  three or more episodes, and at least one contrast case
 *   tested     a deliberate change produced the predicted difference
 *   weakened   a failed test, or counter-evidence that outweighs the support
 *   retired    it held for a while, then stopped (people change)
 *
 * The unit of an instance is the episode (a week), not the note: five notes
 * about the same week are one instance.
 */
import { effectPhrase, STATUS_META } from './constants';
import { displayNode, resolveSource } from './selectors';
import { weekStart } from '../lib/dates';
import type { AtlasData, Claim, ClaimStatus, Entry, Decision, Evidence, ID, ISODate, Occurrence } from './types';
import { t, tn } from '../i18n';

export interface EvidenceProfile {
  /** Supporting instances (a time A came before B). */
  instances: number;
  /** Separate weeks those instances fall in. */
  episodes: number;
  contrast: number;
  /** A mechanism is described (in the claim or in a passage). */
  mechanism: boolean;
  testsFor: number;
  testsAgainst: number;
  /** Counter-cases and challenging evidence of any kind. */
  counter: number;
  first?: ISODate;
  last?: ISODate;
}

const kindOf = (e: Evidence) => e.kind ?? 'instance';

export function evidenceProfile(data: AtlasData, claim: Claim): EvidenceProfile {
  const dated = claim.evidence.map((e) => ({ e, date: resolveSource(data, e.source).date }));
  const supports = dated.filter((x) => x.e.stance === 'supports');
  const counters = dated.filter((x) => x.e.stance === 'counters');
  const episodic = supports.filter((x) => kindOf(x.e) === 'instance' || kindOf(x.e) === 'contrast');
  const weeks = new Set(episodic.map((x) => (x.date ? weekStart(x.date) : x.e.id)));
  const dates = dated
    .map((x) => x.date)
    .filter((d): d is ISODate => Boolean(d))
    .sort();
  return {
    instances: supports.filter((x) => kindOf(x.e) === 'instance').length,
    episodes: weeks.size,
    contrast: supports.filter((x) => kindOf(x.e) === 'contrast').length,
    mechanism: Boolean(claim.via?.trim()) || supports.some((x) => kindOf(x.e) === 'mechanism'),
    testsFor: supports.filter((x) => kindOf(x.e) === 'intervention').length,
    testsAgainst: counters.filter((x) => kindOf(x.e) === 'intervention').length,
    counter: counters.length,
    first: dates[0],
    last: dates[dates.length - 1],
  };
}

export function statusFromProfile(p: EvidenceProfile, retired = false): ClaimStatus {
  if (retired) return 'retired';
  const support = p.instances + p.contrast + p.testsFor + (p.mechanism ? 1 : 0);
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

/** What would strengthen a claim, in plain words. */
export function claimGaps(data: AtlasData, claim: Claim): string[] {
  const p = evidenceProfile(data, claim);
  const out: string[] = [];
  if (p.episodes === 0) out.push(t('No instance yet: a time A came before B.'));
  else if (p.episodes < 3) out.push(tn(p.episodes, 'Seen in {n} episode; three make it a regularity.', 'Seen in {n} episodes; three make it a regularity.'));
  if (!p.mechanism) out.push(t('No mechanism: how would A lead to B?'));
  if (p.contrast === 0) out.push(t('No contrast case: a time without A, and what happened to B.'));
  if (p.testsFor + p.testsAgainst === 0) out.push(t('Not tested by a deliberate change.'));
  const rivals = claim.rivalIds.filter((id) => data.claims[id]?.state === 'adopted').length;
  if (rivals) out.push(tn(rivals, '{n} rival explanation is still open.', '{n} rival explanations are still open.'));
  return out;
}

const nodeLabel = (data: AtlasData, id: ID) => displayNode(data, id)?.label ?? t('(deleted)');

/** "Active commitments may lower Night Ferry progress", hedged by what the evidence supports. */
export function claimSentence(data: AtlasData, claim: Claim, status: ClaimStatus = claimStatus(data, claim)): string {
  const from = claim.with.length
    ? t('{a}, together with {b},', { a: nodeLabel(data, claim.from), b: claim.with.map((id) => nodeLabel(data, id)).join(', ') })
    : nodeLabel(data, claim.from);
  return `${from} ${effectPhrase(claim.effect, status)} ${nodeLabel(data, claim.to)}`;
}

export const claimCode = (code: number) => t('Claim {code}', { code: String(code).padStart(2, '0') });

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

/** Other claims about the same effect: co-contributors, or explicit rivals. */
export function otherExplanations(data: AtlasData, claim: Claim): { claim: Claim; rival: boolean }[] {
  return activeClaims(data)
    .filter((c) => c.id !== claim.id && c.to === claim.to)
    .map((c) => ({ claim: c, rival: claim.rivalIds.includes(c.id) || c.rivalIds.includes(claim.id) }))
    .sort((a, b) => Number(b.rival) - Number(a.rival) || byStrength(data)(a.claim, b.claim));
}

export interface EvidenceCandidate {
  source: { kind: 'entry'; id: ID } | { kind: 'decision'; id: ID } | { kind: 'occurrence'; id: ID };
  date: ISODate;
  title: string;
  body: string;
  /** Which sides of the claim the record mentions. */
  sides: 'both' | 'from' | 'to';
}

/**
 * Records that might bear on a claim, found through what they are linked to:
 * those mentioning both sides are candidate instances; one side only are
 * candidate counter-cases (A without B, or B without A).
 */
export function evidenceCandidates(data: AtlasData, claim: Claim): EvidenceCandidate[] {
  const used = new Set(claim.evidence.map((e) => `${e.source.kind}:${e.source.id}`));
  const from = new Set([claim.from, ...claim.with]);
  const side = (ids: ID[]): EvidenceCandidate['sides'] | null => {
    const a = ids.some((id) => from.has(id));
    const b = ids.includes(claim.to);
    return a && b ? 'both' : a ? 'from' : b ? 'to' : null;
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
  const rank = { both: 0, from: 1, to: 2 };
  return out.sort((a, b) => rank[a.sides] - rank[b.sides] || b.date.localeCompare(a.date));
}
