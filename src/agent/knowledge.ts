/**
 * What the agent knows about the Atlas, and the knowledge around it that helps a person use it: a few dozen short
 * passages, in the interface language, found by the words of a question. The local agent answers from them; Claude
 * reads them through a tool, so both say the same thing about how the Atlas works.
 *
 * The pages' own "how this page works" notes (domain/help.ts) are part of it, so what the agent says and what the
 * pages say never drift apart.
 */
import type { RouteKey } from '../app/router';
import { PAGE_HELP } from '../domain/help';
import { t } from '../i18n';
import { fold } from './refs';

export interface Passage {
  key: string;
  title: () => string;
  text: () => string;
  /** Words people use when they mean it, in English and Indonesian, beyond those in the text. */
  words: string;
  route?: RouteKey;
}

const fromPage = (key: string, route: RouteKey, title: () => string, words: string): Passage => ({
  key: `page:${key}`,
  title,
  text: () => (PAGE_HELP[key]?.() ?? []).join(' '),
  words,
  route,
});

export const PASSAGES: Passage[] = [
  {
    key: 'about',
    title: () => t('What Cognitive Atlas is'),
    text: () =>
      t(
        'Cognitive Atlas is a map of your life that you build from what you write. Everything starts from your notes; the Atlas reads them and connects them to six lenses: Map (what you hold, do and are surrounded by), Time (what happened, when), Causes (possible reasons why things happen), Repeats (what keeps happening), Ahead (your options and your plan) and Quests (your plan as bosses to beat). It never scores you or tells you what to choose: it keeps what happened, what you think causes it, and what you imagine apart, so you can see how you know what you know.',
      ),
    words: 'about atlas aplikasi app web website tentang fungsi kegunaan lensa lenses six enam overview cognitive',
  },
  {
    key: 'notes',
    title: () => t('Writing notes, and how one note reaches every lens'),
    text: () =>
      t(
        'Write a note with Capture (or press N): what happened, what you noticed, how it felt. When you save it, the Atlas reads it and connects it on its own: the elements it mentions (Map), what happened and any decision it says you made (Time), another time a repeat happened (Repeats), steps it says are finished (Ahead and Quests). An explanation in your own words is only offered, as a possible reason. Anything it connected can be taken back with ×.',
      ),
    words: 'note catatan tulis write capture simpan save weave sambung connect jurnal journal cerita story',
    route: 'timeline',
  },
  fromPage('orbit', 'orbit', () => t('The Map lens'), 'map peta orbit elemen element area ring cincin nilai value belief keyakinan goal tujuan fear takut'),
  fromPage('timeline', 'timeline', () => t('The Time lens'), 'time waktu timeline linimasa kejadian happening keputusan decision kapan when riwayat history'),
  fromPage(
    'network',
    'network',
    () => t('The Causes lens'),
    'causes sebab alasan reason claim dugaan hipotesis hypothesis helix kenapa why mengapa bukti evidence',
  ),
  fromPage('patterns', 'patterns', () => t('The Repeats lens'), 'repeats pola pattern pengulangan berulang terus terjadi keeps happening kebiasaan habit'),
  fromPage('paths', 'paths', () => t('Options in Ahead'), 'ahead options opsi pilihan jalur path arah direction bandingkan compare'),
  fromPage('navigation', 'navigation', () => t('Your plan in Ahead'), 'plan rencana target langkah step minggu week arah direction tes test'),
  fromPage('quests', 'quests', () => t('The Quests lens'), 'quest quests misi boss bos xp level armor deadline tenggat'),
  {
    key: 'evidence',
    title: () => t('How a reason becomes surer'),
    text: () =>
      t(
        'Every reason starts as a hunch, never as a fact, however sure you feel. It becomes plausible, then supported, as your notes show the cause and then the outcome in that order, in separate weeks; a time the cause was there and the outcome did not follow counts against it; a test, where you change one thing on purpose and compare with what you expected, is the strongest. Saying “because” in a note, or naming it, is not evidence: it is your explanation, to be checked.',
      ),
    words: 'bukti evidence yakin sure status hunch dugaan plausible supported tested teruji naik reason alasan',
    route: 'network',
  },
  {
    key: 'data',
    title: () => t('Where your atlas is kept'),
    text: () =>
      t(
        'Your atlas is kept in this browser, or in your claude.ai account when you open it there signed in. Nothing leaves it unless you ask Claude. In Settings → Your data you can export all of it as a file, import one, and save or go back to versions. The local AI runs on this device.',
      ),
    words: 'data simpan stored privacy privasi aman safe export ekspor import impor backup cadangan versi version hapus delete akun account',
    route: 'settings',
  },
  {
    key: 'agent',
    title: () => t('What the agent can do'),
    text: () =>
      t(
        'Tell me what happened, a plan, or something that keeps happening, and I’ll draft it into your lenses: elements on the Map, a note on Time, possible reasons in Causes, a repeat, an option in Ahead, or a quest with its steps. Nothing is added until you press Apply, and you can take it all back. You can also ask why something keeps happening, what happened lately, or what to do next, and I’ll answer from your own notes, citing them.',
      ),
    words: 'agent agen bantu help bisa apa can do kemampuan fitur ai asisten assistant',
  },
  {
    key: 'local-ai',
    title: () => t('The local AI and Claude'),
    text: () =>
      t(
        'The agent can answer on this device (it understands what you write and builds your lenses from it, offline) or with Claude on your own claude.ai account, which can talk things through more freely. Choose in the agent’s menu: Auto uses Claude when it is available here, and the device otherwise.',
      ),
    words: 'local lokal ai claude model offline akun account kredit credit pilih choose auto',
    route: 'settings',
  },
  {
    key: 'habits',
    title: () => t('Habits, in the Atlas'),
    text: () =>
      t(
        'A habit tends to run as a sequence: a situation that sets it off, what you do, and what follows. In the Atlas that is a repeat with three steps; write the times it happens, and the times it did not (the exceptions are what show what changes it). To change one, try changing a single thing on purpose for a while, as a test, and compare with what you expected.',
      ),
    words: 'habit kebiasaan membentuk build form break hentikan stop rutinitas routine pemicu trigger cue',
    route: 'patterns',
  },
  {
    key: 'tests',
    title: () => t('Testing a reason yourself'),
    text: () =>
      t(
        'To find out whether one thing really affects another, change only that one thing, on purpose, for a set time, write down beforehand what you expect, and compare. Choose something reversible that you do yourself, never something where health or money is at stake. One result is a hint; the same result in separate weeks is stronger.',
      ),
    words: 'test tes uji eksperimen experiment coba try bukti prove membuktikan apakah benar really',
    route: 'navigation',
  },
  {
    key: 'causes-vs-together',
    title: () => t('Happening together is not a cause'),
    text: () =>
      t(
        'Two things happening together, or one after the other, is a reason to look, not proof that one causes the other. Look for the order (did the cause come first?), separate weeks, the times one happened without the other, and something else that could explain both.',
      ),
    words: 'korelasi correlation kebetulan coincidence bersamaan together sebab cause bukan not',
    route: 'network',
  },
  {
    key: 'decisions',
    title: () => t('Deciding between options'),
    text: () =>
      t(
        'The Atlas never ranks your options or picks one. It describes each the same way (what it needs, what it costs, what it risks, what it relies on) so you can compare them, and keeps the branches you did not take. After a decision, it asks later how it turned out, so you learn from your own record.',
      ),
    words: 'decide memutuskan keputusan decision pilih choose bingung confused opsi option terbaik best',
    route: 'paths',
  },
  {
    key: 'goals',
    title: () => t('From a goal to this week'),
    text: () =>
      t(
        'A goal becomes doable as targets with dates, and each target as a few steps you can take this week. In the Atlas, a quest is exactly that: a title, a date, and its steps; ticking steps off is what brings it closer. Keep steps small enough to finish in a sitting.',
      ),
    words: 'goal tujuan target sasaran rencana plan langkah steps quest misi deadline produktif productive',
    route: 'quests',
  },
];

