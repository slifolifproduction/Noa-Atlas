/**
 * The weave: one note, connected to every lens.
 *
 * You write; the Atlas does the connecting. When a note is saved, what was
 * read from it that only says what the note itself says is taken on its own:
 * what it is about (Map), what happened (Time), what changed and what it
 * expects (Causes), another time something repeated (Repeats), and steps and
 * targets it says are finished (Quests, and the plan in Ahead). Each keeps
 * its trail back to the note and can be taken back with one tap.
 *
 * What is a reading of the note rather than what it says is only offered: an
 * explanation in your own words is your hypothesis (a claim that starts as a
 * hunch, drawn dashed), and an exception to a repeat is yours to call. Nothing
 * is ever counted as evidence for a cause because you named it.
 *
 * `weaveOf` is the other half: everything a note is connected to now, lens by
 * lens, read from the atlas every time, so it never drifts from what each
 * lens shows.
 */
import { optionsTouching } from './ask';
import { caseRows, liveClaims } from './compare';
import { claimSentence } from './claims';
import { AREA_META, DRIVERS, effectPhrase, expectSentence, stateSentence } from './constants';
import { allWork, quests, type Boss } from './quests';
import { patternTitle, sameRef, usagesOfSource } from './selectors';
import type { AnalysisSuggestion, AreaKey, AtlasData, Claim, Effect, EntityRef, Entry, ID, ISODate, SourceRef } from './types';
import { formatDate } from '../lib/dates';
import { t, tn } from '../i18n';

/* ---------------- what is taken on its own ---------------- */

/**
 * Whether a suggestion only says what the note says, and so is taken without
 * asking: what it mentions, what happened, what changed or is expected in the
 * note's own words, and another time a repeat happened (by its own cues).
 * Explanations and exceptions are a reading, and are offered instead.
 */
export function takenOnItsOwn(s: AnalysisSuggestion): boolean {
  switch (s.type) {
    case 'link_node':
    case 'occurrence':
    case 'change':
    case 'expectation':
      return true;
    case 'pattern_evidence':
      return s.stance === 'supports';
    case 'area':
    case 'attribution':
      return false;
  }
}

/**
 * The one life area a note sits in, when you gave it none and it is clear:
 * where most of what it is about sits (at least two of its elements, more
 * than in any other area). A note about several areas is left for you; the
 * areas its words point to stay as suggestions.
 */
export function areaToTake(data: AtlasData, entry: Entry): AreaKey | undefined {
  if (entry.areas.length) return undefined;
  const count = new Map<AreaKey, number>();
  for (const id of entry.nodeIds) {
    const area = data.nodes[id]?.area;
    if (area) count.set(area, (count.get(area) ?? 0) + 1);
  }
  const [first, second] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return first && first[1] >= 2 && first[1] > (second?.[1] ?? 0) ? first[0] : undefined;
}

/* ---------------- steps a note says are finished ---------------- */

