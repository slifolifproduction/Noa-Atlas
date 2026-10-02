import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeEntryLocally } from '../ai/localAnalysis';
import { createSeedData } from '../data/seed';
import { emptyLearning } from '../domain/learning';
import { allWork } from '../domain/quests';
import type { AtlasData, Entry } from '../domain/types';
import { useAtlas } from '../state/atlasStore';
import { weaveEntry } from '../state/operations';
import { calibrate, readSentences, useBackendForTests, useLocalAI } from './engine';
import { Net, type SavedNet } from './nn';
import { readWithAI } from './reader';
import { HEAD_NAMES, HEADS, type Labels } from './tasks';

/*
 * The language model cannot be downloaded in a test, so a stand-in reads meaning the way it would, crudely: words
 * that mean the same (in either language) share a direction, every other word adds a little noise. That is enough
 * to check what the reader does with "close in meaning"; how well the real model reads is for the app to measure.
 */
const MEANINGS: Record<string, string[]> = {
  tired: ['energy', 'depleted', 'capek', 'lelah', 'tired', 'exhausted', 'drained', 'lemes'],
  deck: ['deck', 'slides', 'presentasi', 'presentation'],
  workshop: ['workshop', 'panel'],
  money: ['runway', 'savings', 'tabungan', 'duit', 'uang', 'money'],
  night: ['begadang', 'all-nighters', 'overnight', 'semalaman'],
};
const NOISE = 48;
const DIMS = Object.keys(MEANINGS).length + NOISE;
function vectorOf(text: string): Float32Array {
  const v = new Float32Array(DIMS);
  for (const w of text.toLowerCase().match(/[\p{L}\d-]+/gu) ?? []) {
    const k = Object.values(MEANINGS).findIndex((ws) => ws.includes(w));
    if (k >= 0) v[k] += 3;
    else {
      let h = 2166136261;
      for (const c of w) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
      v[Object.keys(MEANINGS).length + ((h >>> 0) % NOISE)] += 0.3;
    }
  }
  return v;
}
const embedder = { embed: async (texts: string[]) => texts.map(vectorOf) };

/** Heads that read every sentence one way, for sure: what the reader does with a reading is what is tested here. */
function headsReading(labels: Labels): Net {
  const net = new Net({ input: DIMS, sparse: false, hidden: 0, heads: HEAD_NAMES.map((h) => HEADS[h].length), seed: 1 });
  net.Wh.forEach((w) => w.fill(0));
  HEAD_NAMES.forEach((h, i) => (net.bh[i][(HEADS[h] as readonly string[]).indexOf(labels[h])] = 8));
  return net;
}
const flat: Labels = { act: 'happened', direction: 'none', cause: 'no', time: 'past', mood: 'neutral' };

const lite = Net.load(JSON.parse(readFileSync(join(__dirname, '../../public/ml/lite.json'), 'utf8')) as SavedNet);

let n = 0;
const entryOf = (content: string, extra: Partial<Entry> = {}): Entry => ({
  id: `e_test_${++n}`,
  seq: 900 + n,
  kind: 'journal',
  title: '',
  content,
  date: '2026-10-01',
  areas: [],
  tags: [],
  nodeIds: [],
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
  ...extra,
});
const read = (data: AtlasData, content: string, extra: Partial<Entry> = {}) => {
  const entry = entryOf(content, extra);
  return readWithAI(entry, data, analyzeEntryLocally(entry, data));
};

afterEach(() => useBackendForTests(null, null));

