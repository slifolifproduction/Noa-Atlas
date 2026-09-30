import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeEntryLocally, evaluateExperimentLocally } from '../ai/localAnalysis';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import { toCurrentShape } from '../persistence/migrate';
import { useAtlas } from '../state/atlasStore';
import { claimSentence, claimStatus, evidenceProfile, statusFromProfile, type EvidenceProfile } from './claims';
import { baseRate, caseRows, commonCauses, lagRange } from './compare';
import { expectations, predictionCounts, predictionLocked, testCheck } from './expect';
import { coverage, episodeOfItem, episodes, factorStates, usualLevel } from './factors';
import { danglingReferences } from './integrity';
import { findLoops, loopTurns } from './loops';
import { scrutinize } from './scrutiny';
import type { AtlasData, Claim, Occurrence } from './types';
import { whatIf } from './whatif';

const TODAY = '2026-09-28';
const atlas = () => useAtlas.getState();
const fresh = () => createSeedData(TODAY);

const occ = (id: string, date: string, changes: Occurrence['changes'], extra: Partial<Occurrence> = {}): Occurrence => ({
  id,
  kind: 'event',
  label: id,
  date,
  about: (changes ?? []).map((c) => c.factor),
  changes,
  mode: 'actual',
  origin: 'user',
  createdAt: `${date}T10:00:00.000Z`,
  ...extra,
});