const lower = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'");
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const has = (text: string, phrase: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(phrase)}([^\\p{L}\\p{N}]|$)`, 'u').test(text);

/** Words that say something is finished… */
const DONE = [
  'done',
  'finished',
  'completed',
  'wrapped up',
  'sent',
  'submitted',
  'shipped',
  'delivered',
  'locked',
  'ticked off',
  'did',
  'got through',
  'sudah',
  'udah',
  'sdh',
  'telah',
  'selesai',
  'beres',
  'kelar',
  'rampung',
  'tuntas',
  'terkirim',
  'berhasil',
  'akhirnya',
  'menyelesaikan',
  'menuntaskan',
];
/** …and words that say it is not, or not yet. */
const NOT_DONE = [
  'not yet',
  'not done',
  "haven't",
  'have not',
  "didn't",
  'did not',
  'still need',
  'still have to',
  'need to',
  'have to',
  'going to',
  'will',
  'plan to',
  'want to',
  'should',
  'tomorrow',
  'belum',
  'tidak jadi',
  'gagal',
  'batal',
  'masih harus',
  'akan',
  'mau',
  'harus',
  'perlu',
  'ingin',
  'rencana',
  'nanti',
  'besok',
];
/** Words that carry no meaning of their own in a step's title. */
const FILLER = new Set(
  'the a an to of for with and or in on at by from my your our is are was be it this that into as about per via vs dan atau yang di ke dari untuk dengan ini itu pada aku saya kamu juga lagi'.split(
    ' ',
  ),
);

/** The words of a step's title that say what it is: no filler, no asides in brackets, no ordinals ("#3"). */
function titleWords(title: string): string[] {
  return lower(title)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/#\d+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !FILLER.has(w) && (w.length >= 3 || /^\d+$/.test(w)));
}

/** Whether a word of a title shows up in a sentence, allowing for endings and prefixes ("lock" in "locked", "kirim" in "mengirim"). */
function wordIn(word: string, words: string[]): boolean {
  if (/^\d+$/.test(word)) return words.includes(word);
  return words.some((w) => w === word || (word.length >= 4 && w.includes(word)) || (w.length >= 4 && word.startsWith(w) && word.length - w.length <= 3));
}

export interface Finished {
  kind: 'action' | 'target';
  id: ID;
  title: string;
  /** The words that say so. */
  excerpt: string;
}

/**
 * Open steps and targets the note says are finished: a sentence that says it
 * is done, with no "not yet" or "will" in it, naming most of the words of the
 * step's title (and every number in it). Each sentence finishes one thing at
 * most, the closest match, and the earliest when two match as well.
 */
export function finishedIn(data: AtlasData, entry: Pick<Entry, 'title' | 'content'>, skip: ID[] = []): Finished[] {
  const { targets, actions } = allWork(data);
  const open = [
    ...actions.filter((a) => a.status === 'todo' && !skip.includes(a.id)).map((a) => ({ kind: 'action' as const, id: a.id, title: a.title, when: a.week })),
    ...targets.filter((x) => !x.done && !skip.includes(x.id)).map((x) => ({ kind: 'target' as const, id: x.id, title: x.title, when: x.due })),
  ];
  if (!open.length) return [];
  const sentences = `${entry.content}`
    .split(/(?<=[.!?\n])\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  // A title on its own line counts as one more sentence, when it is not just the first line of the note.
  if (entry.title && !entry.content.startsWith(entry.title)) sentences.unshift(entry.title);
  const out: Finished[] = [];
  const taken = new Set<ID>();
  sentences.forEach((sentence, i) => {
    // "Scene 4 layout. Done!": a short sentence that only says so finishes the one before it.
    const words = sentence.split(/\s+/).length;
    const text = lower(words <= 3 && i > 0 ? `${sentences[i - 1]} ${sentence}` : sentence);
    if (!DONE.some((c) => has(text, c)) || NOT_DONE.some((c) => has(text, c))) return;
    const said = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    let best: { item: (typeof open)[number]; score: number } | undefined;
    for (const item of open) {
      if (taken.has(item.id)) continue;
      const title = titleWords(item.title);
      if (!title.length) continue;
      const hit = title.filter((w) => wordIn(w, said));
      const numbers = title.filter((w) => /^\d+$/.test(w));
      if (numbers.some((n) => !said.includes(n))) continue;
      if (hit.length < Math.min(2, title.length) || hit.length / title.length < 0.6) continue;
      const score = hit.length / title.length;
      if (!best || score > best.score || (score === best.score && item.when < best.item.when)) best = { item, score };
    }
    if (!best) return;
    taken.add(best.item.id);
    out.push({ kind: best.item.kind, id: best.item.id, title: best.item.title, excerpt: sentence });
  });
  return out;
}

/* ---------------- a decision a note says was made ---------------- */

/** Words that say a choice was made, and the words before what was chosen. */
const DECIDED = [
  'decided to',
  'decided on',
  'i decided',
  'chose to',
  'i chose',
  'going with',
  "i'll go with",
  "i'll take",
  "i'm taking",
  'said yes to',
  'said no to',
  'turned down',
  'declined',
  'accepted the',
  'memutuskan untuk',
  'memutuskan',
  'putuskan untuk',
  'putuskan',
  'memilih untuk',
  'memilih',
  'akhirnya pilih',
  'akhirnya ambil',
  'akhirnya terima',
  'akhirnya tolak',
  'jadi ambil',
  'jadi pilih',
  'menolak',
  'menerima tawaran',
  'bilang ya ke',
  'bilang tidak ke',
];
/** …and words that say it is not made yet. */
const UNDECIDED = [
  'not yet',
  "haven't",
  'have not',
  'still deciding',
  'need to decide',
  'will decide',
  'should i',
  'not sure',
  'belum',
  'masih',
  'mau memutuskan',
  'akan memutuskan',
  'perlu memutuskan',
  'harus memutuskan',
  'bingung',
  'ragu',
];
/** What was passed over: "X over Y", "X daripada Y". */
const OVER = /\s+(?:over|instead of|rather than|not|daripada|ketimbang|alih-alih|dibanding|bukan)\s+/i;
/** What it was for, in its own words: "so that…", "biar…". */
const FOR = /,?\s+(?:so that|so i can|so i could|hoping|in the hope|biar|supaya|agar|semoga|demi)\s+|\s*,\s*so\s+/i;
/** Why, in its own words: "because…", "karena…". */
const BECAUSE = /\s+(?:because|since|karena|soalnya|sebab)\s+/i;

/** What a choice was for, by the words it uses (the reasons you state, never inferred from the outcome). */
const DRIVER_WORDS: Record<(typeof DRIVERS)[number], string[]> = {
  Income: ['money', 'income', 'pay', 'paid', 'fee', 'rate', 'cash', 'uang', 'duit', 'gaji', 'bayaran', 'penghasilan', 'honor'],
  Opportunity: ['opportunity', 'chance', 'opening', 'kesempatan', 'peluang'],
  Visibility: ['visibility', 'exposure', 'portfolio', 'recognition', 'seen', 'eksposur', 'dikenal', 'portofolio'],
  Security: ['security', 'stable', 'stability', 'safe', 'runway', 'aman', 'stabil', 'tabungan'],
  Relationships: ['friend', 'family', 'team', 'relationship', 'teman', 'keluarga', 'hubungan'],
  Learning: ['learn', 'learning', 'skill', 'belajar', 'ilmu'],
  Wellbeing: ['rest', 'health', 'sleep', 'energy', 'burnout', 'istirahat', 'sehat', 'tidur', 'capek', 'lelah'],
  Focus: ['focus', 'deep work', 'fokus'],
  Craft: ['craft', 'quality', 'kualitas', 'karya'],
  Autonomy: ['freedom', 'autonomy', 'own terms', 'bebas', 'mandiri'],
  'Long-term growth': ['long-term', 'long term', 'future', 'jangka panjang', 'masa depan'],
};

export interface ReadDecision {
  title: string;
  /** What was chosen, and what was passed over. */
  chosen: string;
  others: string[];
  /** Why, and what it was for, in the note's words. */
  because?: string;
  expected?: string;
  optimizingFor: string[];
  excerpt: string;
}

const tidy = (x: string) => x.trim().replace(/^[,;:\s]+|[,;:.!?\s]+$/g, '');
const capital = (x: string) => (x ? x[0].toUpperCase() + x.slice(1) : x);
const clip = (x: string, max = 90) => (x.length <= max ? x : `${x.slice(0, max - 1).replace(/\s+\S*$/, '')}…`);

/**
 * The decision a note says was made: the first sentence that says so, with
 * no "not yet" or "still deciding" in it; what was chosen is what follows
 * the words that say so, and what was passed over follows "over" or
 * "daripada". Asked for one (`force`), the first sentence is the decision.
 */
export function decisionIn(entry: Pick<Entry, 'title' | 'content'>, force = false): ReadDecision | undefined {
  const sentences = entry.content
    .split(/(?<=[.!?\n])\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  for (const sentence of sentences) {
    const text = lower(sentence);
    if (UNDECIDED.some((c) => has(text, c))) continue;
    const cue = DECIDED.find((c) => has(text, c));
    if (!cue) continue;
    const at = text.search(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(cue)}([^\\p{L}\\p{N}]|$)`, 'u'));
    const verb = sentence.slice(at).trimStart();
    // "Turned down the role", "menolak tawaran itu": the choice is the act itself; "decided to X", "memilih X": the choice is X.
    const keepsVerb = /^(said yes|said no|turned down|declined|accepted|menolak|menerima|bilang|akhirnya (terima|tolak))/i.test(verb);
    return read(sentence, keepsVerb ? verb : verb.slice(cue.length));
  }
  if (!force || !sentences.length) return undefined;
  return read(sentences[0], sentences[0]);
}

