import { describe, expect, it } from 'vitest';
import { createEmptyData } from '../data/empty';
import { createSeedData } from '../data/seed';
import type { AtlasData } from '../domain/types';
import { toCurrentShape } from './migrate';

const at = '2026-01-01T00:00:00.000Z';
const v1 = {
  profile: { name: 'Someone', createdAt: at },
  domains: { identity: { key: 'identity', statement: 'A writer', summary: '', updatedAt: at } },
  nodes: {
    a: { id: 'a', label: 'Say yes to work', summary: '', domain: 'habits', origin: 'user', tags: [], createdAt: at },
    b: { id: 'b', label: 'Progress on the book', summary: '', domain: 'projects', origin: 'user', tags: [], createdAt: at },
    q: { id: 'q', label: 'Why does it slip?', summary: '', category: 'question', origin: 'user', tags: [], createdAt: at },
    x: { id: 'x', label: 'The festival', summary: '', category: 'experience', source: { kind: 'entry', id: 'e1' }, origin: 'user', tags: [], createdAt: at },
  },
  edges: {
    e_causes: { id: 'e_causes', source: 'a', target: 'b', relation: 'causes', origin: 'user', createdAt: at },
    e_part: { id: 'e_part', source: 'q', target: 'b', relation: 'examines', origin: 'user', createdAt: at },
    e_contra: { id: 'e_contra', source: 'a', target: 'q', relation: 'contradicts', origin: 'user', createdAt: at },
  },
  entries: {
    e1: {
      id: 'e1',
      seq: 1,
      kind: 'experience',
      title: 'Festival',
      content: 'It went well.',
      date: '2026-01-05',
      domains: ['projects'],
      tags: [],
      nodeIds: ['x', 'b'],
      createdAt: at,
      updatedAt: at,
    },
  },
  decisions: {},
  patterns: {
    p1: {
      id: 'p1',
      code: 1,
      kind: 'behavioral',
      title: 'Yes then slip',
      chain: ['Say yes', 'Slip'],
      observation: '',
      triggers: [],
      behaviors: [],
      consequences: [],
      evidence: [{ id: 'ev1', source: { kind: 'entry', id: 'e1' }, stance: 'supports', excerpt: 'It went well.', weight: 1, addedBy: 'user', addedAt: at }],
      interpretations: [{ id: 'i', statement: 'x', confidence: 0.6 }],
      counterEvidence: [],
      implications: [],
      domains: ['projects'],
      nodeIds: ['a'],
      cues: { supports: [], counters: [] },
      status: 'dismissed',
      origin: 'inferred',
      createdAt: at,
      updatedAt: at,
    },
  },
  paths: {},
  experiments: {},
  currentState: { position: '', summary: '', constraints: [], assets: [], updatedAt: at },
  navigation: null,
  modelLog: [],
  counters: { entry: 1, decision: 0, pattern: 1, experiment: 0 },
};

describe('migration from the first data shape', () => {
  const data = toCurrentShape(v1);

  it('turns domains into areas and nodes into elements of a kind', () => {
    expect(data.areas.self.statement).toBe('A writer');
    expect(data.nodes.a).toMatchObject({ kind: 'behaviour', area: 'health', adopted: true });
    expect(data.nodes.b).toMatchObject({ kind: 'commitment', area: 'projects' });
    expect(data.nodes.q.kind).toBe('question');
  });

  it('turns effect edges into claims with no evidence, organising edges into links, and drops evidence edges', () => {
    const claims = Object.values(data.claims);
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ from: 'a', to: 'b', effect: 'raises', state: 'adopted', evidence: [] });
    expect(Object.values(data.edges).map((e) => e.type)).toEqual(['about']);
  });

  it('moves experience mirrors into history as landmarks', () => {
    expect(data.nodes.x).toBeUndefined();
    const occ = Object.values(data.occurrences);
    expect(occ).toHaveLength(1);
    expect(occ[0]).toMatchObject({ kind: 'experience', landmark: true, date: '2026-01-05', mode: 'actual' });
    expect(data.entries.e1.nodeIds).toEqual(['b']);
  });

  it('keeps pattern evidence but drops scores and interpretations', () => {
    const p = data.patterns.p1;
    expect(p.steps.map((s) => s.label)).toEqual(['Say yes', 'Slip']);
    expect(p.evidence[0]).not.toHaveProperty('weight');
    expect(p).not.toHaveProperty('interpretations');
    expect(p.setAside).toBeDefined();
  });

  it('leaves data already in the current shape alone', () => {
    expect(toCurrentShape(data)).toEqual({ ...data, loopNames: data.loopNames });
  });
});

describe('v2 → v3: the logic of causes', () => {
  it('gives a stored sample its corrected claims once, keeping what the person added', () => {
    const fresh = createSeedData('2026-09-28');
    // A v2 sample: the old evidence on c22, no rival, and a piece of the person's own evidence.
    const old = structuredClone(fresh) as AtlasData;
    delete old.causesLogic;
    delete old.claims.c25;
    old.claims.c22 = { ...old.claims.c22, rivalIds: [], evidence: old.claims.c22.evidence.map((e) => ({ ...e, stance: 'counters', kind: 'counter_case' })) };
    old.claims.c01 = { ...old.claims.c01, evidence: [...old.claims.c01.evidence, { ...old.claims.c01.evidence[0], id: 'ev_mine' }] };
    const up = toCurrentShape(old);
    expect(up.causesLogic).toBe(3);
    expect(up.claims.c22.evidence.every((e) => e.kind === 'elsewhere' && e.stance === 'neutral')).toBe(true);
    expect(up.claims.c25).toBeDefined();
    expect(up.claims.c01.evidence.some((e) => e.id === 'ev_mine')).toBe(true);
    // Run again (a restored version): nothing changes.
    const edited = { ...up, claims: { ...up.claims, c02: { ...up.claims.c02, when: 'my own condition' } } };
    expect(toCurrentShape(edited).claims.c02.when).toBe('my own condition');
  });

  it('leaves the person’s own atlas as it is', () => {
    const own = { ...createEmptyData('Sam') };
    delete (own as Partial<AtlasData>).causesLogic;
    const up = toCurrentShape(own);
    expect(up.claims).toEqual(own.claims);
    expect(up.causesLogic).toBe(3);
  });
});
