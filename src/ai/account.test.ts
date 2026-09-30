import { beforeAll, describe, expect, it } from 'vitest';
import { createSeedData } from '../data/seed';
import { accountCall, jsonPrompt, sampleErrorText } from './account';
import { AnalysisError } from './errors';
import { checkReview, reviewInput, reviewTools, runReview, type Review } from './review';
import { TASKS } from './schemas';

const TODAY = '2026-09-30';

/** What the stand-in for claude.ai's `sample` answers next (a value, or a rejection). */
let next: { value?: unknown; error?: { code: string; message: string } } = {};
const prompts: string[] = [];

beforeAll(() => {
  const sample = async () => ({ text: '', truncated: false });
  sample.json = async (input: string) => {
    prompts.push(input);
    if (next.error) throw next.error;
    return next.value;
  };
  sample.limits = async () => ({ maxPromptBytes: 262144 });
  (globalThis as { claude?: unknown }).claude = { use: async (name: string) => (name === 'sample' ? sample : null) };
});

describe('Claude on the viewer’s own account', () => {
  it('puts the task, the answer’s JSON Schema and the input into one prompt', () => {
    const prompt = jsonPrompt('Do the task.', TASKS.experiment_review.schema, { a: 1 });
    expect(prompt).toContain('Do the task.');
    expect(prompt).toContain('"learning_note"');
    expect(prompt).toContain('{"a":1}');
  });

  it('checks the answer against the schema before anything reads it', async () => {
    next = { value: { learning_note: 'It held.' } };
    await expect(accountCall('experiment_review', {})).resolves.toEqual({ learning_note: 'It held.' });
    next = { value: { something_else: true } };
    await expect(accountCall('experiment_review', {})).rejects.toBeInstanceOf(AnalysisError);
  });

  it('says plainly why a call did not go through', async () => {
    next = { error: { code: 'not_granted', message: 'declined' } };
    await expect(accountCall('experiment_review', {})).rejects.toThrow(sampleErrorText('not_granted'));
    expect(sampleErrorText('rate_limited')).not.toBe(sampleErrorText('not_granted'));
    expect(sampleErrorText('something new')).toBe(sampleErrorText('upstream_error'));
  });
});

describe('the weekly review', () => {
  const data = createSeedData(TODAY);
  const [a, b] = Object.values(data.nodes).filter((n) => n.adopted);
  const existing = Object.values(data.claims).find((c) => c.state !== 'set_aside')!;
  const note = Object.values(data.entries)[0];

  it('reads a compact copy of the atlas: elements, reasons, recent notes, predictions, what was learned', () => {
    const input = reviewInput(data, TODAY);
    expect(input.elements.length).toBeGreaterThan(0);
    expect(input.reasons.every((r) => r.says && r.status)).toBe(true);
    expect(input.notes.every((n) => n.date >= '2026-08-16')).toBe(true);
    expect(JSON.stringify(input).length).toBeLessThan(200_000);
  });

  it('keeps only reasons between existing elements that are not on the map already, and real citations', () => {
    const review: Review = {
      summary: 'Lately, fewer notes.',
      readings: [
        { from_id: a.id, to_id: b.id, effect: 'raises', text: 'A may raise B.', why: 'Twice together.', cites: [note.id, 'made_up'] },
        { from_id: 'nope', to_id: b.id, effect: 'raises', text: 'x', why: 'x', cites: [] },
        { from_id: existing.from, to_id: existing.to, effect: existing.effect, text: 'Already there', why: 'x', cites: [] },
      ],
      tensions: [{ text: 'These disagree.', why: 'x', cites: ['made_up'] }],
      questions: [{ text: 'Was it the deadline?', why: 'x', about_id: 'made_up' }],
    };
    const checked = checkReview(data, review);
    expect(checked.readings).toHaveLength(1);
    expect(checked.readings[0].cites).toEqual([note.id]);
    expect(checked.tensions[0].cites).toEqual([]);
    expect(checked.questions[0].about_id).toBe('');
  });

  it('offers Claude read-only tools that search and read notes', async () => {
    const [search, read] = reviewTools(data);
    const word = note.title.split(' ')[0];
    const found = (await search.execute({ query: word }, { signal: new AbortController().signal })) as { id: string }[];
    expect(found.some((f) => f.id === note.id)).toBe(true);
    expect(await read.execute({ id: note.id }, { signal: new AbortController().signal })).toMatchObject({ id: note.id, title: note.title });
    expect(() => read.execute({ id: 'nope' }, { signal: new AbortController().signal })).toThrow();
  });

  it('asks Claude and returns the checked review', async () => {
    next = {
      value: {
        summary: 'Quiet weeks.',
        readings: [{ from_id: a.id, to_id: b.id, effect: 'raises', text: 'May raise.', why: 'Seen twice.', cites: [] }],
        tensions: [],
        questions: [{ text: 'What else changed?', why: 'Two readings.', about_id: b.id }],
      },
    };
    const review = await runReview(data, TODAY);
    expect(review.summary).toBe('Quiet weeks.');
    expect(review.questions[0].about_id).toBe(b.id);
    expect(prompts.at(-1)).toContain('weekly review');
  });
});
