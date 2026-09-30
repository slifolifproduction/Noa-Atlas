/**
 * Traces: how the Atlas came to what it says about a claim.
 *
 * Every status is derived by a named rule of a versioned logic
 * (`LOGIC_VERSION`). A trace gives, for one claim:
 *
 *   rule     which rule gave its status, in plain words
 *   rests    every record it rests on and what each one showed, marked as the
 *            person's judgement or the record's own comparison
 *   left     what was deliberately not counted, and why
 *   assumes  what the status takes for granted, and cannot yet check
 *   next     what would move it one step
 *
 * A trace is read from the same functions the status comes from, so the two
 * can never disagree.
 */
import { claimGaps, claimRule, evidenceEpisode, evidenceProfile, historySource, LOGIC_VERSION, recordRows, RULE_STATUS, type StatusRule } from './claims';
import { caseRows, commonCauses, conditionsOf, isCumulative, lagRange, rivalsOf, untestedContexts } from './compare';
import { expectationsFor } from './expect';
import { coverage, sourceDate } from './factors';
import { displayNode } from './selectors';
import type { AtlasData, Claim, ClaimStatus, ISODate, SourceRef } from './types';
import { t, tn } from '../i18n';

export { LOGIC_VERSION };

export type Shows = 'fits' | 'contrast' | 'exception' | 'elsewhere' | 'mechanism' | 'test_for' | 'test_against' | 'held' | 'failed' | 'analysis';

export interface TraceItem {
  source: SourceRef;
  date?: ISODate;
  episode?: string;
  shows: Shows;
  /** Your judgement of the record, or the record's own comparison of what changed. */
  by: 'you' | 'record';
}

export interface Trace {
  status: ClaimStatus;
  rule: StatusRule;
  version: number;
  /** The rule, in plain words. */
  says: string;
  rests: TraceItem[];
  left: string[];
  assumes: string[];
  next: string[];
}

export const RULE_TEXT: Record<StatusRule, string> = {
  get retired() {
    return t('It held for a while, then stopped, or was revised into a new version.');
  },
  get 'weakened.tests'() {
    return t('Tests went against it at least as often as for it.');
  },
  get 'weakened.against'() {
    return t('What counts against it (exceptions, predictions that failed) outweighs what supports it.');
  },
  get tested() {
    return t('A deliberate change, with its prediction written down first, made the predicted difference.');
  },
  get anyway() {
    return t('The outcome goes that way most times anyway, and nothing yet shows a time without the cause.');
  },
  get supported() {
    return t('Three or more separate episodes, a time without it, exceptions well in the minority, and told apart from what else could produce it.');
  },
  get 'plausible.episodes'() {
    return t('Seen in at least two separate episodes, in that order.');
  },
  get 'plausible.mechanism'() {
    return t('Seen once, with the “how” seen happening.');
  },
  get 'plausible.prediction'() {
    return t('A prediction written down from it held.');
  },
  get proposed() {
    return t('Stated, with nothing yet behind it: a hunch.');
  },
};

const SHOWS: Record<string, Shows> = {
  instance: 'fits',
  contrast: 'contrast',
  counter_case: 'exception',
  elsewhere: 'elsewhere',
  mechanism: 'mechanism',
  analysis: 'analysis',
};

const name = (data: AtlasData, id: string) => displayNode(data, id)?.label ?? t('(deleted)');

