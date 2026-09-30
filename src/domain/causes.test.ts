import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { buildOrbit } from '../graph/build';
import { carriesInfluence } from '../components/graph/SemanticEdge';
import { useAtlas } from '../state/atlasStore';
import {
  canBeEvidence,
  claimGaps,
  claimSentence,
  claimStatus,
  evidenceCandidates,
  evidenceProfile,
  lagWindow,
  orderedEpisodes,
  unnamedAspects,
} from './claims';
import { EFFECTS } from './constants';
import { explainMoment, explainOutcome } from './explain';
import { historyItems } from './history';
import { findLoops } from './loops';
import { patternTitle } from './selectors';
import type { AtlasData, Claim, Evidence } from './types';

const TODAY = '2026-09-28';
const E = (n: number) => ({ kind: 'entry' as const, id: `ent_${String(n).padStart(2, '0')}` });
const ev = (id: string, n: number, stance: Evidence['stance'], kind: Evidence['kind'], extra: Partial<Evidence> = {}): Evidence => ({
  id,
  source: E(n),
  stance,
  kind,
  excerpt: '…',
  addedBy: 'user',
  addedAt: '2026-09-01T00:00:00Z',
  ...extra,
});

/** A bare claim between two sample elements, with the evidence given. */
function withClaim(evidence: Evidence[], opts: Partial<Claim> = {}): { data: AtlasData; claim: Claim } {
  const data = createSeedData(TODAY);
  const claim: Claim = {
    id: 'cx',
    code: 99,
    from: 'n_load',
    with: [],
    to: 'n_nf_progress',
    effect: 'lowers',
    author: 'user',
    state: 'adopted',
    evidence,
    rivalIds: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    ...opts,
  };
  data.claims.cx = claim;
  return { data, claim };
}

describe('what counts as evidence for a possible cause', () => {
  it('a written "how" is an explanation, not evidence', () => {
    const { data, claim } = withClaim([ev('a', 2, 'supports', 'instance')], { via: 'Paid work takes the days.' });
    expect(evidenceProfile(data, claim).mechanism).toBe(false);
    expect(claimStatus(data, claim)).toBe('proposed');
    expect(claimGaps(data, claim).join(' ')).toMatch(/described, not yet seen/);
    claim.evidence.push(ev('b', 30, 'supports', 'mechanism'));
    expect(claimStatus(data, claim)).toBe('plausible');
  });

  it('the outcome happening without the cause never counts against it', () => {
    const { data, claim } = withClaim([ev('a', 2, 'neutral', 'elsewhere'), ev('b', 11, 'neutral', 'elsewhere'), ev('c', 27, 'neutral', 'elsewhere')]);
    const p = evidenceProfile(data, claim);
    expect(p.counter).toBe(0);
    expect(p.elsewhere).toBe(3);
    expect(claimStatus(data, claim)).toBe('proposed');
  });

  it('only "the cause was there and the outcome did not follow" is an exception, counted once per week', () => {
    // Notes 10 and 11 fall in different weeks; several records of one week count once.
    const oneWeek = withClaim([ev('a', 10, 'counters', 'counter_case'), ev('b', 10, 'counters', 'counter_case', { id: 'b2' })]);
    expect(evidenceProfile(oneWeek.data, oneWeek.claim).counter).toBe(1);
    const twoWeeks = withClaim([ev('a', 10, 'counters', 'counter_case'), ev('b', 11, 'counters', 'counter_case')]);
    expect(evidenceProfile(twoWeeks.data, twoWeeks.claim).counter).toBe(2);
    expect(claimStatus(twoWeeks.data, twoWeeks.claim)).toBe('weakened');
  });

  it('an instance drawn from history must be in order and within the delay', () => {
    // Note 21 (5 Aug, the sprint) then note 22 (9 Aug, the crash): four days apart.
    const inOrder = withClaim([ev('a', 22, 'supports', 'instance', { cause: E(21) })], { lag: '1–4 days' });
    expect(evidenceProfile(inOrder.data, inOrder.claim).episodes).toBe(1);
    const reversed = withClaim([ev('a', 21, 'supports', 'instance', { cause: E(22) })], { lag: '1–4 days' });
    expect(evidenceProfile(reversed.data, reversed.claim).episodes).toBe(0);
    expect(evidenceProfile(reversed.data, reversed.claim).outOfOrder).toBe(1);
    const tooLate = withClaim([ev('a', 22, 'supports', 'instance', { cause: E(21) })], { lag: '1–2 days' });
    expect(evidenceProfile(tooLate.data, tooLate.claim).episodes).toBe(0);
  });

  it('reads the delay a claim allows', () => {
    expect(lagWindow({ lag: '1–4 days' })).toBe(4);
    expect(lagWindow({ lag: '2–6 weeks' })).toBe(42);
    expect(lagWindow({ lag: 'about a month' })).toBe(30);
    expect(lagWindow({})).toBe(28);
  });

  it('only what actually happened can be evidence', () => {
    const data = createSeedData(TODAY);
    const occ = Object.values(data.occurrences)[0];
    expect(canBeEvidence(data, { kind: 'occurrence', id: occ.id })).toBe(true);
    data.occurrences[occ.id] = { ...occ, mode: 'planned' };
    expect(canBeEvidence(data, { kind: 'occurrence', id: occ.id })).toBe(false);
    const planned = Object.values(data.experiments).find((x) => !x.result);
    if (planned) expect(canBeEvidence(data, { kind: 'experiment', id: planned.id })).toBe(false);
  });

  it('never offers a note about the outcome alone as a case against the cause', () => {
    const data = createSeedData(TODAY);
    for (const c of Object.values(data.claims)) for (const cand of evidenceCandidates(data, c)) expect(['both', 'from']).toContain(cand.sides);
  });

  it('finds sequences in history, cause first, within the delay, for you to confirm', () => {
    const data = createSeedData(TODAY);
    for (const c of Object.values(data.claims)) {
      for (const e of orderedEpisodes(data, c)) {
        expect(e.cause.date <= e.effect.date).toBe(true);
        expect(e.days).toBeLessThanOrEqual(lagWindow(c));
      }
    }
  });
});

