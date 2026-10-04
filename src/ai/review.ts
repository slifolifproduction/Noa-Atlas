/**
 * A weekly review with Claude, on the viewer's own account.
 *
 * Claude reads a compact copy of the atlas (the elements, the possible
 * reasons and how sure each is, the notes and happenings of the last weeks,
 * how predictions went, and what the Atlas has learned from the person) and
 * may look further through two read-only tools (search the notes, read one
 * note). It answers with a short neutral summary, possible reasons that are
 * not on the map yet, places where records do not fit together, and questions
 * that would tell two readings apart. Nothing is applied: a reason can be
 * added as a proposal (off the map until adopted, like any suggestion) and a
 * question kept, each on the person's click.
 */
import { z } from 'zod';
import { claimCode, claimSentence, claimStatus } from '../domain/claims';
import { expectations } from '../domain/expect';
import { calibration, learnedWords } from '../domain/learning';
import { mapElements } from '../domain/selectors';
import type { AtlasData, ISODate } from '../domain/types';
import { addDays } from '../lib/dates';
import { excerpt } from '../lib/text';
import type { SampleOptions, SampleTool } from '../runtime/claude';
import { claudeHere } from './access';
import { askJson, jsonPrompt } from './account';
import { SHARED_RULES } from './schemas';

const EFFECTS = ['raises', 'lowers', 'triggers', 'enables', 'constrains', 'sustains'] as const;

export const ReviewOutput = z.object({
  summary: z.string().describe('Two to four neutral sentences on what the recent records show. No traits, no advice, no verdicts.'),
  readings: z
    .array(
      z.object({
        from_id: z.string().describe('Id of the element that may act, from the input only.'),
        to_id: z.string().describe('Id of the element it may act on, from the input only.'),
        effect: z.enum(EFFECTS),
        text: z.string().describe('The possible reason in one hedged sentence ("may", "could").'),
        why: z.string().describe('What in the records suggests it.'),
        cites: z.array(z.string()).describe('Ids of the notes or happenings that suggest it.'),
      }),
    )
    .describe('Up to three possible reasons NOT already listed, between existing elements. Hypotheses to check, never findings.'),
  tensions: z
    .array(z.object({ text: z.string(), why: z.string(), cites: z.array(z.string()) }))
    .describe('Up to three places where records, or records and reasons, do not fit together.'),
  questions: z
    .array(
      z.object({
        text: z.string(),
        why: z.string().describe('Which two readings the answer would tell apart.'),
        about_id: z.string().describe('Id of the element it is about, or an empty string.'),
      }),
    )
    .describe('Up to three questions whose answer would tell two readings apart. Information to seek, never advice.'),
});

export type Review = z.infer<typeof ReviewOutput>;

const TASK = `${SHARED_RULES}
Task: a weekly review of the atlas below. Report a short neutral summary of what the recent records show; up to three possible reasons that are not already listed (between element ids from the input, each citing the note or happening ids that suggest it); up to three tensions, where records, or records and reasons, do not fit together; and up to three questions whose answer would tell two readings apart. You may search and read older notes with the tools. Use only ids that appear in the input or the tools' results. Every reason is a hypothesis to check; say so in its wording.`;

/** The part of the atlas the review reads: what it is about, lately. */
export function reviewInput(data: AtlasData, today: ISODate) {
  const since = addDays(today, -45);
  return {
    today,
    elements: mapElements(data).map((n) => ({ id: n.id, label: n.label, kind: n.kind, area: n.area })),
    reasons: Object.values(data.claims)
      .filter((c) => c.state !== 'set_aside' && !c.retired)
      .map((c) => ({
        id: c.id,
        code: claimCode(c.code),
        from: c.from,
        to: c.to,
        effect: c.effect,
        says: claimSentence(data, c),
        status: claimStatus(data, c),
      })),
    notes: Object.values(data.entries)
      .filter((e) => e.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 40)
      .map((e) => ({ id: e.id, date: e.date, title: e.title, text: excerpt(e.content, 600), elements: e.nodeIds })),
    happenings: Object.values(data.occurrences)
      .filter((o) => (o.mode ?? 'actual') === 'actual' && o.date >= since)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 60)
      .map((o) => ({ id: o.id, date: o.date, label: o.label, about: o.about })),
    predictions: expectations(data, today)
      .filter((v) => v.verdict !== 'open')
      .slice(-12)
      .map((v) => ({ label: v.occurrence.label, until: v.until, verdict: v.verdict })),
    learned: {
      words: learnedWords(data)
        .slice(0, 12)
        .map((w) => ({ word: w.word, element: w.nodeId, notes: w.notes })),
      predictions_by_status: calibration(data, today),
    },
  };
}

/** Read-only ways for Claude to look further than the last weeks. */
export function reviewTools(data: AtlasData): SampleTool[] {
  return [
    {
      name: 'search_notes',
      description: 'Search every note, not only recent ones, for a word or phrase. Returns up to 6 notes as {id, date, title, excerpt}.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      execute: ({ query }) => {
        const q = String(query ?? '')
          .toLowerCase()
          .trim();
        if (!q) throw new Error('Give a word or phrase to look for.');
        return Object.values(data.entries)
          .filter((e) => `${e.title} ${e.content}`.toLowerCase().includes(q))
          .sort((a, b) => b.date.localeCompare(a.date))
          .slice(0, 6)
          .map((e) => ({ id: e.id, date: e.date, title: e.title, excerpt: excerpt(e.content, 240) }));
      },
    },
    {
      name: 'read_note',
      description: 'Read one note in full by its id. Returns {id, date, title, text, elements}.',
      inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
      execute: ({ id }) => {
        const e = data.entries[String(id ?? '')];
        if (!e) throw new Error('No note with that id.');
        return { id: e.id, date: e.date, title: e.title, text: e.content.slice(0, 4000), elements: e.nodeIds.map((n) => data.nodes[n]?.label ?? n) };
      },
    },
  ];
}

/** Keep only what refers to things that exist, and reasons that are not on the map already. */
export function checkReview(data: AtlasData, review: Review): Review {
  const known = (id: string) => id in data.entries || id in data.occurrences || id in data.decisions;
  const exists = (from: string, to: string, effect: string) =>
    Object.values(data.claims).some((c) => c.from === from && c.to === to && c.effect === effect && c.state !== 'set_aside');
  return {
    summary: review.summary,
    readings: review.readings
      .filter((r) => data.nodes[r.from_id] && data.nodes[r.to_id] && r.from_id !== r.to_id && !exists(r.from_id, r.to_id, r.effect))
      .slice(0, 3)
      .map((r) => ({ ...r, cites: r.cites.filter(known) })),
    tensions: review.tensions.slice(0, 3).map((x) => ({ ...x, cites: x.cites.filter(known) })),
    questions: review.questions.slice(0, 3).map((q) => ({ ...q, about_id: data.nodes[q.about_id] ? q.about_id : '' })),
  };
}

/** Ask Claude for the review; tools are offered where this view can run them. */
export async function runReview(data: AtlasData, today: ISODate, options: Pick<SampleOptions, 'signal' | 'onText'> = {}): Promise<Review> {
  const sample = await claudeHere();
  const limits = await sample?.limits().catch(() => null);
  const tools = limits?.tools ? reviewTools(data) : undefined;
  const review = await askJson(ReviewOutput, jsonPrompt(TASK, ReviewOutput, reviewInput(data, today)), {
    ...options,
    tools,
    modelTier: 'default',
    ...(tools ? {} : { cache: false }),
  });
  return checkReview(data, review);
}