function read(sentence: string, rest: string): ReadDecision {
  let chosen = rest;
  let because: string | undefined;
  let expected: string | undefined;
  const why = chosen.split(BECAUSE);
  if (why.length > 1) [chosen, because] = [why[0], why.slice(1).join(' ')];
  const forWhat = chosen.split(FOR);
  if (forWhat.length > 1) [chosen, expected] = [forWhat[0], forWhat.slice(1).join(' ')];
  const [first, ...passed] = chosen.split(OVER);
  const said = lower(sentence);
  return {
    title: clip(capital(tidy(sentence))),
    chosen: clip(capital(tidy(first)) || capital(tidy(sentence))),
    others: passed.map((x) => clip(capital(tidy(x)))).filter(Boolean),
    because: because ? tidy(because) : undefined,
    expected: expected ? capital(tidy(expected)) : undefined,
    optimizingFor: DRIVERS.filter((d) => DRIVER_WORDS[d].some((w) => has(said, w))),
    excerpt: sentence,
  };
}

/* ---------------- everything a note is connected to ---------------- */

export type Lens = 'map' | 'time' | 'causes' | 'repeats' | 'ahead' | 'quests';
export const LENSES: Lens[] = ['map', 'time', 'causes', 'repeats', 'ahead', 'quests'];