describe('the local AI with the built-in model (nothing downloaded)', () => {
  beforeEach(() => useBackendForTests(null, null, lite));

  it('reads every sentence and keeps what it read with the note, adding to the rules, never replacing them', async () => {
    const data = createSeedData();
    const entry = entryOf('Capek banget karena lembur terus. Aku putuskan buat nolak tawaran agency.');
    const base = analyzeEntryLocally(entry, data);
    const out = await readWithAI(entry, data, base);
    expect(out.provider).toBe('Local AI');
    expect(out.readings?.map((r) => r.text)).toEqual(['Capek banget karena lembur terus.', 'Aku putuskan buat nolak tawaran agency.']);
    expect(out.readings?.every((r) => r.by === 'lite')).toBe(true);
    for (const s of base.suggestions) expect(out.suggestions.map((x) => x.id)).toContain(s.id);
    // A choice made, for the weave to log; how the note sounds, from what it says.
    expect(out.hints?.decided).toBe('Aku putuskan buat nolak tawaran agency.');
    expect(out.observations.map((o) => o.statement)).toContain('Sounds low.');
  });

  it('offers an explanation in your own words as a hypothesis, and finds nothing by meaning without the language model', async () => {
    const out = await read(createSeedData(), 'Hari ini gak produktif gara-gara rapat terus dari pagi.');
    const explained = out.suggestions.filter((s) => s.type === 'attribution');
    expect(explained.length).toBeGreaterThan(0);
    expect(explained.every((s) => s.state === 'pending')).toBe(true);
    expect(out.suggestions.some((s) => s.type === 'link_node' && s.excerpt)).toBe(false);
    expect(out.hints?.finished).toBeUndefined();
  });

  it('reads the way you corrected it', async () => {
    const text = 'Gajian dari Brightline akhirnya masuk.';
    const [before] = await readSentences([text]);
    const want = before.labels.mood === 'high' ? 'neutral' : 'high';
    const [after] = await readSentences([text], [[text, HEAD_NAMES.indexOf('mood'), (HEADS.mood as readonly string[]).indexOf(want)]]);
    expect(after.labels.mood).toBe(want);
    // The others are left as they were.
    expect(after.labels.act).toBe(before.labels.act);
    // And without the correction, it reads as before.
    expect((await readSentences([text]))[0].labels.mood).toBe(before.labels.mood);
  });
});

