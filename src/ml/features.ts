/**
 * Features for the built-in model, which needs nothing downloaded: a sentence as the hashed set of its words,
 * its pairs of words, and the letter sequences (3 to 5 letters) inside each word, marked at the word's edges.
 * Letters inside words carry Indonesian prefixes and suffixes ("me-", "-kan", "-nya"), English endings
 * ("-ed", "-ing"), informal spellings ("udah"/"sudah") and typos, so words never seen still share most of their
 * features with words that were. No imports, so Node can run it directly.
 */

export const BUCKETS = 1 << 13;

/** FNV-1a, 32 bits, into the buckets. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % BUCKETS;
}

/** Lower case, accents and curly quotes plain, numbers alike: the text the features are read from. */
export function normalise(text: string): string {
  return text.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").replace(/\d+/g, '0');
}

export function words(text: string): string[] {
  return normalise(text)
    .split(/[^a-z0'!?-]+/)
    .map((w) => w.replace(/^-+|-+$/g, ''))
    .filter(Boolean);
}

/** The hashed features of a sentence (a feature may appear more than once). */
export function featurise(text: string): Int32Array {
  const ws = words(text);
  const out: number[] = [];
  ws.forEach((w, i) => {
    out.push(hash(`w:${w}`));
    if (i > 0) out.push(hash(`b:${ws[i - 1]} ${w}`));
    const marked = `<${w}>`;
    for (let n = 3; n <= 5; n++) for (let j = 0; j + n <= marked.length; j++) out.push(hash(`c${n}:${marked.slice(j, j + n)}`));
  });
  // A sentence's ending ("!") and length say something too.
  if (/!\s*$/.test(text)) out.push(hash('end:!'));
  out.push(hash(`len:${Math.min(4, Math.floor(ws.length / 4))}`));
  return Int32Array.from(out);
}