/** How a thread is taken back. */
export type Untie =
  { kind: 'suggestion'; id: ID } | { kind: 'part'; id: ID } | { kind: 'unlink'; node: ID } | { kind: 'area'; area: AreaKey } | { kind: 'decision' };

export interface Thread {
  key: string;
  label: string;
  /** What opens when it is chosen. */
  ref?: EntityRef;
  /** Taken back with one tap (only for what the note itself put there). */
  untie?: Untie;
  /** Made by the Atlas on its own, rather than by you. */
  auto?: boolean;
  /** Something that just moved (a step finished): drawn in the signal colour. */
  live?: boolean;
}

export interface Strand {
  lens: Lens;
  threads: Thread[];
}

/** Something only you can say: offered with one tap, never taken on its own. */
export interface Offer {
  suggestion: ID;
  kind: 'claim' | 'exception' | 'explain';
  label: string;
  excerpt: string;
  claim?: { from: ID; to: ID; effect: Effect };
  patternId?: ID;
}

export interface Weave {
  strands: Strand[];
  offers: Offer[];
  /** How many threads the Atlas tied on its own. */
  auto: number;
}

const label = (data: AtlasData, id: ID) => data.nodes[id]?.label ?? t('an element');

/**
 * The reason you already have that an explanation in a note says again: the
 * same cause, outcome and way. Saying it again is not evidence for it; the
 * note is only connected to it.
 */
export function knownClaim(data: AtlasData, s: AnalysisSuggestion): Claim | undefined {
  if (s.type !== 'attribution' || !s.claim) return undefined;
  const { from, to, effect } = s.claim;
  return Object.values(data.claims).find((c) => c.from === from && c.to === to && c.effect === effect && c.state === 'adopted');
}

/** The offer for a suggestion still waiting, if it is one only you can say. */
export function offerFor(data: AtlasData, s: AnalysisSuggestion): Offer | undefined {
  if (s.state !== 'pending') return undefined;
  if (s.type === 'attribution') {
    if (knownClaim(data, s)) return undefined;
    const c = s.claim && data.nodes[s.claim.from] && data.nodes[s.claim.to] ? s.claim : undefined;
    return c
      ? {
          suggestion: s.id,
          kind: 'claim',
          label: `${label(data, c.from)} ${effectPhrase(c.effect, 'proposed')} ${label(data, c.to)}`,
          excerpt: s.excerpt,
          claim: c,
        }
      : { suggestion: s.id, kind: 'explain', label: t('Your note explains a cause in its own words'), excerpt: s.excerpt };
  }
  if (s.type === 'pattern_evidence' && s.stance === 'counters') {
    const p = data.patterns[s.patternId];
    if (!p) return undefined;
    return { suggestion: s.id, kind: 'exception', label: t('An exception to “{title}”', { title: patternTitle(p) }), excerpt: s.excerpt, patternId: p.id };
  }
  return undefined;
}

/** Claims whose cases this note's happenings take part in: where Causes counts it. */
function claimsCounting(data: AtlasData, sources: SourceRef[]): Claim[] {
  if (!sources.length) return [];
  const from = (ref: SourceRef | undefined) => Boolean(ref && sources.some((s) => sameRef(s, ref)));
  return liveClaims(data).filter((c) => caseRows(data, c).some((r) => from(r.cause.item?.source) || from(r.outcome.item?.source)));
}

