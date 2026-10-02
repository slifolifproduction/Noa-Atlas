import { beforeEach, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { danglingReferences } from '../domain/integrity';
import { allWork } from '../domain/quests';
import { useAtlas } from '../state/atlasStore';
import { applicable, applyChanges, draftChanges, summary, undoChanges } from './changes';
import type { Change } from './types';

const atlas = () => useAtlas.getState().data;
const counts = () => {
  const d = atlas();
  return {
    nodes: Object.keys(d.nodes).length,
    edges: Object.keys(d.edges).length,
    claims: Object.keys(d.claims).length,
    patterns: Object.keys(d.patterns).length,
    paths: Object.keys(d.paths).length,
    entries: Object.keys(d.entries).length,
    decisions: Object.keys(d.decisions).length,
    targets: allWork(d).targets.length,
    occurrences: Object.keys(d.occurrences).length,
  };
};

const SIX: Change[] = [
  { kind: 'element', label: 'Belajar bahasa Jepang', element: 'goal', area: 'growth' },
  { kind: 'element', label: 'Energy', element: 'state', area: 'health' },
  { kind: 'link', from: 'Belajar bahasa Jepang', to: 'Two-track practice', link: 'aligns' },
  { kind: 'reason', from: 'Late deadline sprints', to: 'Belajar bahasa Jepang', effect: 'lowers', how: 'no evenings left' },
  { kind: 'repeat', steps: ['Late deadline sprints', 'Skipped lesson'], observation: 'A sprint week leaves no time for the lesson.' },
  { kind: 'option', title: 'Kursus malam', objective: 'Two evenings a week of classes' },
  { kind: 'quest', title: 'JLPT N5', due: '2026-12-06', steps: ['Hiragana', 'Katakana', 'First 100 kanji'] },
  { kind: 'note', content: 'Hari ini mulai belajar bahasa Jepang, 30 menit hiragana. Energi lumayan.', date: '2026-10-01' },
];

describe('the agent’s changes, as a preview the person applies', () => {
  beforeEach(() => useAtlas.getState().replaceData(createSeedData()));

  it('checks every part against the atlas: names that exist are used, unknown ones are said, nothing is made twice', () => {
    const set = draftChanges(atlas(), [
      ...SIX,
      { kind: 'reason', from: 'Something unnamed', to: 'Energy', effect: 'raises' },
      { kind: 'element', label: 'belajar Bahasa Jepang', element: 'goal', area: 'growth' },
    ]);
    const by = (label: string) => set.items.find((i) => 'label' in i.change && i.change.label === label)!;
    expect(by('Energy').exists).toBe(true);
    expect(by('Belajar bahasa Jepang').problem).toBeUndefined();
    expect(by('belajar Bahasa Jepang').problem).toMatch(/twice/);
    expect(set.items.find((i) => i.change.kind === 'reason' && i.change.from === 'Something unnamed')?.problem).toMatch(/Something unnamed/);
    // The reason to a goal the same set adds is fine.
    expect(set.items.find((i) => i.change.kind === 'reason' && i.change.from === 'Late deadline sprints')?.problem).toBeUndefined();
    expect(summary(set)).toBe('Map 2 · Time 1 · Causes 1 · Repeats 1 · Ahead 1 · Quests 1');
  });

  it('builds all six lenses when applied, a reason as a hunch with no evidence, and the note woven last', async () => {
    const before = counts();
    const set = await applyChanges(draftChanges(atlas(), SIX));
    expect(set.state).toBe('applied');
    const after = counts();
    expect(after.nodes).toBe(before.nodes + 1);
    expect(after.edges).toBe(before.edges + 1);
    expect(after.claims).toBe(before.claims + 1);
    expect(after.patterns).toBe(before.patterns + 1);
    expect(after.paths).toBe(before.paths + 1);
    expect(after.targets).toBe(before.targets + 1);
    expect(after.entries).toBe(before.entries + 1);
    const goal = Object.values(atlas().nodes).find((n) => n.label === 'Belajar bahasa Jepang')!;
    const claim = Object.values(atlas().claims).find((c) => c.to === goal.id)!;
    expect(claim).toMatchObject({ author: 'inferred', via: 'no evenings left' });
    expect(claim.evidence ?? []).toEqual([]);
    // The note was read and connected to what the same set added.
    const note = Object.values(atlas().entries).find((e) => e.content.startsWith('Hari ini mulai belajar'))!;
    expect(note.analysis).toBeDefined();
    expect(note.nodeIds).toContain(goal.id);
    expect(danglingReferences(atlas())).toEqual([]);
  });

  it('takes back exactly what it made, and what its note connected on its own', async () => {
    const before = counts();
    const applied = await applyChanges(draftChanges(atlas(), SIX));
    const undone = undoChanges(applied);
    expect(undone.state).toBe('undone');
    expect(counts()).toEqual(before);
    expect(danglingReferences(atlas())).toEqual([]);
  });

  it('leaves out what the person unticked, and what has a problem', async () => {
    const set = draftChanges(atlas(), SIX);
    set.items = set.items.map((i) => (i.change.kind === 'quest' ? { ...i, include: false } : i));
    expect(applicable(set).some((i) => i.change.kind === 'quest')).toBe(false);
    const before = counts();
    await applyChanges(set);
    expect(counts().targets).toBe(before.targets);
  });
});
