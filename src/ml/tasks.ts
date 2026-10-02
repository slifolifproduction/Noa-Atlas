/**
 * What the local AI reads in a sentence of a note: five questions ("heads"), each with a fixed set of answers.
 * Shared by the dataset generator, the training scripts (Node) and the app (browser), so a label means the same
 * thing everywhere. No imports, so Node can run it directly.
 *
 *   act        what the sentence reports doing: nothing, something that happened, something finished,
 *              a choice made, or something still to do
 *   direction  whether something went up or down (more or less of it)
 *   cause      whether the sentence explains why ("because…", "karena…")
 *   time       whether it is about the past, now, or the future
 *   mood       how the person says they feel: low, neutral or high
 */
export const HEADS = {
  act: ['none', 'happened', 'done', 'decided', 'planned'],
  direction: ['none', 'up', 'down'],
  cause: ['no', 'yes'],
  time: ['past', 'now', 'future'],
  mood: ['neutral', 'low', 'high'],
} as const;

export type Head = keyof typeof HEADS;
export const HEAD_NAMES = Object.keys(HEADS) as Head[];
export type Labels = { [H in Head]: (typeof HEADS)[H][number] };
export type Lang = 'en' | 'id' | 'mix';

export interface Example {
  text: string;
  labels: Labels;
  lang: Lang;
  /** The templates it was made from (generated examples only), to keep unseen templates for testing. */
  templates?: string[];
}

/** A label as its index in its head. */
export const labelIndex = <H extends Head>(head: H, label: Labels[H]) => (HEADS[head] as readonly string[]).indexOf(label);

/** Examples in a compact form for shipping: [text, act, direction, cause, time, mood] as label indices. */
export type Packed = [string, number, number, number, number, number];
export const pack = (e: Example): Packed => [e.text, ...HEAD_NAMES.map((h) => labelIndex(h, e.labels[h] as never))] as Packed;
export const unpack = (p: Packed): Example => ({
  text: p[0],
  labels: Object.fromEntries(HEAD_NAMES.map((h, i) => [h, HEADS[h][p[i + 1] as number]])) as Labels,
  lang: 'mix',
});

/** A note split into sentences, the way every part of the local AI reads it. */
export function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}