export function claimTrace(data: AtlasData, claim: Claim): Trace {
  const rule = claimRule(data, claim);
  const p = evidenceProfile(data, claim);
  const rests: TraceItem[] = [];

  // What you judged.
  for (const e of claim.evidence) {
    const kind = e.kind ?? 'instance';
    if (kind === 'elsewhere') continue;
    const shows: Shows = kind === 'intervention' ? (e.stance === 'counters' ? 'test_against' : 'test_for') : (SHOWS[kind] ?? 'fits');
    rests.push({ source: e.source, date: sourceDate(data, e.source), episode: evidenceEpisode(data, e), shows, by: 'you' });
  }
  // What the record showed by itself.
  for (const r of recordRows(data, claim).counted) {
    const source = r.outcome.item ? historySource(r.outcome.item) : undefined;
    // Times it happened without the cause are other routes, listed with what was left out.
    if (!source || r.verdict === 'elsewhere') continue;
    const shows: Shows = r.verdict === 'fits' ? 'fits' : r.verdict === 'contrast' ? 'contrast' : r.verdict === 'exception' ? 'exception' : 'elsewhere';
    rests.push({ source, date: r.outcome.date, episode: r.episode, shows, by: 'record' });
  }
  // Predictions from it, written before their window.
  for (const v of expectationsFor(data, claim.id).direct)
    if (v.writtenBefore && (v.verdict === 'held' || v.verdict === 'failed') && v.occurrence.source?.kind !== 'experiment')
      rests.push({ source: { kind: 'occurrence', id: v.occurrence.id }, date: v.until, shows: v.verdict, by: v.by });

  const left: string[] = [];
  if (p.outOfOrder) left.push(tn(p.outOfOrder, 'One sequence: the order or the delay does not fit.', '{n} sequences: the order or the delay does not fit.'));
  if (p.hindsight)
    left.push(
      tn(
        p.hindsight,
        'One time whose order was written down after the outcome was known.',
        '{n} times whose order was written down after the outcome was known.',
      ),
    );
  const outside = caseRows(data, claim).filter((r) => r.verdict === 'outside').length;
  if (outside)
    left.push(
      tn(
        outside,
        'One time outside when it is said to hold: not a test of it either way.',
        '{n} times outside when it is said to hold: not a test of it either way.',
      ),
    );
  const late = expectationsFor(data, claim.id).direct.filter((v) => !v.writtenBefore).length;
  if (late) left.push(tn(late, 'One prediction written after its window began.', '{n} predictions written after their window began.'));
  if (p.mechanismDescribed && !p.mechanism) left.push(t('How it may work, described in words: an explanation to check, not evidence.'));
  if (p.elsewhere)
    left.push(
      tn(
        p.elsewhere,
        'One time the outcome happened without it: another route, not a case against it.',
        '{n} times the outcome happened without it: other routes, not cases against it.',
      ),
    );

  const assumes: string[] = [];
  const a = name(data, claim.from);
  const b = name(data, claim.to);
  if (rule !== 'tested' && rule !== 'retired' && rule !== 'proposed')
    assumes.push(t('That nothing left off the map moves both {a} and {b}. Only a deliberate change can rule that out.', { a, b }));
  if (p.needsTellingApart && !p.toldApart) {
    const others = [...new Set([...commonCauses(data, claim).map((c) => c.factor), ...rivalsOf(data, claim).map((r) => r.from)])].map((id) => name(data, id));
    assumes.push(t('That {others} did not bring it about instead.', { others: others.join(', ') }));
  }
  if (coverage(data, claim.to) !== 'tracked' && rests.length)
    assumes.push(t('That the times {b} was written down are like the times it was not: it is written down mostly when it stands out.', { b }));
  const [lo, hi] = lagRange(claim);
  assumes.push(
    claim.lag
      ? t('That the effect shows within the delay you gave ({lag}).', { lag: claim.lag })
      : t('That the effect shows within {n} days (no delay was given).', { n: hi || lo }),
  );
  if (isCumulative(claim)) assumes.push(t('That it builds when kept up over weeks, not from one change.'));
  if (conditionsOf(claim).length || claim.scope?.from || claim.scope?.until) assumes.push(t('That it holds only within the bounds given for it.'));
  for (const c of untestedContexts(data, claim))
    assumes.push(
      t('That it would hold when {f} was not {state}: it has only been seen when it was.', {
        f: name(data, c.factor),
        state: c.reads === 'high' ? t('high') : t('low'),
      }),
    );

  return {
    status: RULE_STATUS[rule],
    rule,
    version: LOGIC_VERSION,
    says: RULE_TEXT[rule],
    rests: rests.sort((x, y) => (y.date ?? '').localeCompare(x.date ?? '')),
    left,
    assumes,
    next: rule === 'tested' || rule === 'retired' ? [] : claimGaps(data, claim),
  };
}
