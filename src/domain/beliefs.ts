/**
 * Belief history: what the Atlas believed, when, and what changed it.
 *
 * Records are never rewritten; statuses are derived from them. So a belief
 * can change without anyone editing the claim: a new note, a reading, a test
 * result. After every change the Atlas compares what it now derives with
 * what it last believed (the ledger) and logs, in the same append-only model
 * log as everything else:
 *
 *   status_changed   a claim now reads differently, with what caused it,
 *                    the rule that gave the new status and the logic version
 *   challenged       something new counts against a claim (an exception, a
 *                    prediction that failed, a failed test), even when its
 *                    status holds
 *   account_changed  another way to read an outcome was set aside by what was
 *                    recorded, or opened again
 *
 * A first ledger is taken silently, so nothing is logged for what was
 * already believed. What was believed on a given day is read back from the
 * log.
 */
import { accountsFor, accountLabel } from './accounts';
import { claimCode, claimRule, evidenceProfile, LOGIC_VERSION, RULE_STATUS } from './claims';
import { STATUS_META } from './constants';
import { RULE_TEXT } from './trace';
import { displayNode } from './selectors';
import type { AtlasData, BeliefLedger, ClaimStatus, ID, ISODate, ModelUpdate, SourceRef } from './types';
import { dateOf } from '../lib/dates';
import { t } from '../i18n';

type Entry = Omit<ModelUpdate, 'id' | 'at'>;

/** Claims the Atlas holds a belief about: on the map, or proposed and waiting. */
const believed = (data: AtlasData) => Object.values(data.claims).filter((c) => c.state !== 'set_aside');

/** Outcomes whose other readings are kept in the ledger: what you care about, and what a why-question is about. */
export function watchedOutcomes(data: AtlasData): ID[] {
  const out = new Set<ID>();
  for (const n of Object.values(data.nodes)) {
    if (n.concern && n.adopted) out.add(n.id);
    if (n.kind === 'question' && n.investigation?.kind === 'why' && n.investigation.anchorId && data.nodes[n.investigation.anchorId])
      out.add(n.investigation.anchorId);
  }
  return [...out];
}

/** What the Atlas believes now. */
export function currentLedger(data: AtlasData): BeliefLedger {
  const claims: BeliefLedger['claims'] = {};
  for (const c of believed(data)) {
    const p = evidenceProfile(data, c);
    const rule = claimRule(data, c);
    claims[c.id] = {
      status: RULE_STATUS[rule],
      rule,
      against: [p.counter, p.predictionsFailed ?? 0, p.testsAgainst + (p.analysisAgainst ?? 0)],
    };
  }
  const accounts: BeliefLedger['accounts'] = {};
  for (const id of watchedOutcomes(data)) {
    const set = accountsFor(data, id);
    if (!set.accounts.length) continue;
    accounts[id] = Object.fromEntries(set.accounts.map((a) => [a.key, a.standing === 'set_aside' ? 'set_aside' : 'open']));
  }
  return { claims, accounts };
}

const label = (s: string) => STATUS_META[s as ClaimStatus]?.label ?? s;

/**
 * What changed since the ledger, as log entries, and the new ledger. Entries
 * already logged by the action itself (a status it set and said, index
 * `since` onward) are not said twice.
 */
export function beliefUpdates(data: AtlasData, cause?: SourceRef, since = data.modelLog.length): { log: Entry[]; ledger: BeliefLedger } {
  const ledger = currentLedger(data);
  const prior = data.beliefs;
  if (!prior) return { log: [], ledger };
  const said = data.modelLog.slice(since);
  const log: Entry[] = [];
  for (const [id, now] of Object.entries(ledger.claims)) {
    const before = prior.claims[id];
    const claim = data.claims[id];
    if (!before || !claim) continue;
    const code = claimCode(claim.code);
    if (before.status !== now.status) {
      // Retiring is always your own act (or a revision), logged as such; and what the action already said is not said twice.
      if (now.status === 'retired' || said.some((u) => u.claimId === id && u.after === now.status)) continue;
      log.push({
        kind: 'status_changed',
        summary: t('{claim} now reads “{after}”; it read “{before}”. {rule}', {
          claim: code,
          after: label(now.status),
          before: label(before.status),
          rule: RULE_TEXT[now.rule as keyof typeof RULE_TEXT] ?? '',
        }),
        claimId: id,
        before: before.status,
        after: now.status,
        source: cause,
        rule: now.rule,
        logicVersion: LOGIC_VERSION,
      });
      continue;
    }
    const [e, p, x] = now.against;
    const [e0, p0, x0] = before.against;
    if ((e > e0 || p > p0 || x > x0) && !said.some((u) => u.claimId === id)) {
      const what =
        x > x0
          ? t('a test that did not go as predicted')
          : p > p0
            ? t('a prediction from it that did not hold')
            : t('a time it was there and the outcome did not follow');
      log.push({
        kind: 'challenged',
        summary: t('Something new counts against {claim}: {what}. It still reads “{status}”.', { claim: code, what, status: label(now.status) }),
        claimId: id,
        after: now.status,
        source: cause,
        rule: now.rule,
        logicVersion: LOGIC_VERSION,
      });
    }
  }
  for (const [outcome, standings] of Object.entries(ledger.accounts)) {
    const before = prior.accounts[outcome];
    if (!before) continue;
    const accounts = accountsFor(data, outcome).accounts;
    for (const [key, standing] of Object.entries(standings)) {
      if (!before[key] || before[key] === standing) continue;
      const a = accounts.find((x) => x.key === key);
      if (!a) continue;
      const what = displayNode(data, outcome)?.label ?? '';
      log.push({
        kind: 'account_changed',
        summary:
          standing === 'set_aside'
            ? t('For {outcome}: “{account}” was set aside by what was recorded.', { outcome: what, account: accountLabel(data, a) })
            : t('For {outcome}: “{account}” is open again.', { outcome: what, account: accountLabel(data, a) }),
        claimId: a.claimId,
        source: cause,
        logicVersion: LOGIC_VERSION,
      });
    }
  }
  return { log, ledger };
}

/** Whether two ledgers say the same. */
export const sameLedger = (a: BeliefLedger | undefined, b: BeliefLedger) => Boolean(a) && JSON.stringify(a) === JSON.stringify(b);

/** A claim and the earlier versions it revises, newest first. */
export function lineage(data: AtlasData, id: ID): ID[] {
  const out: ID[] = [];
  let at: ID | undefined = id;
  while (at && data.claims[at] && !out.includes(at)) {
    out.push(at);
    at = data.claims[at].revises;
  }
  return out;
}

/** Everything the log says about a claim and its earlier versions, oldest first. */
export function claimHistory(data: AtlasData, id: ID): ModelUpdate[] {
  const ids = new Set(lineage(data, id));
  return data.modelLog.filter((u) => u.claimId && ids.has(u.claimId)).sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * What the Atlas said a claim's status was on a day: the latest status the
 * log gave it on or before that day, across its earlier versions. Undefined
 * when the log says nothing that early.
 */
export function statusOn(data: AtlasData, id: ID, day: ISODate): ClaimStatus | undefined {
  let found: ClaimStatus | undefined;
  for (const u of claimHistory(data, id)) {
    if (dateOf(u.at) > day) break;
    if (u.after) found = u.after as ClaimStatus;
  }
  return found;
}