const claim = (id: string, from: string, to: string, effect: Claim['effect'], extra: Partial<Claim> = {}): Claim => ({
  id,
  code: 90,
  from,
  with: [],
  to,
  effect,
  author: 'user',
  state: 'adopted',
  evidence: [],
  rivalIds: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

/** A small atlas of two states and a behaviour, with only what the test records. */
function tiny(): AtlasData {
  const d = createEmptyData('Test');
  const node = (id: string, kind: 'state' | 'behaviour') =>
    (d.nodes[id] = { id, label: id.toUpperCase(), summary: '', kind, area: 'work', origin: 'user', adopted: true, tags: [], createdAt: '', updatedAt: '' });
  node('a', 'state');
  node('b', 'state');
  node('c', 'state');
  node('act', 'behaviour');
  return d;
}

describe('episodes: what is counted once', () => {
  it('a note, what was read from it, and the readings with it are one episode', () => {
    const d = fresh();
    const e = episodeOfItem(d, 'ent:ent_22')!;
    expect(e.items.some((h) => h.key === 'occ:o24')).toBe(true);
    expect(e.items.some((h) => h.key === 'energy:ent_22')).toBe(true);
  });
  it('readings taken with every note do not chain the whole history into one episode', () => {
    const d = fresh();
    expect(episodes(d).length).toBeGreaterThan(20);
    for (const e of episodes(d)) expect(e.explicit || e.until <= e.from || e.items.length > 0).toBe(true);
  });
  it('the person can keep a happening apart, or group it, and that wins', () => {
    atlas().replaceData(fresh());
    const before = episodeOfItem(atlas().data, 'occ:o24')!.key;
    atlas().keepApart('o24');
    expect(episodeOfItem(atlas().data, 'occ:o24')!.key).not.toBe(before);
    atlas().groupWith('o24', 'o23');
    expect(episodeOfItem(atlas().data, 'occ:o24')!.key).toBe(episodeOfItem(atlas().data, 'occ:o23')!.key);
    atlas().regroup('o24');
    expect(atlas().data.occurrences.o24.episode).toBeUndefined();
  });
});

describe('what changed: states, never mentions', () => {
  it('a mention is not a state; what nothing records stays unknown', () => {
    const d = tiny();
    d.occurrences.m = { ...occ('m', '2026-03-01', undefined), about: ['a', 'b'] };
    expect(factorStates(d, 'a')).toEqual([]);
    expect(coverage(d, 'a')).toBe('mentioned');
    expect(caseRows(d, claim('x', 'a', 'b', 'raises'))).toEqual([]);
  });
  it('readings are read against the person’s own usual level, and a count from lifespans too', () => {
    const d = fresh();
    expect(usualLevel(d, 'n_energy')?.value).toBe(3);
    expect(coverage(d, 'n_energy')).toBe('tracked');
    expect(coverage(d, 'n_load')).toBe('tracked');
    const low = factorStates(d, 'n_energy').find((s) => s.basis === 'reading' && s.level === 1)!;
    expect(low.reads).toBe('low');
    expect(factorStates(d, 'n_load').some((s) => s.reads === 'up' && s.basis === 'lifespan')).toBe(true);
  });
});

describe('comparing episodes', () => {
  it('reads each pair as fits, exception, contrast or elsewhere, and the direction of the claim matters', () => {
    const d = tiny();
    d.occurrences = {
      o1: occ('o1', '2026-03-01', [{ factor: 'a', reads: 'high' }]),
      o2: occ('o2', '2026-03-03', [{ factor: 'b', reads: 'up' }]),
      o3: occ('o3', '2026-04-01', [{ factor: 'a', reads: 'low' }]),
      o4: occ('o4', '2026-04-03', [{ factor: 'b', reads: 'down' }]),
      o5: occ('o5', '2026-05-01', [{ factor: 'a', reads: 'high' }]),
      o6: occ('o6', '2026-05-04', [{ factor: 'b', reads: 'down' }]),
      o7: occ('o7', '2026-06-01', [{ factor: 'a', reads: 'low' }]),
      o8: occ('o8', '2026-06-03', [{ factor: 'b', reads: 'up' }]),
    };
    const raises = caseRows(d, claim('x', 'a', 'b', 'raises')).map((r) => r.verdict);
    expect(raises).toEqual(['fits', 'contrast', 'exception', 'elsewhere']);
    const lowers = caseRows(d, claim('y', 'a', 'b', 'lowers')).map((r) => r.verdict);
    expect(lowers).toEqual(['exception', 'elsewhere', 'fits', 'contrast']);
  });
  it('only what came before counts: the same day has no known order', () => {
    const d = tiny();
    d.occurrences = { o1: occ('o1', '2026-03-01', [{ factor: 'a', reads: 'high' }]), o2: occ('o2', '2026-03-01', [{ factor: 'b', reads: 'up' }]) };
    expect(caseRows(d, claim('x', 'a', 'b', 'raises'))).toEqual([]);
  });
  it('an outcome at its usual level is neither a fit nor an exception', () => {
    const d = tiny();
    d.occurrences = {
      o1: occ('o1', '2026-03-01', [{ factor: 'a', reads: 'high' }]),
      o2: { ...occ('o2', '2026-03-03', undefined), kind: 'reading', about: ['b'], instanceOf: 'b', value: 3 },
      o3: { ...occ('o3', '2026-04-03', undefined), kind: 'reading', about: ['b'], instanceOf: 'b', value: 3 },
      o4: { ...occ('o4', '2026-05-03', undefined), kind: 'reading', about: ['b'], instanceOf: 'b', value: 3 },
    };
    expect(caseRows(d, claim('x', 'a', 'b', 'raises'))).toEqual([]);
  });
  it('a condition recorded as not met leaves the time out rather than counting it against the claim', () => {
    const d = tiny();
    d.occurrences = {
      o0: occ('o0', '2026-02-28', [{ factor: 'c', reads: 'low' }]),
      o1: occ('o1', '2026-03-01', [{ factor: 'a', reads: 'high' }]),
      o2: occ('o2', '2026-03-03', [{ factor: 'b', reads: 'down' }]),
    };
    const rows = caseRows(d, claim('x', 'a', 'b', 'raises', { condition: { factor: 'c', reads: 'high' } }));
    expect(rows.map((r) => r.verdict)).toEqual(['outside']);
    expect(evidenceProfile(d, claim('x', 'a', 'b', 'raises', { condition: { factor: 'c', reads: 'high' } })).counter).toBe(0);
  });
  it('a behaviour only written down when it happened has no base rate', () => {
    const d = fresh();
    expect(baseRate(d, d.claims.c18)).toBeUndefined();
    expect(baseRate(d, d.claims.c09)?.known).toBeGreaterThan(20);
  });
});

describe('telling a claim apart from what else could produce it', () => {
  it('finds a common cause from the claims alone', () => {
    const d = fresh();
    expect(commonCauses(d, d.claims.c04).map((c) => c.factor)).toEqual(['n_load']);
  });
  it('a claim whose every time is also explained by a common cause is not "supported"', () => {
    const d = fresh();
    const p = evidenceProfile(d, d.claims.c04);
    expect(p.needsTellingApart).toBe(true);
    expect(p.toldApart).toBe(0);
    expect(claimStatus(d, d.claims.c04)).toBe('plausible');
    expect(scrutinize(d, d.claims.c04).commons.length).toBe(1);
  });
});

describe('status rules', () => {
  const base: EvidenceProfile = { instances: 0, episodes: 0, contrast: 0, mechanism: false, testsFor: 0, testsAgainst: 0, counter: 0 };
  it('a failed test is not cancelled by a passed one', () => {
    expect(statusFromProfile({ ...base, testsFor: 1, testsAgainst: 1 })).toBe('weakened');
    expect(statusFromProfile({ ...base, testsFor: 2, testsAgainst: 1 })).toBe('tested');
  });
  it('a tested claim with a failed test says so', () => {
    const d = fresh();
    const c = d.claims.c13;
    c.evidence.push({ ...c.evidence.find((e) => e.kind === 'intervention')!, id: 'x2', stance: 'counters' });
    c.evidence.push({ ...c.evidence.find((e) => e.kind === 'intervention')!, id: 'x3' });
    expect(claimSentence(d, c, 'tested')).toMatch(/though not every time/);
  });
  it('exceptions must be well in the minority for "keeps showing up"', () => {
    expect(statusFromProfile({ ...base, episodes: 4, contrast: 1, counter: 2 })).toBe('plausible');
    expect(statusFromProfile({ ...base, episodes: 5, contrast: 1, counter: 2 })).toBe('supported');
  });
  it('when the outcome goes that way most times anyway, times that fit are not enough', () => {
    expect(statusFromProfile({ ...base, episodes: 3, happensAnyway: true })).toBe('proposed');
    expect(statusFromProfile({ ...base, episodes: 3, contrast: 1, happensAnyway: true })).toBe('supported');
  });
  it('a prediction that held makes a claim plausible; one that failed counts against it', () => {
    expect(statusFromProfile({ ...base, predictionsHeld: 1 })).toBe('plausible');
    expect(statusFromProfile({ ...base, episodes: 1, predictionsFailed: 2 })).toBe('weakened');
  });
});

describe('expectations: predictions checked against the record', () => {
  it('reads held, open, failed and unobserved from what was recorded, and the person’s verdict stands', () => {
    const d = fresh();
    const v = Object.fromEntries(expectations(d, '2026-09-30').map((e) => [e.occurrence.id, e]));
    expect(v.x02.verdict).toBe('held');
    expect(v.x04.verdict).toBe('open');
    expect(v.x03).toMatchObject({ verdict: 'failed', by: 'you' });
    const late = expectations(d, '2026-12-31').find((e) => e.occurrence.id === 'x05')!;
    expect(late.verdict).toBe('unobserved');
  });
  it('a direct prediction counts for its claim; a chain counts for none of its links; a test’s own prediction is not counted twice', () => {
    const d = fresh();
    expect(predictionCounts(d, 'c09')).toEqual({ held: 1, failed: 0 });
    expect(predictionCounts(d, 'c02')).toEqual({ held: 0, failed: 0 });
    expect(predictionCounts(d, 'c13')).toEqual({ held: 0, failed: 0 });
  });
  it('a prediction written after its window began never counts', () => {
    const d = fresh();
    d.occurrences.x02 = { ...d.occurrences.x02, createdAt: '2026-08-10T00:00:00.000Z' };
    expect(predictionCounts(d, 'c09')).toEqual({ held: 0, failed: 0 });
  });
  it('a test counts as a test only with a prediction written before it began, and says when it started from an extreme', () => {
    const d = fresh();
    expect(predictionLocked(d, 'exp_01')).toBe(true);
    expect(testCheck(d, d.experiments.exp_01).fromExtreme?.reads).toBe('low');
    d.occurrences.x01 = { ...d.occurrences.x01, createdAt: '2026-06-10T00:00:00.000Z' };
    expect(predictionLocked(d, 'exp_01')).toBe(false);
    expect(evidenceProfile(d, d.claims.c13).testsFor).toBe(0);
  });
  it('is never evidence of what happened', () => {
    atlas().replaceData(fresh());
    atlas().addClaimEvidence('c01', { source: { kind: 'occurrence', id: 'x04' }, stance: 'supports', excerpt: '…', addedBy: 'user' });
    expect(atlas().data.claims.c01.evidence.some((e) => e.source.id === 'x04')).toBe(false);
  });
});

describe('what if: directions along the claims', () => {
  it('turns at every "lowers", keeps at every "raises", and says so when routes disagree', () => {
    const d = tiny();
    d.claims = {
      ab: claim('ab', 'a', 'b', 'lowers'),
      bc: claim('bc', 'b', 'c', 'raises'),
      ac: claim('ac', 'a', 'c', 'raises'),
    };
    const out = Object.fromEntries(whatIf(d, 'a', 'more').map((c) => [c.id, c]));
    expect(out.b.lean).toBe('less');
    expect(out.c.lean).toBe('mixed');
    expect(out.c.routes.length).toBe(2);
    expect(whatIf(d, 'a', 'less').find((c) => c.id === 'b')!.lean).toBe('more');
  });
  it('adds up delays along a route', () => {
    const d = tiny();
    d.claims = { ab: claim('ab', 'a', 'b', 'raises', { lag: '1–2 weeks' }), bc: claim('bc', 'b', 'c', 'raises', { lag: '2–4 days' }) };
    expect(lagRange(d.claims.ab)).toEqual([7, 14]);
    expect(whatIf(d, 'a', 'more').find((c) => c.id === 'c')!.window).toEqual([9, 18]);
  });
});

describe('cycles', () => {
  it('keep where to test apart from where to act', () => {
    const d = fresh();
    const cycle = findLoops(d).find((l) => l.name === 'Overcommitment cycle')!;
    expect(cycle.leastCertain.length).toBeGreaterThan(0);
    for (const id of cycle.leverage) expect(d.nodes[d.claims[id].from].kind).toBe('behaviour');
    expect(cycle.gated).toBe(false);
  });
  it('find the turns the record shows going all the way round', () => {
    const d = tiny();
    d.claims = { ab: claim('ab', 'a', 'b', 'raises'), ba: claim('ba', 'b', 'a', 'raises') };
    d.occurrences = {
      o1: occ('o1', '2026-03-01', [{ factor: 'a', reads: 'up' }]),
      o2: occ('o2', '2026-03-05', [{ factor: 'b', reads: 'up' }]),
      o3: occ('o3', '2026-03-12', [{ factor: 'a', reads: 'up' }]),
      o4: occ('o4', '2026-04-20', [{ factor: 'a', reads: 'up' }]),
    };
    for (const c of Object.values(d.claims)) c.evidence = [];
    const loop = {
      id: 'ab|ba',
      claimIds: ['ab', 'ba'],
      nodeIds: ['a', 'b'],
      type: 'reinforcing' as const,
      weakest: 'proposed' as const,
      leastCertain: [],
      leverage: [],
      gated: false,
    };
    const turns = loopTurns(d, loop);
    expect(turns.length).toBe(1);
    expect(turns[0]).toMatchObject({ from: '2026-03-01', to: '2026-03-12', days: 11 });
  });
});

describe('revising understanding without rewriting history', () => {
  beforeEach(() => atlas().replaceData(fresh()));

  it('a change of meaning to a claim with evidence makes a new version; the old one keeps its evidence', () => {
    const before = atlas().data.claims.c01;
    const next = atlas().updateClaim('c01', { condition: { factor: 'n_afternoons', reads: 'high' } });
    const d = atlas().data;
    expect(next).not.toBe('c01');
    expect(d.claims.c01.retired?.revisedInto).toBe(next);
    expect(d.claims.c01.evidence).toEqual(before.evidence);
    expect(d.claims[next].revises).toBe('c01');
    expect(d.claims[next].evidence.length).toBe(before.evidence.length);
    expect(d.claims[next].evidence.every((e) => e.carriedFrom === 'c01')).toBe(true);
    // What relied on the claim relies on the new version; the test stays with the version it tested.
    expect(Object.values(d.paths).some((p) => p.assumptionIds.includes('c01'))).toBe(false);
    expect(d.claims.c11.rivalIds).toContain(next);
    expect(d.experiments.exp_02.claimId).toBe('c01');
    expect(d.modelLog.at(-1)?.kind).toBe('claim_revised');
    expect(danglingReferences(d)).toEqual([]);
  });

  it('turning the direction carries no evidence over; rewording the "how" edits in place, logged', () => {
    const flipped = atlas().updateClaim('c01', { effect: 'raises' });
    expect(atlas().data.claims[flipped].evidence).toEqual([]);
    atlas().replaceData(fresh());
    const same = atlas().updateClaim('c01', { via: 'Paid work takes the protected days.' });
    expect(same).toBe('c01');
    expect(atlas().data.modelLog.at(-1)?.kind).toBe('claim_edited');
  });

  it('what changes about a whole thing can become its own element, part of it', () => {
    const next = atlas().promoteAspect('c23', 'from', 'Outside investment: arriving')!;
    const d = atlas().data;
    const factor = d.claims[next].from;
    expect(d.nodes[factor].label).toBe('Outside investment: arriving');
    expect(Object.values(d.edges).some((e) => e.source === factor && e.target === 'n_investment' && e.type === 'part_of')).toBe(true);
    expect(d.claims[next].aspect?.from).toBeUndefined();
  });

  it('deleting an element lets go of what changed, conditions, measures and expectations about it', () => {
    atlas().updateClaim('c02', { condition: { factor: 'n_runway', reads: 'low' } });
    atlas().deleteNode('n_runway');
    atlas().deleteNode('n_nf_progress');
    const d = atlas().data;
    expect(danglingReferences(d)).toEqual([]);
    expect(Object.values(d.occurrences).some((o) => o.changes?.some((c) => c.factor === 'n_nf_progress'))).toBe(false);
    expect(Object.values(d.occurrences).some((o) => o.mode === 'expected' && o.changes?.some((c) => c.factor === 'n_runway'))).toBe(false);
    expect(
      Object.values(d.experiments)
        .flatMap((x) => x.measures)
        .some((m) => m.factor === 'n_nf_progress'),
    ).toBe(false);
  });
});

describe('the test result preview reads the status the way the store will', () => {
  it('matches what is applied', () => {
    atlas().replaceData(fresh());
    const d = atlas().data;
    const x = d.experiments.exp_02;
    const result = { outcome: 'contradicts' as const, summary: 'Night Ferry did not move.', learning: '', recordedAt: '2026-10-15T09:00:00.000Z' };
    const proposal = evaluateExperimentLocally(x, result, d);
    atlas().applyExperimentResult(x.id, result, proposal);
    expect(claimStatus(atlas().data, atlas().data.claims.c01)).toBe(proposal.changes[0].after);
  });
});

describe('capture reads what changed, never a mention alone', () => {
  const read = (content: string) =>
    analyzeEntryLocally(
      { id: 'x', seq: 99, kind: 'journal', title: 'Test', content, date: '2026-09-29', areas: [], tags: [], nodeIds: [], createdAt: '', updatedAt: '' },
      fresh(),
    ).suggestions.filter((s) => s.type === 'change' || s.type === 'expectation');
  it('proposes a change only where a sentence says which way', () => {
    expect(read('Energy was low all week.')).toMatchObject([{ type: 'change', factor: 'n_energy', reads: 'low' }]);
    expect(read('I wrote about energy and Night Ferry progress.')).toEqual([]);
  });
  it('reads better and worse by whether more of it is better or worse', () => {
    expect(read('Fragmented attention got worse after the calls.')).toMatchObject([{ factor: 'n_fragment', reads: 'up' }]);
  });
  it('a sentence about the future is an expectation, never history', () => {
    expect(read('I think energy will pick up next week.')).toMatchObject([{ type: 'expectation', factor: 'n_energy', reads: 'up', within: 7 }]);
  });
  it('an accepted change goes with the note’s happening about it', () => {
    atlas().replaceData(fresh());
    const e = atlas().addEntry({ kind: 'journal', title: 'Week', content: 'Energy was low all week.', date: '2026-09-29', areas: [], tags: [], nodeIds: [] });
    atlas().setEntryAnalysis(e.id, analyzeEntryLocally(atlas().data.entries[e.id], atlas().data));
    const s = atlas().data.entries[e.id].analysis!.suggestions.find((x) => x.type === 'change')!;
    atlas().resolveSuggestion(e.id, s.id, true);
    const made = Object.values(atlas().data.occurrences).find((o) => o.source?.id === e.id)!;
    expect(made.changes).toEqual([{ factor: 'n_energy', reads: 'low' }]);
  });
});

describe('v3 → v4', () => {
  it('a stored sample gets what changed and its expectations once, keeping what the person did', () => {
    const full = fresh();
    const old = structuredClone(full) as AtlasData;
    old.causesLogic = 3;
    for (const o of Object.values(old.occurrences)) delete o.changes;
    for (const id of Object.keys(old.occurrences)) if (old.occurrences[id].mode === 'expected') delete old.occurrences[id];
    old.occurrences.o30 = { ...old.occurrences.o30, changes: [{ factor: 'n_workshop', reads: 'up' }] };
    const up = toCurrentShape(old);
    expect(up.causesLogic).toBe(4);
    expect(up.occurrences.o02.changes?.length).toBeGreaterThan(0);
    expect(up.occurrences.o30.changes).toEqual([{ factor: 'n_workshop', reads: 'up' }]);
    expect(Object.values(up.occurrences).filter((o) => o.mode === 'expected').length).toBe(
      Object.values(full.occurrences).filter((o) => o.mode === 'expected').length,
    );
    expect(danglingReferences(up)).toEqual([]);
  });
  it('the person’s own atlas only gets the marker', () => {
    const own = createEmptyData('Sam');
    delete (own as Partial<AtlasData>).causesLogic;
    const up = toCurrentShape(own);
    expect(up.occurrences).toEqual(own.occurrences);
    expect(up.causesLogic).toBe(4);
  });
});