/** Words that say nothing about which passage is meant (question words included: what is asked about decides). */
const STOP = new Set(
  (
    'apa itu yang dan atau di ke dari ini untuk dengan pada adalah ialah saya aku ku kamu anda mu nya bisa cara bagaimana gimana kenapa mengapa ' +
    'kapan siapa dimana berapa apakah tolong jelaskan the is are a an of to in on for with and or how what why when who where can do does my me i you your it this that'
  ).split(' '),
);
const tokens = (s: string) =>
  fold(s)
    .split(' ')
    .filter((w) => w.length > 1 && !STOP.has(w));

/** The sentences of a passage that answer a question best, in their order (the first ones when none share a word). */
export function answerFrom(p: Passage, query: string, most = 3): string {
  const q = new Set(tokens(query));
  const sentences = p.text().split(/(?<=[.!?])\s+/);
  if (sentences.length <= most) return sentences.join(' ');
  const scored = sentences.map((x, i) => ({ i, x, s: tokens(x).filter((w) => q.has(w)).length }));
  const picked = scored.some((x) => x.s > 0)
    ? [...scored]
        .sort((a, b) => b.s - a.s || a.i - b.i)
        .slice(0, most)
        .sort((a, b) => a.i - b.i)
    : scored.slice(0, most);
  return picked.map((x) => x.x).join(' ');
}

/** The passages that best answer a question (by shared words, rarer words counting more). */
export function searchKnowledge(query: string, limit = 3): Passage[] {
  const q = [...new Set(tokens(query))];
  if (!q.length) return [];
  const docs = PASSAGES.map((p) => ({ p, words: tokens(`${p.title()} ${p.title()} ${p.words} ${p.words} ${p.text()}`) }));
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d.words)) df.set(w, (df.get(w) ?? 0) + 1);
  const idf = (w: string) => Math.log(1 + docs.length / (1 + (df.get(w) ?? 0)));
  return docs
    .map(({ p, words }) => {
      // Each query word counts by how rare it is, and a little more the more often the passage says it.
      const score = q.reduce((s, w) => {
        const tf = words.filter((x) => x === w).length || (w.length > 4 ? words.filter((x) => x.length > 4 && x.startsWith(w)).length / 2 : 0);
        return s + (tf ? idf(w) * ((tf * 2.2) / (tf + 1.2)) : 0);
      }, 0);
      return { p, score };
    })
    .filter((x) => x.score > 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.p);
}
