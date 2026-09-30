/**
 * What the Atlas learns from the person, and only from them.
 *
 * Four things, each a plain count that can be shown and forgotten:
 *
 * - Which kinds of suggestion they take and which they set aside. Pending
 *   suggestions are shown in that order: (taken + 1) / (taken + set aside + 2),
 *   so a kind with no history sits in the middle. It orders what is shown;
 *   it is never shown as a likelihood and never hides anything.
 * - Their own words. When a note is linked to an element (by them, or by a
 *   suggestion they took), the note's words are counted for that element.
 *   A word that went with the same element in at least three notes, and
 *   mostly with that one, is suggested the next time a note uses it, with
 *   the count as its reason.
 * - How the Atlas's own predictions went. Each settled expectation is read
 *   against the status its reasons had on the day it was written down. When
 *   predictions from "supported" reasons failed at least as often as they
 *   held (over four or more), the Atlas proposes asking for more separate
 *   episodes before calling a reason supported. The person decides; the
 *   change is logged and can be taken back.
 * - Which kinds of question they put away ("Not now"). Kinds put away three
 *   or more times are asked after the others.
 *
 * All of it lives with the atlas (so it follows the account), and all of it
 * can be forgotten.
 */
import { statusOn } from './beliefs';
import { claimStatus, supportedEpisodes } from './claims';
import { expectations } from './expect';
import type { AnalysisSuggestion, AtlasData, ClaimStatus, Entry, ID, ISODate, LearningMemory } from './types';
export type { LearningMemory } from './types';
import { dateOf, todayISO } from '../lib/dates';
import { keywords } from '../lib/text';

export type SuggestionType = AnalysisSuggestion['type'];
export type InquiryKindName = 'reread' | 'ask' | 'compare' | 'track' | 'test';

const MAX_WORDS_PER_ELEMENT = 60;
const MAX_WORDS = 3000;
/** A word counts as telling once it went with the element in this many notes… */
const WORD_NOTES = 3;
/** …and in at least this share of the linked notes that used it. */
const WORD_SHARE = 0.6;

export const emptyLearning = (today: ISODate = todayISO()): LearningMemory => ({
  since: today,
  suggestions: {},
  words: {},
  wordNotes: {},
  forgotten: [],
  rules: {},
  declined: {},
  friction: [],
});

/** The memory, created on first use. */
export function memory(data: AtlasData): LearningMemory {
  data.learning ??= emptyLearning();
  data.learning.friction ??= [];
  data.learning.declined ??= {};
  data.learning.rules ??= {};
  data.learning.forgotten ??= [];
  return data.learning;
}

/* ---------------- suggestions taken and set aside ---------------- */

export function noteSuggestion(mem: LearningMemory, type: SuggestionType, taken: boolean) {
  const c = (mem.suggestions[type] ??= { taken: 0, dismissed: 0 });
  if (taken) c.taken++;
  else c.dismissed++;
}

/** Order of pending suggestions: kinds the person usually takes first. */
export function suggestionRank(data: AtlasData, type: SuggestionType): number {
  const c = data.learning?.suggestions[type];
  return c ? (c.taken + 1) / (c.taken + c.dismissed + 2) : 0.5;
}

