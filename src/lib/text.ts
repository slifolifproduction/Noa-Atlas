const STOPWORDS = new Set(
  'the a an and or but of to in on at for with from by as is it its this that these those be been was were are am i me my we our you your they them their he she his her not no so if then than too very just also about into over after before again more most some any all each other such only own same can will would should could may might must do does did done have has had having what which who whom when where why how there here out up down off new'.split(
    ' ',
  ),
);

/** Lower-cased content words (length ≥ 4, no stopwords). */
export function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

/** First sentence (or first `max` chars) of a text, for excerpts. */
export function excerpt(text: string, max = 160): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentence = clean.match(/^.*?[.!?](\s|$)/)?.[0]?.trim() ?? clean;
  const pick = sentence.length <= max ? sentence : clean;
  return pick.length > max ? `${pick.slice(0, max - 1).trimEnd()}…` : pick;
}

/** The sentence that contains `phrase`, used to quote evidence precisely. */
export function sentenceContaining(text: string, phrase: string): string | undefined {
  const sentences = text.replace(/\s+/g, ' ').match(/[^.!?]+[.!?]?/g) ?? [];
  const hit = sentences.find((s) => s.toLowerCase().includes(phrase.toLowerCase()));
  return hit?.trim();
}

export const pad2 = (n: number) => String(n).padStart(2, '0');

export function pluralize(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Split a textarea (one item per line) into trimmed non-empty lines. */
export function lines(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
