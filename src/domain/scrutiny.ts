/**
 * Holding a claim up to what else could explain the same evidence, and to
 * time. Nothing here changes a status on its own; it says what to look at.
 *
 *   common causes   factors with claims into both ends: they could produce A and B together
 *   the other way   a claim that B changes A: the order may run backwards
 *   rivals          explanations marked as competing
 *   shared episodes other explanations of B resting on the very same episodes:
 *                   the same times read two ways, not two confirmations
 *   back from an extreme  times B moved after being at its other extreme: some
 *                   of that comes anyway, as things drift back toward usual
 *   stopped holding it held, and the latest times it did not
 *   a condition     a factor that was one way whenever it held and not when it
 *                   did not: maybe it only holds then
 *   delays seen     how long it took in the times the record shows
 *   written later   supporting moments written down days after they happened
 */
import { claimsInto, evidenceEpisode, recordRows } from './claims';
import { backFromExtreme, candidateCondition, commonCauses, delaysSeen, lagRange, liveClaims, rivalsOf, type CommonCause } from './compare';
import { sourceDate } from './factors';
import { daysBetween } from '../lib/dates';
import type { AtlasData, Claim, ID, ISODate } from './types';

const kindOf = (k?: string) => k ?? 'instance';

/** The episodes that support a claim: confirmed times it happened or times without it, and the record's own. */
export function supportEpisodes(data: AtlasData, claim: Claim): Set<string> {
  const { counted } = recordRows(data, claim);
  return new Set([
    ...claim.evidence
      .filter((e) => e.stance === 'supports' && (kindOf(e.kind) === 'instance' || kindOf(e.kind) === 'contrast'))
      .map((e) => evidenceEpisode(data, e)),
    ...counted.filter((r) => r.verdict === 'fits' || r.verdict === 'contrast').map((r) => r.episode),
  ]);
}

/** Dated times it held and times it did not, oldest first. */
function timeline(data: AtlasData, claim: Claim): { date: ISODate; held: boolean }[] {
  const { counted } = recordRows(data, claim);
  const out: { date: ISODate; held: boolean }[] = [];
  for (const e of claim.evidence) {
    const k = kindOf(e.kind);
    const date = sourceDate(data, e.source);
    if (!date || k === 'mechanism' || k === 'elsewhere') continue;
    if (e.stance === 'supports' && (k === 'instance' || k === 'contrast' || k === 'intervention')) out.push({ date, held: true });
    if (e.stance === 'counters') out.push({ date, held: false });
  }
  for (const r of counted) {
    if (r.verdict === 'fits' || r.verdict === 'contrast') out.push({ date: r.outcome.date, held: true });
    if (r.verdict === 'exception') out.push({ date: r.outcome.date, held: false });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export interface Scrutiny {
  commons: CommonCause[];
  reverse: Claim[];
  rivals: Claim[];
  shared: { claim: Claim; episodes: number; of: number }[];
  backFromExtreme: number;
  /** It held, and then the latest times it did not. */
  stopped?: { heldUntil: ISODate; since: number };
  condition?: { factor: ID; reads: 'high' | 'low'; held: number; failed: number };
  delays?: [number, number];
  stated: [number, number];
  /** Supporting moments written down three or more days after they happened. */
  writtenLater: number;
}

export function scrutinize(data: AtlasData, claim: Claim): Scrutiny {
  const mine = supportEpisodes(data, claim);
  const shared = claimsInto(data, claim.to)
    .filter((c) => c.id !== claim.id && !c.retired)
    .map((c) => {
      const theirs = supportEpisodes(data, c);
      return { claim: c, episodes: [...mine].filter((e) => theirs.has(e)).length, of: mine.size };
    })
    .filter((x) => x.episodes > 0);

  const line = timeline(data, claim);
  let trailing = 0;
  for (let i = line.length - 1; i >= 0 && !line[i].held; i--) trailing++;
  const heldTimes = line.filter((x) => x.held);
  const stopped = trailing >= 2 && heldTimes.length >= 2 && !claim.retired ? { heldUntil: heldTimes[heldTimes.length - 1].date, since: trailing } : undefined;

  const condition = claim.condition
    ? undefined
    : candidateCondition(
        data,
        claim,
        heldTimes.map((x) => x.date),
        line.filter((x) => !x.held).map((x) => x.date),
      );

  const confirmedDelays = claim.evidence
    .filter((e) => e.stance === 'supports' && e.cause)
    .map((e) => {
      const a = sourceDate(data, e.cause!);
      const b = sourceDate(data, e.source);
      return a && b ? daysBetween(a, b) : undefined;
    })
    .filter((d): d is number => d !== undefined && d >= 0);

  const later = (occurrenceId: ID) => {
    const o = data.occurrences[occurrenceId];
    const written = o?.source ? sourceDate(data, o.source) : undefined;
    return Boolean(o && written && daysBetween(o.date, written) >= 3);
  };
  const writtenLater =
    claim.evidence.filter((e) => e.stance === 'supports' && e.source.kind === 'occurrence' && later(e.source.id)).length +
    recordRows(data, claim).counted.filter((r) => r.verdict === 'fits' && r.outcome.item?.ref.kind === 'occurrence' && later(r.outcome.item.ref.id)).length;

  return {
    commons: commonCauses(data, claim),
    reverse: liveClaims(data).filter((c) => c.from === claim.to && c.to === claim.from),
    rivals: rivalsOf(data, claim),
    shared,
    backFromExtreme: backFromExtreme(data, claim),
    stopped,
    condition,
    delays: delaysSeen(data, claim, confirmedDelays),
    stated: lagRange(claim),
    writtenLater,
  };
}

/** Whether a claim has anything worth looking at beyond its evidence count. */
export const hasScrutiny = (s: Scrutiny) =>
  s.commons.length > 0 ||
  s.reverse.length > 0 ||
  s.shared.length > 0 ||
  s.backFromExtreme > 0 ||
  Boolean(s.stopped) ||
  Boolean(s.condition) ||
  s.writtenLater > 0;