describe('claims are about factors, with roles', () => {
  const data = createSeedData(TODAY);
  it('every effect is one role and one direction', () => {
    for (const e of EFFECTS) {
      expect(['trigger', 'condition', 'contributor', 'maintainer', 'buffer']).toContain(e.role);
      expect(['more', 'less']).toContain(e.direction);
      expect(e.direction === 'less').toBe(e.polarity < 0);
    }
  });
  it('asks what about a whole thing changes, and says it in the sentence', () => {
    expect(unnamedAspects(data, data.claims.c23)).toEqual([]);
    expect(claimSentence(data, data.claims.c23)).toMatch(/Outside investment \(arriving\)/);
    const { data: d2, claim } = withClaim([], { from: 'n_brightline', to: 'n_runway', effect: 'sustains' });
    expect(unnamedAspects(d2, claim)).toEqual(['n_brightline']);
  });
  it('keeps conditions in the sentence, and a tested claim tied to its test', () => {
    expect(claimSentence(data, data.claims.c02)).toMatch(/\(a yes on the spot/);
    expect(claimSentence(data, data.claims.c13)).toMatch(/raised .* when you tested it$/);
  });
});

describe('explanations stay open', () => {
  const data = createSeedData(TODAY);
  it('groups contributors by role, keeps rivals, and always leaves room for the unexplained', () => {
    const ex = explainOutcome(data, 'n_nf_progress');
    expect(ex.groups.map((g) => g.role)).toEqual(expect.arrayContaining(['contributor', 'buffer']));
    expect(ex.rivalries.length).toBeGreaterThan(0);
    expect(ex.moments).toBeGreaterThan(0);
    expect(ex.unexplained).toBeGreaterThanOrEqual(0);
    expect(ex.unexplained).toBeLessThanOrEqual(ex.moments);
    // Nothing is shared out: no numbers are attached to contributors.
    for (const g of ex.groups) for (const c of g.items) expect(Object.keys(c).sort()).toEqual(['claim', 'external', 'status', 'suggested']);
  });
  it('an outcome nobody has explained says so, and what would help', () => {
    const ex = explainOutcome(data, 'n_goal_runway');
    if (!ex.groups.length) expect(ex.missing.length).toBeGreaterThan(0);
  });
  it('lists only what happened to you as outside, never your own decisions or notes', () => {
    for (const id of Object.keys(data.nodes)) for (const h of explainOutcome(data, id).outside) expect(h.ref.kind).toBe('occurrence');
  });
  it('reads a single happening against the possible reasons for it', () => {
    const items = historyItems(data);
    const moment = items.find((h) => h.ref.kind === 'occurrence' && (h.instanceOf || h.about.length) && explainMoment(data, h).present.length);
    expect(moment).toBeDefined();
    const ex = explainMoment(data, moment!);
    for (const { moment: m } of ex.present) expect(m.date <= moment!.date).toBe(true);
  });
});

describe('cycles, patterns and the canvas keep causes apart from connections', () => {
  beforeEach(() => useAtlas.getState().replaceData(createSeedData(TODAY)));

  it('a circle of hunches is not a cycle', () => {
    const data = createSeedData(TODAY);
    for (const l of findLoops(data)) for (const id of l.claimIds) expect(['plausible', 'supported', 'tested']).toContain(claimStatus(data, data.claims[id]));
  });

  it('a pattern reads as a sequence, not a chain of causes', () => {
    const data = createSeedData(TODAY);
    const p = Object.values(data.patterns).find((x) => x.steps.length > 1)!;
    expect(patternTitle(p)).not.toMatch(/→/);
    expect(patternTitle(p)).toMatch(/, then /);
  });

  it('in Causes, only possible reasons are drawn and only they make things near', () => {
    const data = createSeedData(TODAY);
    const g = buildOrbit(data, {
      lens: 'causes',
      stored: {},
      collapsed: new Set(),
      hiddenLayers: new Set(),
      showClaims: true,
      focus: false,
      query: '',
      today: TODAY,
      selectedId: 'n_brightline',
    });
    for (const e of g.edges) expect(['claim', 'member']).toContain(e.data!.family);
    const linkedOnly = Object.values(data.edges)
      .filter((l) => l.source === 'n_brightline' || l.target === 'n_brightline')
      .map((l) => (l.source === 'n_brightline' ? l.target : l.source))
      .filter((id) => !Object.values(data.claims).some((c) => [c.from, c.to, ...c.with].includes(id) && [c.from, c.to, ...c.with].includes('n_brightline')));
    for (const n of g.nodes) if (linkedOnly.includes(n.id)) expect(n.className).not.toBe('is-near');
  });

  it('on the Map, arcs between areas keep possible reasons apart from links, and only evidenced reasons pulse', () => {
    const data = createSeedData(TODAY);
    const g = buildOrbit(data, {
      lens: 'map',
      stored: {},
      collapsed: new Set(),
      hiddenLayers: new Set(),
      showClaims: true,
      focus: false,
      query: '',
      today: TODAY,
    });
    const arcs = g.edges.filter((e) => e.data!.family === 'area');
    expect(arcs.some((e) => e.data!.claimIds!.length && !e.data!.linkIds!.length)).toBe(true);
    expect(arcs.some((e) => !e.data!.claimIds!.length && e.data!.linkIds!.length)).toBe(true);
    for (const e of g.edges) {
      if (carriesInfluence(e.data)) {
        expect(e.data!.family).toBe('claim');
        expect(['plausible', 'supported', 'tested']).toContain(e.data!.status);
      }
    }
    for (const e of g.edges.filter((x) => x.data!.family === 'link' || x.data!.family === 'area')) expect(carriesInfluence(e.data)).toBe(false);
  });

  it('the store refuses a plan as evidence, and keeps an ordered pair', () => {
    const atlas = useAtlas.getState();
    const occ = Object.values(atlas.data.occurrences)[0];
    useAtlas.getState().replaceData({ ...atlas.data, occurrences: { ...atlas.data.occurrences, [occ.id]: { ...occ, mode: 'planned' } } });
    const before = useAtlas.getState().data.claims.c01.evidence.length;
    useAtlas
      .getState()
      .addClaimEvidence('c01', { source: { kind: 'occurrence', id: occ.id }, stance: 'supports', kind: 'instance', excerpt: '…', addedBy: 'user' });
    expect(useAtlas.getState().data.claims.c01.evidence.length).toBe(before);
    useAtlas.getState().addClaimEvidence('c09', { source: E(22), cause: E(21), stance: 'supports', kind: 'instance', excerpt: '…', addedBy: 'user' });
    expect(useAtlas.getState().data.claims.c09.evidence.some((e) => e.cause?.id === 'ent_21')).toBe(true);
  });
});
