import { describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { claimGaps, claimSentence, claimStatus, evidenceCandidates, statusFromProfile, type EvidenceProfile } from './claims';

const base: EvidenceProfile = { instances: 0, episodes: 0, contrast: 0, mechanism: false, testsFor: 0, testsAgainst: 0, counter: 0 };
const p = (x: Partial<EvidenceProfile>) => ({ ...base, ...x });

describe('claim status ladder', () => {
  it('starts as proposed', () => expect(statusFromProfile(base)).toBe('proposed'));
  it('is plausible with one episode and a mechanism, or two episodes', () => {
    expect(statusFromProfile(p({ instances: 1, episodes: 1 }))).toBe('proposed');
    expect(statusFromProfile(p({ instances: 1, episodes: 1, mechanism: true }))).toBe('plausible');
    expect(statusFromProfile(p({ instances: 2, episodes: 2 }))).toBe('plausible');
  });
  it('needs repetition and a contrast case to be supported', () => {
    expect(statusFromProfile(p({ instances: 5, episodes: 5 }))).toBe('plausible');
    expect(statusFromProfile(p({ instances: 3, episodes: 3, contrast: 1 }))).toBe('supported');
  });
  it('is tested only by a deliberate change that went as predicted', () => {
    expect(statusFromProfile(p({ testsFor: 1 }))).toBe('tested');
    expect(statusFromProfile(p({ testsFor: 1, testsAgainst: 2 }))).toBe('weakened');
  });
  it('is weakened when counter-cases outweigh the support', () => {
    expect(statusFromProfile(p({ counter: 2 }))).toBe('weakened');
    expect(statusFromProfile(p({ instances: 3, episodes: 3, counter: 1 }))).toBe('plausible');
  });
  it('can stop holding', () => expect(statusFromProfile(p({ testsFor: 1 }), true)).toBe('retired'));
});

describe('claims in the sample', () => {
  const data = createSeedData('2026-09-28');
  it('derives each status from the kinds of evidence', () => {
    expect(claimStatus(data, data.claims.c13)).toBe('tested');
    expect(claimStatus(data, data.claims.c01)).toBe('supported');
    expect(claimStatus(data, data.claims.c08)).toBe('weakened');
    expect(claimStatus(data, data.claims.c23)).toBe('proposed');
  });
  it('hedges its wording by status', () => {
    expect(claimSentence(data, data.claims.c23)).toMatch(/may /);
    expect(claimSentence(data, data.claims.c01)).toMatch(/appears to /);
    expect(claimSentence(data, data.claims.c08)).toMatch(/no longer seems to /);
  });
  it('says what would strengthen a claim', () => {
    expect(claimGaps(data, data.claims.c23).length).toBeGreaterThan(0);
  });
  it('offers records as possible evidence without repeating ones already used', () => {
    const c = data.claims.c01;
    const used = new Set(c.evidence.map((e) => `${e.source.kind}:${e.source.id}`));
    for (const cand of evidenceCandidates(data, c)) expect(used.has(`${cand.source.kind}:${cand.source.id}`)).toBe(false);
  });
});