export function weaveOf(data: AtlasData, entryId: ID, today?: ISODate): Weave {
  const entry = data.entries[entryId];
  if (!entry) return { strands: [], offers: [], auto: 0 };
  const sugs = entry.analysis?.suggestions ?? [];
  const autoTaken = sugs.filter((s) => s.auto && s.state === 'accepted');
  const bySug = (pred: (s: AnalysisSuggestion) => boolean) => autoTaken.find(pred);
  const ref: SourceRef = { kind: 'entry', id: entryId };
  const fromNote = Object.values(data.occurrences).filter((o) => o.source && sameRef(o.source, ref));
  const usages = usagesOfSource(data, ref);
  const threads: Record<Lens, Thread[]> = { map: [], time: [], causes: [], repeats: [], ahead: [], quests: [] };

  // Map: what the note is about, and the area it sits in.
  for (const id of entry.nodeIds) {
    if (!data.nodes[id]) continue;
    const s = bySug((x) => x.type === 'link_node' && x.nodeId === id);
    threads.map.push({
      key: `n:${id}`,
      label: label(data, id),
      ref: { kind: 'node', id },
      untie: s ? { kind: 'suggestion', id: s.id } : { kind: 'unlink', node: id },
      auto: Boolean(s),
    });
  }
  for (const area of entry.areas) {
    const s = bySug((x) => x.type === 'area' && x.area === area);
    threads.map.push({
      key: `a:${area}`,
      label: AREA_META[area].label,
      ref: { kind: 'area', id: area },
      untie: s ? { kind: 'suggestion', id: s.id } : { kind: 'area', area },
      auto: Boolean(s) || entry.woven?.area === area,
    });
  }

  // Time: the note itself, and what happened as read from it.
  const actual = fromNote.filter((o) => o.mode === 'actual').sort((a, b) => a.date.localeCompare(b.date));
  for (const o of actual) {
    const s = bySug((x) => (x.type === 'occurrence' || x.type === 'change') && x.made?.occurrence === o.id);
    threads.time.push({
      key: `o:${o.id}`,
      label: o.label,
      ref: { kind: 'occurrence', id: o.id },
      untie: s ? { kind: 'suggestion', id: s.id } : undefined,
      auto: Boolean(s),
    });
  }
  const decision = entry.woven?.decision ? data.decisions[entry.woven.decision] : undefined;
  if (decision)
    threads.time.unshift({
      key: `d:${decision.id}`,
      label: t('Decided: {title}', { title: decision.chosenAction || decision.title }),
      ref: { kind: 'decision', id: decision.id },
      untie: { kind: 'decision' },
      auto: true,
    });
  if (!threads.time.length)
    threads.time.push({ key: 'note', label: t('This note, {date}', { date: formatDate(entry.date) }), ref: { kind: 'entry', id: entryId } });

  // Causes: what changed and what is expected, in the note's words; your hunches from it; and the reasons that now count it.
  for (const o of actual)
    for (const c of o.changes ?? []) {
      if (!data.nodes[c.factor]) continue;
      const s = bySug((x) => x.type === 'change' && x.factor === c.factor && (x.made?.host === o.id || x.made?.occurrence === o.id));
      threads.causes.push({
        key: `c:${o.id}:${c.factor}`,
        label: stateSentence(label(data, c.factor), c.reads),
        ref: { kind: 'node', id: c.factor },
        untie: s ? { kind: 'suggestion', id: s.id } : undefined,
        auto: Boolean(s),
      });
    }
  for (const o of fromNote.filter((x) => x.mode === 'expected'))
    for (const c of o.changes ?? []) {
      if (!data.nodes[c.factor]) continue;
      const s = bySug((x) => x.type === 'expectation' && x.made?.occurrence === o.id);
      threads.causes.push({
        key: `e:${o.id}`,
        label: t('You expect: {what}, by {date}', { what: expectSentence(label(data, c.factor), c.reads), date: formatDate(o.until ?? o.date) }),
        ref: { kind: 'occurrence', id: o.id },
        untie: s ? { kind: 'suggestion', id: s.id } : undefined,
        auto: Boolean(s),
      });
    }
  const hunches = new Set<ID>();
  for (const s of sugs) {
    if (s.type !== 'attribution' || s.state !== 'accepted') continue;
    const made = s.made?.claim ? data.claims[s.made.claim] : undefined;
    const c = made ?? knownClaim(data, s);
    if (!c || hunches.has(c.id)) continue;
    hunches.add(c.id);
    threads.causes.push({
      key: `h:${c.id}`,
      label: made ? t('Your hunch: {claim}', { claim: claimSentence(data, c) }) : t('You said so again: {claim}', { claim: claimSentence(data, c) }),
      ref: { kind: 'claim', id: c.id },
      untie: { kind: 'suggestion', id: s.id },
      auto: s.auto,
    });
  }
  // Evidence you gave from the note, then the reasons whose cases it now takes part in.
  for (const u of usages) {
    if (!u.claim || hunches.has(u.claim.id)) continue;
    hunches.add(u.claim.id);
    const claim = claimSentence(data, u.claim);
    threads.causes.push({
      key: `r:${u.claim.id}`,
      label: u.evidence.stance === 'counters' ? t('Goes against: {claim}', { claim }) : t('Backs up: {claim}', { claim }),
      ref: { kind: 'claim', id: u.claim.id },
    });
  }
  for (const c of claimsCounting(data, [ref, ...fromNote.map((o) => ({ kind: 'occurrence' as const, id: o.id }))]))
    if (!hunches.has(c.id))
      threads.causes.push({ key: `r:${c.id}`, label: t('Counted in: {claim}', { claim: claimSentence(data, c) }), ref: { kind: 'claim', id: c.id } });

  // Repeats: another time something happened, or an exception to it.
  for (const u of usages) {
    if (!u.pattern) continue;
    const p = u.pattern;
    const s = bySug((x) => x.type === 'pattern_evidence' && x.made?.evidence === u.evidence.id);
    threads.repeats.push({
      key: `p:${p.id}`,
      label:
        u.evidence.stance === 'counters'
          ? t('Did not happen this time: {title}', { title: patternTitle(p) })
          : t('Happened again: {title}', { title: patternTitle(p) }),
      ref: { kind: 'pattern', id: p.id },
      untie: s ? { kind: 'suggestion', id: s.id } : undefined,
      auto: Boolean(s),
    });
  }

  // Quests: what the note finished, and the boss it hit.
  const parts = (entry.woven?.parts ?? []).filter((id) => {
    const { targets, actions } = allWork(data);
    return actions.some((a) => a.id === id && a.status === 'done') || targets.some((x) => x.id === id && x.done);
  });
  const q = parts.length ? quests(data, today) : undefined;
  const hit = new Map<string, Boss>();
  for (const id of parts) {
    const boss = q?.bosses.find((b) => b.parts.some((p) => p.id === id));
    if (boss) hit.set(boss.id, boss);
    const part = boss?.parts.find((p) => p.id === id) ?? allWork(data).targets.find((x) => x.id === id) ?? allWork(data).actions.find((a) => a.id === id);
    threads.quests.push({ key: `q:${id}`, label: t('Done: {step}', { step: part?.title ?? '' }), untie: { kind: 'part', id }, auto: true, live: true });
  }
  for (const boss of hit.values())
    threads.quests.push({ key: `b:${boss.id}`, label: t('{boss}: {hp} of {max} left', { boss: boss.title, hp: boss.hp, max: boss.maxHp }) });

  // Ahead: options that rest on a reason about what the note is about, and the plan when a step of it was finished.
  const about = [...new Set([...entry.nodeIds, ...actual.flatMap((o) => (o.changes ?? []).map((c) => c.factor))])];
  for (const p of optionsTouching(data, about).slice(0, 3))
    threads.ahead.push({ key: `o:${p.id}`, label: t('Touches the option “{title}”', { title: p.title }), ref: { kind: 'path', id: p.id } });
  const nav = data.navigation;
  if (nav && parts.some((id) => nav.actions.some((a) => a.id === id) || nav.targets.some((x) => x.id === id))) {
    const done = nav.actions.filter((a) => a.status === 'done').length;
    threads.ahead.unshift({
      key: 'plan',
      label: tn(nav.actions.length, 'The plan moved on: {done} of {n} step done', 'The plan moved on: {done} of {n} steps done', { done }),
      ref: { kind: 'path', id: nav.pathId },
    });
  }

  const offers = sugs.map((s) => offerFor(data, s)).filter((o): o is Offer => Boolean(o));
  const strands = LENSES.map((lens) => ({ lens, threads: threads[lens] })).filter((s) => s.threads.length);
  const auto = strands.reduce((n, s) => n + s.threads.filter((x) => x.auto).length, 0);
  return { strands, offers, auto };
}
