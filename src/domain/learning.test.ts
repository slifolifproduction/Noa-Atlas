import { describe, expect, it } from 'vitest';
import { analyzeEntryLocally } from '../ai/localAnalysis';
import { createSeedData } from '../data/seed';
import { claimStatus, statusFromProfile, statusRule } from './claims';
import { inquiries } from './inquiry';
import { calibration, emptyLearning, learnLink, linksFromWords, memory, noteSuggestion, sortSuggestions, suggestionRank } from './learning';
import type { AtlasData, Entry } from './types';

const TODAY = '2026-09-30';
const note = (title: string, content: string): Pick<Entry, 'title' | 'content' | 'nodeIds'> => ({ title, content, nodeIds: [] });

describe('what the Atlas learns from the person', () => {
  it('shows kinds of suggestion the person usually takes first, without hiding any', () => {
    const data = createSeedData(TODAY);
    const mem = memory(data);
    for (let i = 0; i < 3; i++) noteSuggestion(mem, 'area', false);
    for (let i = 0; i < 3; i++) noteSuggestion(mem, 'link_node', true);
    expect(suggestionRank(data, 'link_node')).toBeGreaterThan(0.5);
    expect(suggestionRank(data, 'area')).toBeLessThan(0.5);
    expect(suggestionRank(data, 'change')).toBe(0.5);
    const sorted = sortSuggestions(data, [{ type: 'area' as const }, { type: 'change' as const }, { type: 'link_node' as const }]);
    expect(sorted.map((s) => s.type)).toEqual(['link_node', 'change', 'area']);
  });

  it('learns the person’s own words for an element, and forgets them when asked', () => {
    const data = createSeedData(TODAY);
    const node = Object.values(data.nodes).find((n) => n.label === 'Energy')!;
    const mem = memory(data);
    for (const day of ['Monday', 'Tuesday', 'Wednesday']) learnLink(mem, note(`${day} slump`, 'Sluggish after lunch again.'), node.id, node.label);
    const found = linksFromWords(data, note('Thursday', 'Very sluggish all afternoon.'));
    expect(found.map((f) => f.nodeId)).toContain(node.id);
    expect(found.find((f) => f.nodeId === node.id)!.words[0]).toMatchObject({ word: 'sluggish', notes: 3 });
    mem.forgotten.push(`${node.id}:sluggish`);
    expect(linksFromWords(data, note('Friday', 'Sluggish.')).some((f) => f.nodeId === node.id)).toBe(false);
  });

  it('does not suggest from a word that goes with everything', () => {
    const data = createSeedData(TODAY);
    const [a, b] = Object.values(data.nodes).filter((n) => n.adopted);
    const mem = memory(data);
    for (let i = 0; i < 3; i++) {
      learnLink(mem, note('Week', 'Meeting heavy week'), a.id, a.label);
      learnLink(mem, note('Week', 'Meeting heavy week'), b.id, b.label);
    }
    // "meeting" went with both equally: half the time with each is not telling.
    expect(linksFromWords(data, note('Today', 'Another meeting.'))).toEqual([]);
  });

  it('reading a note suggests an element from those words, with the count as its reason', () => {
    const data = createSeedData(TODAY);
    const node = Object.values(data.nodes).find((n) => n.label === 'Energy')!;
    const mem = memory(data);
    for (let i = 0; i < 4; i++) learnLink(mem, note('Slump', 'Sluggish again'), node.id, node.label);
    const entry: Entry = { ...Object.values(data.entries)[0], id: 'ent_new', title: 'Afternoon', content: 'Sluggish from two onwards.', nodeIds: [] };
    const out = analyzeEntryLocally(entry, data);
    const link = out.suggestions.find((s) => s.type === 'link_node' && s.nodeId === node.id);
    expect(link?.reason).toMatch(/4 notes/);
  });
});

describe('a stricter rule for "supported", only when the person asks for it', () => {
  const base = { episodes: 3, contrast: 1, counter: 0, testsFor: 0, testsAgainst: 0, mechanism: false } as Parameters<typeof statusRule>[0];

  it('asks for more separate episodes when set', () => {
    expect(statusFromProfile(base)).toBe('supported');
    expect(statusRule(base, false, 4)).toBe('plausible.episodes');
    expect(statusRule({ ...base, episodes: 4 }, false, 4)).toBe('supported');
  });

  it('changes what the atlas reads, and nothing else', () => {
    const data = createSeedData(TODAY);
    const supported = Object.values(data.claims).filter((c) => claimStatus(data, c) === 'supported');
    expect(supported.length).toBeGreaterThan(0);
    const stricter: AtlasData = structuredClone(data);
    stricter.learning = { ...emptyLearning(TODAY), rules: { supportedEpisodes: 9 } };
    for (const c of supported) expect(claimStatus(stricter, stricter.claims[c.id])).not.toBe('supported');
    expect(Object.keys(stricter.claims)).toEqual(Object.keys(data.claims));
  });
});

describe('how the Atlas’s predictions went', () => {
  it('counts settled predictions by the status of the reasons behind them', () => {
    const rows = calibration(createSeedData(TODAY), TODAY);
    const total = rows.reduce((n, r) => n + r.held + r.failed, 0);
    expect(total).toBeGreaterThan(0);
    for (const r of rows) expect(['proposed', 'plausible', 'supported', 'tested', 'weakened', 'retired']).toContain(r.status);
  });
});

describe('questions the person keeps putting away', () => {
  it('are asked after the others of the same weight', () => {
    const data = createSeedData(TODAY);
    const before = inquiries(data, TODAY);
    const kind = before[0].kind;
    const moved: AtlasData = structuredClone(data);
    moved.learning = { ...emptyLearning(TODAY), declined: { [kind]: 3 } };
    const after = inquiries(moved, TODAY);
    expect(after).toHaveLength(before.length);
    const firstOther = after.findIndex((q) => q.decisive === before[0].decisive && q.kind !== kind);
    if (firstOther >= 0) expect(after.findIndex((q) => q.kind === kind && q.decisive === before[0].decisive)).toBeGreaterThan(firstOther);
  });
});
