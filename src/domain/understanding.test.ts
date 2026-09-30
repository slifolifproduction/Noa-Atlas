/**
 * How the Atlas's understanding is formed, tested, challenged and revised:
 * what each record says and how it was known, periods and scopes, traces,
 * belief history, competing accounts, what-if and imagined readings,
 * predictions and repairs, Active Inquiry, and readiness for formal methods.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { useAtlas } from '../state/atlasStore';
import { addDays } from '../lib/dates';
import { accountsFor } from './accounts';
import { beliefUpdates, claimHistory, currentLedger, statusOn } from './beliefs';
import { claimStatus, recordRows, RULE_STATUS, statusFromProfile, type EvidenceProfile } from './claims';
import { caseRows, conditionAt, untestedContexts } from './compare';
import { expectations } from './expect';
import { explainMoment, explainOutcome } from './explain';
import { factorStates, observedIn, phasesOf, silentSpans, usualAt, usualLevel } from './factors';
import { historyItems } from './history';
import { changeable, DECLINE_DAYS, inquiries } from './inquiry';
import { proposeExpectations, repairsFor, surprises } from './ledger';
import { readiness } from './readiness';
import { claimTrace, LOGIC_VERSION } from './trace';
import type { AtlasData, Claim, SourceRef } from './types';
import { whatIf } from './whatif';

const TODAY = '2026-09-30';
const fresh = () => createSeedData(TODAY);
const exists = (d: AtlasData, r: SourceRef) =>
  r.kind === 'entry'
    ? r.id in d.entries
    : r.kind === 'decision'
      ? r.id in d.decisions
      : r.kind === 'occurrence'
        ? r.id in d.occurrences
        : r.id in d.experiments;

describe('what a record says, and how it was known', () => {
  it('keeps the channel: readings felt, counts counted, behaviour noticed', () => {
    const d = fresh();
    const readings = factorStates(d, 'n_energy').filter((s) => s.basis === 'reading');
    expect(readings.length).toBeGreaterThan(0);
    expect(readings.every((s) => s.channel === 'felt' && s.readAs === 'against_usual')).toBe(true);
    expect(factorStates(d, 'n_load').every((s) => s.channel === 'counted')).toBe(true);
    expect(
      factorStates(d, 'n_yes')
        .filter((s) => s.basis === 'instance')
        .every((s) => s.channel === 'noticed'),
    ).toBe(true);
  });

  it('knows when something was written down days after it happened', () => {
    const d = fresh();
    const late = Object.keys(d.nodes).flatMap((id) => factorStates(d, id).filter((s) => s.written));
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((s) => s.written! > s.date)).toBe(true);
  });

  it('a stretch with nothing written down is silent: nothing is known in it, not even absence', () => {
    const d = fresh();
    const silent = silentSpans(d, 14, TODAY);
    expect(silent.length).toBeGreaterThan(0);
    expect(observedIn(d, 'n_energy', silent[0].from, silent[0].until)).toBe('silent');
    expect(observedIn(d, 'n_energy', '2026-08-01', '2026-08-31')).toBe('tracked');
  });

  it('an order written down after the outcome was known can count against a claim, never for it', () => {
    const d = fresh();
    const found = Object.values(d.claims)
      .flatMap((c) =>
        caseRows(d, c)
          .filter((r) => r.verdict === 'fits' && !r.hindsight && r.cause.item?.ref.kind === 'occurrence' && r.cause.item.source?.kind === 'entry')
          .map((r) => ({ c, r })),
      )
      .find((x) => recordRows(d, x.c).counted.some((r) => r.outcome.key === x.r.outcome.key));
    expect(found).toBeTruthy();
    const d2 = structuredClone(d);
    d2.entries[found!.r.cause.item!.source!.id].date = addDays(found!.r.outcome.date, 1);
    const claim = d2.claims[found!.c.id];
    const row = caseRows(d2, claim).find((r) => r.outcome.key === found!.r.outcome.key);
    expect(row?.hindsight).toBe(true);
    expect(recordRows(d2, claim).counted.some((r) => r.outcome.key === found!.r.outcome.key)).toBe(false);
  });
});

describe('periods and scopes', () => {
  it('reads a level against the usual level of its own period', () => {
    const d = fresh();
    const phases = phasesOf(d, 'n_energy');
    expect(phases.length).toBeGreaterThan(1);
    const last = phases[phases.length - 1];
    expect(usualAt(d, 'n_energy', last.from)).toBe(last.usual);
    const overall = usualLevel(d, 'n_energy')!.value;
    const r = factorStates(d, 'n_energy').find((s) => s.basis === 'reading' && s.date >= last.from && s.level === last.usual);
    expect(r?.reads).toBe('usual');
    // Against the whole record, the same reading may be high or low.
    const same = factorStates(d, 'n_energy', 'overall').find((s) => s.key === r!.key)!;
    expect(same.reads).toBe(last.usual > overall ? 'high' : last.usual < overall ? 'low' : 'usual');
  });

  it('counts only the times every condition held; the rest are left out, not counted against', () => {
    const d = fresh();
    const c: Claim = { ...d.claims.c01, id: 'scoped', scope: { also: [{ factor: 'n_energy', reads: 'high' }] } };
    for (const r of caseRows(d, c)) if (conditionAt(d, c, r.outcome.date) === 'not_met') expect(r.verdict).toBe('outside');
  });

  it('a claim about a stretch of time leaves out the times outside it', () => {
    const d = fresh();
    const c: Claim = { ...d.claims.c04, id: 'until-june', scope: { until: '2026-06-01' } };
    const after = caseRows(d, c).filter((r) => r.outcome.date > '2026-06-01');
    expect(after.every((r) => r.verdict === 'outside' && r.outsidePeriod)).toBe(true);
  });

  it('a cumulative claim reads what was kept up over its delay, against the whole record', () => {
    const d = fresh();
    const c: Claim = { ...d.claims.c17, id: 'cumulative', scope: { timescale: 'cumulative' } };
    const rows = caseRows(d, c);
    expect(rows.length).toBeGreaterThan(0);
    const overall = new Map(factorStates(d, 'n_energy', 'overall').map((s) => [s.key, s.reads]));
    expect(rows.every((r) => overall.get(r.outcome.key) === r.outcome.reads)).toBe(true);
  });

  it('names contexts a claim has only ever been seen in', () => {
    const d = fresh();
    for (const c of Object.values(d.claims))
      for (const ctx of untestedContexts(d, c)) {
        expect(ctx.times).toBeGreaterThanOrEqual(3);
        expect(factorStates(d, ctx.factor).some((s) => s.lean === (ctx.reads === 'high' ? 'less' : 'more'))).toBe(true);
      }
  });
});

describe('traces', () => {
  it('every status says the rule that gave it, and what it rests on exists', () => {
    const d = fresh();
    for (const c of Object.values(d.claims)) {
      const tr = claimTrace(d, c);
      expect(tr.status).toBe(claimStatus(d, c));
      expect(RULE_STATUS[tr.rule]).toBe(tr.status);
      expect(tr.version).toBe(LOGIC_VERSION);
      expect(tr.says.length).toBeGreaterThan(0);
      for (const r of tr.rests) expect(exists(d, r.source)).toBe(true);
    }
  });

  it('says what a status assumes: only a deliberate change rules out what moves both unseen', () => {
    const d = fresh();
    expect(claimTrace(d, d.claims.c04).assumes.some((a) => /deliberate change/.test(a))).toBe(true);
    const tested = claimTrace(d, d.claims.c13);
    expect(tested.rule).toBe('tested');
    expect(tested.assumes.some((a) => /deliberate change/.test(a))).toBe(false);
  });

  it('a formal comparison can make a claim surer, never tested', () => {
    const base: EvidenceProfile = { instances: 3, episodes: 3, contrast: 0, mechanism: false, testsFor: 0, testsAgainst: 0, counter: 0 };
    expect(statusFromProfile(base)).toBe('plausible');
    expect(statusFromProfile({ ...base, analysisFor: 1 })).toBe('supported');
    expect(statusFromProfile({ ...base, analysisFor: 5 })).not.toBe('tested');
    expect(statusFromProfile({ ...base, episodes: 1, analysisAgainst: 3 })).toBe('weakened');
  });
});

describe('belief history', () => {
  beforeEach(() => useAtlas.getState().replaceData(fresh()));

  it('logs a status that moved without anyone editing the claim, with its cause, rule and logic version', () => {
    const d = fresh();
    d.beliefs = currentLedger(d);
    d.beliefs.claims.c04 = { ...d.beliefs.claims.c04, status: 'plausible' };
    const cause: SourceRef = { kind: 'entry', id: 'ent_27' };
    const e = beliefUpdates(d, cause).log.find((u) => u.claimId === 'c04')!;
    expect(e).toMatchObject({ kind: 'status_changed', before: 'plausible', after: 'supported', rule: 'supported', logicVersion: LOGIC_VERSION, source: cause });
  });

  it('logs what counted against a claim even when its status held', () => {
    const d = fresh();
    d.beliefs = currentLedger(d);
    const now = d.beliefs.claims.c04;
    d.beliefs.claims.c04 = { ...now, against: [now.against[0] - 1, now.against[1], now.against[2]] };
    const e = beliefUpdates(d).log.find((u) => u.claimId === 'c04');
    expect(e?.kind).toBe('challenged');
  });

  it('takes its first ledger silently, then logs what changed; what it believed is read back by date', () => {
    const a = useAtlas.getState();
    const before = a.data.modelLog.length;
    a.setProfileName('Noa Varela');
    expect(useAtlas.getState().data.modelLog.length).toBe(before);
    expect(useAtlas.getState().data.beliefs?.claims.c04.status).toBe('supported');
    // An older ledger that believed less: the change is logged when the atlas is next changed.
    const older = structuredClone(useAtlas.getState().data);
    older.beliefs!.claims.c04 = { ...older.beliefs!.claims.c04, status: 'plausible' };
    useAtlas.getState().replaceData(older);
    const d = useAtlas.getState().data;
    const logged = d.modelLog.filter((u) => u.kind === 'status_changed' && u.claimId === 'c04');
    expect(logged.length).toBe(1);
    expect(claimHistory(d, 'c04').at(-1)?.kind).toBe('status_changed');
    expect(statusOn(d, 'c04', addDays(TODAY, 400))).toBe('supported');
  });
});

describe('other ways to read an outcome', () => {
  it('lays them out, and sets one aside only by what was recorded', () => {
    const d = fresh();
    const set = accountsFor(d, 'n_nf_progress');
    expect(set.leading?.id).toBe('c13');
    const kinds = new Set(set.accounts.map((a) => a.kind));
    for (const k of ['claim', 'reverse', 'unnamed', 'remainder'] as const) expect(kinds.has(k)).toBe(true);
    // A deliberate change rules out something unrecorded moving both, and settles which way it runs.
    expect(set.accounts.find((a) => a.key === 'unnamed:c13')?.standing).toBe('set_aside');
    expect(set.accounts.find((a) => a.key === 'reverse:c13')?.standing).toBe('set_aside');
    // What was only seen is not: something unrecorded could move both.
    expect(set.accounts.find((a) => a.key === 'unnamed:c01')?.standing).toBe('open');
    // The remainder is never set aside.
    expect(set.accounts.find((a) => a.kind === 'remainder')?.standing).toBe('open');
    // Every open alternative says what would tell it apart.
    expect(set.accounts.filter((a) => a.kind !== 'claim' && a.kind !== 'remainder' && a.standing !== 'set_aside').every((a) => a.tell)).toBe(true);
  });

  it('an outcome moving when part of its list was not recorded is unknown, not unexplained', () => {
    const ex = explainOutcome(fresh(), 'n_nf_progress');
    expect(ex.unexplained + ex.unaccounted).toBeLessThanOrEqual(ex.moments);
  });
});

describe('changing something, and what might have been', () => {
  it('what-if says whether a change you make yourself can rely on each consequence', () => {
    const d = fresh();
    expect(whatIf(d, 'n_deepwork', 'more', 1).find((c) => c.id === 'n_nf_progress')?.ifYouChange).toBe('tested');
    expect(whatIf(d, 'n_yes', 'more', 2).every((c) => c.ifYouChange !== 'tested')).toBe(true);
  });

  it('had it been otherwise: an imagined reading, never more than the record allows', () => {
    const d = fresh();
    for (const h of historyItems(d).filter((x) => x.mode === 'actual')) {
      const m = explainMoment(d, h);
      for (const c of m.counterfactual)
        if (c.reading === 'might_not_have') {
          expect(m.present.length).toBe(1);
          expect(['supported', 'tested']).toContain(claimStatus(d, c.claim));
          expect(m.outside.length).toBe(0);
        }
    }
  });
});

describe('predictions and repairs', () => {
  it('proposes what the model expects, and keeps nothing until it is kept', () => {
    const d = fresh();
    const before = Object.keys(d.occurrences).length;
    // Night Ferry progress is already expected to go up until mid-October: not proposed twice.
    expect(proposeExpectations(d, 'n_deepwork', 'more', TODAY).some((x) => x.factor === 'n_nf_progress')).toBe(false);
    const later = proposeExpectations(d, 'n_deepwork', 'more', '2026-11-01');
    expect(later.some((x) => x.factor === 'n_nf_progress' && x.basis.includes('c13') && x.ifYouChange === 'tested')).toBe(true);
    expect(Object.keys(d.occurrences).length).toBe(before);
  });

  it('when an expectation fails, says where the model is most likely wrong and what could be wrong there, applying nothing', () => {
    const d = fresh();
    d.occurrences.x_fail = {
      id: 'x_fail',
      kind: 'event',
      label: 'Night Ferry progress goes up',
      date: '2026-09-01',
      until: '2026-09-20',
      about: ['n_nf_progress'],
      changes: [{ factor: 'n_nf_progress', reads: 'up' }],
      expectation: { basis: ['c13'], verdict: { outcome: 'failed', at: '2026-09-21T10:00:00Z' } },
      mode: 'expected',
      origin: 'user',
      createdAt: '2026-08-30T10:00:00Z',
    };
    const v = expectations(d, TODAY).find((e) => e.occurrence.id === 'x_fail')!;
    expect(v.verdict).toBe('failed');
    const r = repairsFor(d, v);
    expect(r.located?.id).toBe('c13');
    expect(r.repairs.map((x) => x.kind)).toContain('weaken');
    expect(d.claims.c13.condition).toBeUndefined();
    expect(surprises(d, TODAY).some((s) => s.kind === 'failed' && s.expectation?.occurrence.id === 'x_fail')).toBe(true);
  });
});

describe('Active Inquiry', () => {
  it('asks first for what would decide between readings, and never for a risky change', () => {
    const d = fresh();
    const qs = inquiries(d, TODAY);
    expect(qs.length).toBeGreaterThan(0);
    const narrowing = qs.findIndex((q) => !q.decisive);
    if (narrowing >= 0) expect(qs.slice(narrowing).every((q) => !q.decisive)).toBe(true);
    for (const q of qs.filter((x) => x.kind === 'test')) expect(changeable(d, d.claims[q.claimId!])).toBe(true);
    // Late sprints act on energy: health is at stake. Active commitments is a count, not something you do.
    expect(changeable(d, d.claims.c09)).toBe(false);
    expect(changeable(d, d.claims.c01)).toBe(false);
  });

  it('stops asking for a while after "not now"', () => {
    const d = fresh();
    const q = inquiries(d, TODAY)[0];
    d.inquiry = { declined: { [q.key]: TODAY } };
    expect(inquiries(d, TODAY).some((x) => x.key === q.key)).toBe(false);
    expect(inquiries(d, addDays(TODAY, DECLINE_DAYS)).some((x) => x.key === q.key)).toBe(true);
  });

  it('asks nothing more about an outcome once its readings are told apart', () => {
    const d = fresh();
    const set = accountsFor(d, 'n_nf_progress');
    if (set.distinguished) expect(inquiries(d, TODAY).some((q) => q.outcome === 'n_nf_progress' && q.key.startsWith('tell:'))).toBe(false);
  });
});

describe('readiness for formal methods', () => {
  it('holds them back until the record can bear them, and says what is missing', () => {
    const d = fresh();
    const r = readiness(d, d.claims.c04);
    expect(r.ready).toBe(false);
    expect(r.checks.map((c) => c.key)).toEqual(['episodes', 'variation', 'sampling', 'timing', 'overlap', 'window']);
    expect(r.checks.find((c) => c.key === 'window')?.ok).toBe(false);
    expect(readiness(d, { ...d.claims.c04, id: 'lagged', lag: '1–3 weeks' }).checks.find((c) => c.key === 'window')?.ok).toBe(true);
  });
});