export function sortSuggestions<T extends { type: SuggestionType }>(data: AtlasData, items: T[]): T[] {
  return items
    .map((s, i) => ({ s, i, r: suggestionRank(data, s.type) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.s);
}

/* ---------------- the person's own words ---------------- */

const noteWords = (entry: Pick<Entry, 'title' | 'content'>) => [...new Set(keywords(`${entry.title} ${entry.content}`))];

function prune(counts: Record<string, number>, max: number) {
  const keys = Object.keys(counts);
  if (keys.length <= max) return;
  for (const k of keys.sort((a, b) => counts[a] - counts[b]).slice(0, keys.length - max)) delete counts[k];
}

/** A note was linked to an element: count its words for that element (not the element's own name). */
export function learnLink(mem: LearningMemory, entry: Pick<Entry, 'title' | 'content'>, nodeId: ID, label: string) {
  const own = new Set(keywords(label));
  const words = noteWords(entry).filter((w) => !own.has(w));
  const counts = (mem.words[nodeId] ??= {});
  for (const w of words) {
    counts[w] = (counts[w] ?? 0) + 1;
    mem.wordNotes[w] = (mem.wordNotes[w] ?? 0) + 1;
  }
  prune(counts, MAX_WORDS_PER_ELEMENT);
  prune(mem.wordNotes, MAX_WORDS);
}

export interface LearnedWord {
  nodeId: ID;
  word: string;
  /** Notes linked to the element that used the word. */
  notes: number;
  /** Of all linked notes that used it. */
  of: number;
}

/** Word–element pairs strong enough to suggest from, strongest first. */
export function learnedWords(data: AtlasData): LearnedWord[] {
  const mem = data.learning;
  if (!mem) return [];
  const out: LearnedWord[] = [];
  for (const [nodeId, counts] of Object.entries(mem.words)) {
    if (!data.nodes[nodeId]) continue;
    for (const [word, notes] of Object.entries(counts)) {
      const of = mem.wordNotes[word] ?? notes;
      if (notes >= WORD_NOTES && notes / of >= WORD_SHARE && !mem.forgotten.includes(`${nodeId}:${word}`)) out.push({ nodeId, word, notes, of });
    }
  }
  return out.sort((a, b) => b.notes - a.notes || a.word.localeCompare(b.word));
}

/** Elements this note may be about, by the person's own words: at most three, with the words behind each. */
export function linksFromWords(data: AtlasData, entry: Pick<Entry, 'title' | 'content' | 'nodeIds'>): { nodeId: ID; words: LearnedWord[] }[] {
  const inNote = new Set(noteWords(entry));
  const byNode = new Map<ID, LearnedWord[]>();
  for (const w of learnedWords(data)) {
    if (!inNote.has(w.word) || entry.nodeIds.includes(w.nodeId)) continue;
    byNode.set(w.nodeId, [...(byNode.get(w.nodeId) ?? []), w]);
  }
  return [...byNode.entries()]
    .map(([nodeId, words]) => ({ nodeId, words }))
    .sort((a, b) => b.words[0].notes - a.words[0].notes)
    .slice(0, 3);
}

/* ---------------- how the Atlas's predictions went ---------------- */

export interface Calibration {
  status: ClaimStatus;
  held: number;
  failed: number;
}

/**
 * Settled predictions, by the status their reasons had on the day they were
 * written down (from the belief history; the present status when the history
 * does not reach back that far).
 */
export function calibration(data: AtlasData, today: ISODate = todayISO()): Calibration[] {
  const tally = new Map<ClaimStatus, Calibration>();
  for (const v of expectations(data, today)) {
    if (v.verdict !== 'held' && v.verdict !== 'failed') continue;
    const written = dateOf(v.occurrence.createdAt ?? v.from);
    for (const claim of v.basis) {
      const s: ClaimStatus = statusOn(data, claim.id, written) ?? claimStatus(data, claim);
      const row = tally.get(s) ?? { status: s, held: 0, failed: 0 };
      if (v.verdict === 'held') row.held++;
      else row.failed++;
      tally.set(s, row);
    }
  }
  return [...tally.values()];
}

export interface RuleProposal {
  rule: 'supportedEpisodes';
  from: number;
  to: number;
  held: number;
  failed: number;
}

/** When "supported" has not been earning its name, a stricter rule to consider (never applied on its own). */
export function ruleProposal(data: AtlasData, today: ISODate = todayISO()): RuleProposal | null {
  const row = calibration(data, today).find((c) => c.status === 'supported');
  if (!row) return null;
  const current = supportedEpisodes(data);
  if (row.held + row.failed < 4 || row.failed < row.held || current >= 5) return null;
  return { rule: 'supportedEpisodes', from: current, to: current + 1, held: row.held, failed: row.failed };
}

/* ---------------- questions put away ---------------- */