describe('the local AI with the language model', () => {
  it('finds an element a note is about by meaning, with the sentence that means it', async () => {
    useBackendForTests(embedder, headsReading(flat));
    const data = createSeedData();
    const out = await read(data, 'Hari ini lemes banget. Rapat sama klien.');
    const link = out.suggestions.find((s) => s.type === 'link_node' && s.nodeId === 'n_energy');
    expect(link).toMatchObject({ excerpt: 'Hari ini lemes banget.', state: 'pending', reason: 'Close in meaning to “Energy”.' });
    expect(out.readings?.every((r) => r.by === 'model')).toBe(true);
    // Not for an element the note is already linked to.
    const again = await read(data, 'Hari ini lemes banget.', { nodeIds: ['n_energy'] });
    expect(again.suggestions.some((s) => s.type === 'link_node' && s.nodeId === 'n_energy')).toBe(false);
  });

  it('never offers again what you took back, and learns from the sentences you linked yourself', async () => {
    useBackendForTests(embedder, headsReading(flat));
    const data = createSeedData();
    data.learning = { ...(data.learning ?? emptyLearning()), ml: { corrections: [], links: { n_energy: { yes: [], no: ['Hari ini lemes banget.'] } } } };
    const out = await read(data, 'Hari ini lemes banget.');
    expect(out.suggestions.some((s) => s.type === 'link_node' && s.nodeId === 'n_energy')).toBe(false);

    // Juna is a person: nothing in their name or summary means money, but you linked notes about money to them.
    const plain = await read(createSeedData(), 'Duit tabungan tipis.');
    expect(plain.suggestions.some((s) => s.type === 'link_node' && s.nodeId === 'n_juna')).toBe(false);
    const taught = createSeedData();
    taught.learning = {
      ...(taught.learning ?? emptyLearning()),
      ml: { corrections: [], links: { n_juna: { yes: ['Uang dari Juna belum masuk, tabungan tipis.'], no: [] } } },
    };
    const learned = await read(taught, 'Duit tabungan tipis.');
    expect(learned.suggestions.some((s) => s.type === 'link_node' && s.nodeId === 'n_juna')).toBe(true);
  });

  it('reads a step as finished in other words than its title, and the weave ticks it off', async () => {
    useBackendForTests(embedder, headsReading({ ...flat, act: 'done' }));
    useAtlas.getState().replaceData(createSeedData());
    const text = 'Presentasi workshop sudah dipangkas.';
    const entry = useAtlas.getState().addEntry({ kind: 'journal', title: '', content: text, date: '2026-10-01', areas: [], tags: [], nodeIds: [] });
    const data = useAtlas.getState().data;
    const analysis = await readWithAI(data.entries[entry.id], data, analyzeEntryLocally(data.entries[entry.id], data));
    expect(analysis.hints?.finished).toEqual([{ id: 'a10', excerpt: text }]);
    useAtlas.getState().setEntryAnalysis(entry.id, analysis);
    weaveEntry(entry.id);
    expect(allWork(useAtlas.getState().data).actions.find((a) => a.id === 'a10')?.status).toBe('done');
    // Something done that is not plainly one of the open steps finishes none of them.
    const other = await read(useAtlas.getState().data, 'Rapat sama klien sudah beres.');
    expect(other.hints?.finished).toBeUndefined();
  });

  it('reads what went down, matched to the factor it is about, and what is expected to as an expectation', async () => {
    useBackendForTests(embedder, headsReading({ ...flat, direction: 'down' }));
    const past = await read(createSeedData(), 'Lemes banget seharian.');
    expect(past.suggestions.find((s) => s.type === 'change' && s.factor === 'n_energy')).toMatchObject({
      reads: 'down',
      reason: 'Reads as “Energy” going down.',
    });

    useBackendForTests(embedder, headsReading({ ...flat, direction: 'down', time: 'future' }));
    const ahead = await read(createSeedData(), 'Lemes banget seharian.');
    expect(ahead.suggestions.find((s) => s.type === 'expectation' && s.factor === 'n_energy')).toMatchObject({ reads: 'down' });
  });

  it('takes a link by meaning on its own, and only offers what would count as a record', async () => {
    useBackendForTests(embedder, headsReading({ ...flat, direction: 'down' }));
    useAtlas.getState().replaceData(createSeedData());
    const entry = useAtlas
      .getState()
      .addEntry({ kind: 'journal', title: '', content: 'Lemes banget seharian.', date: '2026-10-01', areas: [], tags: [], nodeIds: [] });
    const data = useAtlas.getState().data;
    useAtlas.getState().setEntryAnalysis(entry.id, await readWithAI(data.entries[entry.id], data, analyzeEntryLocally(data.entries[entry.id], data)));
    weaveEntry(entry.id);
    const after = useAtlas.getState().data.entries[entry.id];
    expect(after.nodeIds).toContain('n_energy');
    const change = after.analysis?.suggestions.find((s) => s.type === 'change' && s.factor === 'n_energy');
    expect(change).toMatchObject({ inferred: true, state: 'pending' });
    // Taking the link back is an example of what the note is not about.
    const link = after.analysis!.suggestions.find((s) => s.type === 'link_node' && s.nodeId === 'n_energy')!;
    useAtlas.getState().untie(entry.id, { kind: 'suggestion', id: link.id });
    expect(useAtlas.getState().data.learning?.ml?.links.n_energy?.no).toEqual(['Lemes banget seharian.']);
  });

  it('measures "close in meaning" on your own links once there are enough of them', async () => {
    useBackendForTests(embedder, headsReading(flat));
    const linked = Array.from({ length: 8 }, (_, i) => ({ sentences: [`Capek lelah ${i}`], label: 'Energy', linked: true }));
    const not = Array.from({ length: 8 }, (_, i) => ({ sentences: [`Rapat klien ${i}`], label: 'Energy', linked: false }));
    await calibrate(linked.slice(0, 7));
    expect(useLocalAI.getState().calibratedOn).toBeUndefined();
    await calibrate([...linked, ...not]);
    const { threshold, calibratedOn } = useLocalAI.getState();
    expect(calibratedOn).toBe(8);
    expect(threshold).toBeGreaterThan(0.3);
    expect(threshold).toBeLessThan(0.85);
  });
});
