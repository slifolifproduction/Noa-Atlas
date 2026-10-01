import { beforeEach, describe, expect, it } from 'vitest';
import { analyzeEntryLocally } from '../ai/localAnalysis';
import { createSeedData } from '../data/seed';
import { useAtlas } from '../state/atlasStore';
import { weaveEntry } from '../state/operations';
import { danglingReferences } from './integrity';
import { quests } from './quests';
import { bossesAbout, decisionIn, finishedIn, knownClaim, weaveOf } from './weave';

const seed = () => createSeedData();
const note = (content: string, title = '') => ({ title, content });

describe('steps a note says are finished', () => {
  it('finds the open step a sentence says is done, in English or Indonesian', () => {
    const d = seed();
    expect(finishedIn(d, note('Finished the scene 4 layout pass with Juna this morning.')).map((f) => f.id)).toEqual(['a07']);
    expect(finishedIn(d, note('Akhirnya selesai juga potong workshop deck jadi 20 slides.')).map((f) => f.id)).toEqual(['a10']);
    expect(finishedIn(d, note('Did the Sunday review after dinner.')).map((f) => f.id)).toEqual(['a11']);
    // A short sentence that only says so finishes the one before it.
    expect(finishedIn(d, note('Scene 4 layout pass. Done!')).map((f) => f.id)).toEqual(['a07']);
  });

  it('leaves alone what is not done yet, still to come, or only half named', () => {
    const d = seed();
    expect(finishedIn(d, note('Scene 5 rough boards are not done yet.'))).toEqual([]);
    expect(finishedIn(d, note('I will do the Sunday review tomorrow.'))).toEqual([]);
    expect(finishedIn(d, note('Belum selesai scene 4 layout pass.'))).toEqual([]);
    expect(finishedIn(d, note('Finished a scene today.'))).toEqual([]);
    // A number in the title has to match: scene 4 is not scene 5.
    expect(finishedIn(d, note('Finished the scene 6 layout pass.'))).toEqual([]);
    // Already done, or taken back before.
    expect(finishedIn(d, note('Invoiced Brightline milestone 2, done.'))).toEqual([]);
    expect(finishedIn(d, note('Finished the scene 4 layout pass.'), ['a07'])).toEqual([]);
  });
});

describe('a decision a note says was made', () => {
  it('reads what was chosen, what was passed over, why and what for, in English or Indonesian', () => {
    const en = decisionIn(
      note('Today I decided to take the Brightline retainer instead of the festival edit, so that the runway holds, because the money is steady.'),
    )!;
    expect(en.chosen).toBe('Take the Brightline retainer');
    expect(en.others).toEqual(['The festival edit']);
    expect(en.expected).toBe('The runway holds');
    expect(en.because).toBe('the money is steady');
    expect(en.optimizingFor).toEqual(expect.arrayContaining(['Income', 'Security']));
    const id = decisionIn(note('Akhirnya aku memutuskan ambil proyek dokumenter daripada podcast, biar ada waktu istirahat.'))!;
    expect(id.chosen).toBe('Ambil proyek dokumenter');
    expect(id.others).toEqual(['Podcast']);
    expect(id.expected).toBe('Ada waktu istirahat');
    expect(id.optimizingFor).toContain('Wellbeing');
    // Turning something down is the choice itself.
    expect(decisionIn(note('I turned down the Northlight role.'))!.chosen).toBe('Turned down the Northlight role');
  });

  it('leaves alone a choice not made yet, and reads the first sentence only when asked to', () => {
    expect(decisionIn(note('I still need to decide between the retainer and the film.'))).toBeUndefined();
    expect(decisionIn(note('Aku belum memutuskan mau ambil yang mana.'))).toBeUndefined();
    expect(decisionIn(note('Quiet day at the studio.'))).toBeUndefined();
    expect(decisionIn(note('Pause the podcast until spring. Marta knows.'), true)!.chosen).toBe('Pause the podcast until spring');
  });
});

