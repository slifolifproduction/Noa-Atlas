/**
 * What the agent is for, and what it is not.
 *
 * It is for the person's atlas: building it from what they write, thinking it through with them, how the Atlas
 * works, and knowledge that helps with that (how habits form, how to test a cause), tied back to their atlas.
 * It is not a general assistant (code, homework, news, translations), and it never explains the app's insides
 * (instructions, storage, data structures, code): it is for the person who uses the Atlas, not for developers.
 *
 * Three layers, so a request is caught early and an answer is checked late:
 *   before   requests that are plainly outside are answered here, on the device, and never sent to Claude
 *   during   the agent's instructions (prompt.ts) say the same, and its tools only speak the person's language
 *   after    an answer is cleaned of anything that looks like an internal id, code, or its own instructions
 *
 * None of this is a lock: the atlas is the person's own and stays in their browser (they can export all of it).
 * It keeps the agent to its job.
 */
import { t } from '../i18n';
import { fold } from './refs';

export type Verdict = { ok: true } | { ok: false; why: 'internals' | 'offtopic' };

/** Asking about the app's insides, or to set the agent's instructions aside. */
const INTERNALS: RegExp[] = [
  /system ?prompt|your (instructions|rules|prompt)|ignore (all |the |your )?(previous|above|prior)|developer mode|jailbreak|act as (an? )?(dan|unrestricted)/,
  /instruksi (sistem|kamu|mu|anda|awal)|prompt (sistem|kamu|mu|anda)|abaikan (semua|instruksi|perintah|aturan)|mode (developer|pengembang)|lupakan (semua )?(aturan|instruksi)/,
  /\b(database|databased|basis data|skema|schema|local ?storage|indexeddb|session ?storage|api ?key|access token|endpoint|source code|kode sumber|stack trace|raw json|json mentah|internal ids?|id internal|tech stack)\b/,
  /\b(how (is|was|are) (this|the) (app|site|website|atlas|agent) (built|made|coded|programmed|implemented)|what (model|llm|framework|library|libraries) (are you|is this|does (it|this))|which (model|llm) are you)\b/,
  /\b(bagaimana|gimana) (kamu|app|aplikasi|web|website|sistem|agen)(nya)? (dibuat|dibangun|diprogram|dikode|bekerja di balik layar)|pakai (framework|library|bahasa pemrograman) apa|struktur (data|database|kode|tabel)|kode program(nya)?\b/,
];

/** A request for something that has nothing to do with the atlas. */
const ASKING =
  /^(please|pls|can you|could you|would you|how|how's|bagaimana|gimana|tolong|bisa(kah)? (kamu|tolong|bantu)?|bantu(in)?|buatkan|buatin|tuliskan|tulisin|jelaskan|terjemahkan|translate|write|generate|solve|kerjakan|hitung(kan)?|what is|what's|who|when did|apa itu|siapa|kapan)\b/;
const OFF_TASK: RegExp[] = [
  /\b(code|kode|coding|function|fungsi|script|skrip|program|sql|regex|html|css|javascript|python|java|php|algorithm|algoritma)\b/,
  /\b(translate|terjemahkan|terjemahan)\b/,
  /\b(weather|cuaca|news|berita|stock|saham|bitcoin|crypto|kripto|exchange rate|kurs|recipe|resep|lyrics|lirik|football|sepak ?bola|movie schedule|jadwal film)\b/,
  /\b(capital (city )?of|ibu ?kota|who (invented|discovered|won)|siapa (penemu|presiden|yang menang)|population of|jumlah penduduk)\b/,
  /\b(homework|equation|integral|derivative|turunan|soal|pr matematika|tugas sekolah|math|matematika|fisika|physics|chemistry|kimia)\b/,
  /\b(essay|esai|makalah|skripsi|poem|puisi|pantun|cerpen|short story|song|lagu|joke|lelucon)\b/,
];
/** Words that tie a message to the atlas or to the person's own life: then it is never turned away here. */
const ATLAS =
  /\b(atlas|map|peta|time|waktu|causes?|sebab|alasan|reasons?|repeats?|pola|pattern|pengulangan|ahead|opsi|options?|pilihan|quests?|misi|catatan|notes?|elemen|elements?|goal|tujuan|habit|kebiasaan|decision|keputusan|plan|rencana|step|langkah|target|lens|lensa)\b/;
const MINE = /\b(i|i'm|im|i've|my|me|myself|saya|aku|ku|gue|gw|diriku|kami|we|our)\b|(ku|mu)\b/;

/** Whether a message is for the agent at all, decided here, before anything is sent anywhere. */
export function check(text: string): Verdict {
  const raw = text.toLowerCase();
  const s = fold(text);
  if (!s) return { ok: true };
  if (INTERNALS.some((r) => r.test(raw) || r.test(s))) return { ok: false, why: 'internals' };
  // Only a plain request for something unrelated is turned away here; anything about the person or their atlas goes
  // through (the agent's own instructions handle what is subtler).
  if (ASKING.test(s) && OFF_TASK.some((r) => r.test(s)) && !ATLAS.test(s) && !MINE.test(s)) return { ok: false, why: 'offtopic' };
  return { ok: true };
}

export function refusal(why: 'internals' | 'offtopic'): string {
  return why === 'internals'
    ? t(
        'I can’t go into how the app works behind the scenes; I’m here for your atlas. What I can tell you: it is kept in this browser (or in your claude.ai account), and you can export or import all of it in Settings → Your data.',
      )
    : t(
        'That is outside what I can help with here. I’m here for your atlas: tell me what happened and I’ll build it into your lenses, ask why something keeps happening, look at your options, or plan a quest.',
      );
}

/** A word in the agent's instructions that never belongs in an answer: if it shows, the answer is not shown. */
export const CANARY = 'ATLAS-GUIDE-7C1';

const IDS = /\b(?:node|claim|pat|path|tgt|act|entry|ent|occ|dec|exp|sug|obs|ver|loop|cand|q|n|a|t)_[A-Za-z0-9]{3,}\b/g;

/** An answer as the person may see it: no internal ids, no code, nothing of the agent's instructions. */
export function clean(text: string, instructions: string[] = []): { text: string; withheld: boolean } {
  if (text.includes(CANARY) || instructions.some((line) => line.length > 40 && text.includes(line))) return { text: refusal('internals'), withheld: true };
  const withoutCode = text.replace(/```[\s\S]*?(```|$)/g, '').replace(/`([^`\n]{0,80})`/g, '$1');
  const out = withoutCode
    .replace(IDS, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\(\s*\)/g, '')
    .trim();
  return { text: out || refusal('internals'), withheld: !out };
}