describe('the weave', () => {
  const content =
    'Finished the scene 4 layout pass with Juna this morning. Energy dropped in the afternoon because of the late deadline sprint. Deep work in the morning, phone in another room.';

  beforeEach(() => useAtlas.getState().replaceData(seed()));

  const write = (text: string) => {
    const atlas = useAtlas.getState();
    const entry = atlas.addEntry({ kind: 'journal', title: 'Thursday', content: text, date: '2026-10-01', areas: [], tags: [], nodeIds: [] });
    useAtlas.getState().setEntryAnalysis(entry.id, analyzeEntryLocally(useAtlas.getState().data.entries[entry.id], useAtlas.getState().data));
    weaveEntry(entry.id);
    return entry.id;
  };

  it('takes on its own what the note says, and offers only what you have to say', () => {
    const id = write(content);
    const d = useAtlas.getState().data;
    const e = d.entries[id];
    const sugs = e.analysis!.suggestions;
    for (const s of sugs) {
      // An explanation is only connected on its own when it says again a reason you already hold.
      if (s.type === 'attribution') expect(s.state).toBe(knownClaim(d, s) ? 'accepted' : 'pending');
      else if (s.type === 'pattern_evidence' && s.stance === 'counters') expect(s.state).toBe('pending');
      else if (s.type !== 'area') expect([s.type, s.state, s.auto]).toEqual([s.type, 'accepted', true]);
    }
    // What it made is on record, with its trail back to the note.
    expect(e.nodeIds).toEqual(expect.arrayContaining(['n_juna', 'n_energy', 'n_deepwork', 'n_sprint']));
    expect(Object.values(d.occurrences).filter((o) => o.source?.kind === 'entry' && o.source.id === id).length).toBeGreaterThan(0);
    expect(d.patterns.pat_09.evidence.some((x) => x.source.kind === 'entry' && x.source.id === id)).toBe(true);
    // The step it finished, on the note's day, and the boss it hit.
    const step = d.navigation!.actions.find((a) => a.id === 'a07')!;
    expect([step.status, step.doneAt]).toEqual(['done', '2026-10-01']);
    expect(e.woven?.parts).toEqual(['a07']);
    expect(danglingReferences(d)).toEqual([]);

    const w = weaveOf(d, id, '2026-10-01');
    expect(w.strands.map((s) => s.lens)).toEqual(['map', 'time', 'causes', 'repeats', 'ahead', 'quests']);
    expect(w.strands.find((s) => s.lens === 'quests')!.threads[0].untie).toEqual({ kind: 'part', id: 'a07' });
    const boss = quests(d, '2026-10-01').bosses.find((b) => b.parts.some((p) => p.id === 'a07'))!;
    expect(w.strands.find((s) => s.lens === 'quests')!.threads[1].label).toContain(`${boss.hp}`);
  });

  it('takes every thread back exactly, and never ties a taken-back step again', () => {
    const before = useAtlas.getState().data;
    const id = write(content);
    for (const s of weaveOf(useAtlas.getState().data, id).strands)
      for (const thread of s.threads) if (thread.auto && thread.untie) useAtlas.getState().untie(id, thread.untie);
    let d = useAtlas.getState().data;
    const e = d.entries[id];
    expect(e.nodeIds).toEqual([]);
    expect(e.areas).toEqual([]);
    expect(Object.values(d.occurrences).filter((o) => o.source?.kind === 'entry' && o.source.id === id)).toEqual([]);
    expect(d.patterns.pat_09.evidence).toEqual(before.patterns.pat_09.evidence);
    expect(d.navigation!.actions.find((a) => a.id === 'a07')!.status).toBe('todo');
    expect(e.woven).toMatchObject({ parts: [], declined: ['a07'] });

    // Reading it again keeps what you took back.
    useAtlas.getState().setEntryAnalysis(id, analyzeEntryLocally(d.entries[id], d));
    weaveEntry(id);
    d = useAtlas.getState().data;
    expect(d.navigation!.actions.find((a) => a.id === 'a07')!.status).toBe('todo');
    expect(d.entries[id].analysis!.suggestions.filter((s) => s.state === 'accepted')).toEqual([]);
    expect(danglingReferences(d)).toEqual([]);
  });

  it('connects an explanation you already hold to that reason, without counting it as evidence', () => {
    const id = write(content);
    const d = useAtlas.getState().data;
    const sug = d.entries[id].analysis!.suggestions.find((s) => s.type === 'attribution')!;
    expect([sug.state, sug.made]).toEqual(['accepted', undefined]);
    const thread = weaveOf(d, id)
      .strands.find((s) => s.lens === 'causes')!
      .threads.find((x) => x.key.startsWith('h:'))!;
    expect(d.claims[thread.ref!.id]).toMatchObject({ from: 'n_sprint', to: 'n_energy' });
    expect(d.claims[thread.ref!.id].evidence.some((e) => e.source.id === id)).toBe(false);
    // Taking it back leaves the reason as it was.
    useAtlas.getState().untie(id, thread.untie!);
    expect(useAtlas.getState().data.claims[thread.ref!.id]).toEqual(d.claims[thread.ref!.id]);
  });

  it('makes a new explanation a hunch with one tap, with no evidence from the note, and takes it back', () => {
    const id = write('Morning deep work is gone because of the afternoon interruptions.');
    const sug = useAtlas.getState().data.entries[id].analysis!.suggestions.find((s) => s.type === 'attribution')!;
    const claimId = useAtlas.getState().claimFromNote(id, sug.id)!;
    let d = useAtlas.getState().data;
    expect(d.claims[claimId]).toMatchObject({ from: 'n_afternoons', to: 'n_deepwork', evidence: [] });
    const thread = weaveOf(d, id)
      .strands.find((s) => s.lens === 'causes')!
      .threads.find((x) => x.ref?.id === claimId)!;
    useAtlas.getState().untie(id, thread.untie!);
    d = useAtlas.getState().data;
    expect(d.claims[claimId]).toBeUndefined();
    expect(danglingReferences(d)).toEqual([]);
  });

  it('puts a note in an area only when most of what it is about sits there', () => {
    const one = write('Juna and Ruth came by the studio.');
    const d = useAtlas.getState().data;
    const linked = d.entries[one].nodeIds.map((n) => d.nodes[n].area);
    const top = linked.filter((a) => a === linked[0]).length;
    if (top >= 2 && linked.every((a) => a === linked[0])) expect(d.entries[one].areas).toEqual([linked[0]]);
    const mixed = write('Energy dropped and Juna called.');
    const m = useAtlas.getState().data;
    const areas = new Set(m.entries[mixed].nodeIds.map((n) => m.nodes[n].area));
    if (areas.size > 1) expect(m.entries[mixed].areas).toEqual([]);
  });

  it('logs the decision a note says was made, with what it is about, and takes it back for good', () => {
    const id = write('Decided to pause the podcast instead of the Lowlight video, so Night Ferry gets my mornings.');
    let d = useAtlas.getState().data;
    const decisionId = d.entries[id].woven!.decision!;
    expect(d.decisions[decisionId]).toMatchObject({ chosenAction: 'Pause the podcast', date: '2026-10-01', expectedOutcome: 'Night Ferry gets my mornings' });
    expect(d.decisions[decisionId].options.map((o) => o.label)).toEqual(['Pause the podcast', 'The Lowlight video']);
    expect(weaveOf(d, id).strands.find((s) => s.lens === 'time')!.threads[0]).toMatchObject({
      ref: { kind: 'decision', id: decisionId },
      untie: { kind: 'decision' },
    });
    useAtlas.getState().untie(id, { kind: 'decision' });
    weaveEntry(id);
    d = useAtlas.getState().data;
    expect(d.decisions[decisionId]).toBeUndefined();
    expect(d.entries[id].woven).toMatchObject({ decisionDeclined: true });
    expect(Object.values(d.decisions).some((x) => x.context === d.entries[id].content)).toBe(false);
    expect(danglingReferences(d)).toEqual([]);
  });

  it('shows in Quests what the focus touches: a step a note about it finished, its armor, a step that names it', () => {
    write('Finished the scene 4 layout pass with Juna this morning.');
    const d = useAtlas.getState().data;
    const viaNote = bossesAbout(d, ['n_juna'], '2026-10-01');
    expect(viaNote.some((x) => x.boss.parts.some((p) => p.id === 'a07') && x.how.includes('note'))).toBe(true);
    // Nothing ties a stranger to any boss.
    expect(bossesAbout(d, ['n_ruth'], '2026-10-01').filter((x) => x.how.includes('note'))).toEqual([]);
    // Armor: a repeat that involves it.
    const pattern = Object.values(d.patterns).find((p) => p.nodeIds.length)!;
    const boss = quests(d, '2026-10-01').bosses[0];
    useAtlas.getState().addArmor(boss.id, { kind: 'pattern', id: pattern.id });
    const withArmor = bossesAbout(useAtlas.getState().data, [pattern.nodeIds[0]], '2026-10-01');
    expect(withArmor.find((x) => x.boss.id === boss.id)?.how).toContain('armor');
  });

  it('lets go of a finished step when it leaves the plan', () => {
    const id = write(content);
    useAtlas.getState().deleteAction('a07');
    const d = useAtlas.getState().data;
    expect(d.entries[id].woven?.parts).toEqual([]);
    expect(danglingReferences(d)).toEqual([]);
  });
});
