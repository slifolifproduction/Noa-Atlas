/**
 * The agent on this device: no language model, so no free conversation, but it understands what people write to it
 * well enough to build their atlas and answer from it, offline, in Indonesian or English.
 *
 * It recognises what a message is, in this order:
 *
 *   a greeting, or "what can you do"
 *   a summary of the last week (or month), and what to do next (the app's own next step)
 *   why something keeps happening, or what the atlas holds about an element, by its name
 *   how the Atlas works, or knowledge that helps (from knowledge.ts)
 *   something to build: a story becomes a note (with what the weave will connect, said beforehand), and plain
 *   statements and commands become elements, reasons, repeats, options and quests
 *
 * Whatever it would add is a draft (changes.ts); whatever it answers cites the records it comes from.
 */
import { analyzeEntryLocally } from '../ai/localAnalysis';
import { claimStatus } from '../domain/claims';
import { AREA_META, KIND_META, STATUS_META } from '../domain/constants';
import { nextStep } from '../domain/nextStep';
import { allWork } from '../domain/quests';
import { mapElements, resolveSource } from '../domain/selectors';
import type { AreaKey, AtlasData, AtlasNode, Effect, ElementKind, Entry, ISODate } from '../domain/types';
import { decisionIn, finishedIn } from '../domain/weave';
import { t, tn } from '../i18n';
import { addDays, formatDate } from '../lib/dates';
import { sentencesOf } from '../ml/tasks';
import { answerFrom, searchKnowledge } from './knowledge';
import { fold } from './refs';
import type { AgentMessage, Change, Citation } from './types';

export interface AgentReply {
  text: string;
  cites?: Citation[];
  changes?: Change[];
  open?: AgentMessage['open'];
}

const tidy = (s: string) =>
  s
    .trim()
    .replace(/^["“”'‘’:\-\s]+|["“”'‘’.,;:!?\s]+$/g, '')
    .replace(/\s+/g, ' ');
const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/* ---------------- reading names and dates ---------------- */

/** The elements a message names, longest names first, none inside another. */
export function elementsIn(data: AtlasData, text: string): AtlasNode[] {
  const s = ` ${fold(text)} `;
  const found = mapElements(data)
    .filter((n) => fold(n.label).length >= 3 && s.includes(` ${fold(n.label)} `))
    .sort((a, b) => b.label.length - a.label.length);
  return found.filter((n, i) => !found.slice(0, i).some((m) => fold(m.label).includes(fold(n.label))));
}

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  agt: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
  december: 12,
};
const MONTH_NAMES = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

/** A date a message gives for something ahead ("6 Desember", "December 6", "next week", "dalam 3 minggu"). */
export function dateAhead(text: string, today: ISODate): ISODate | undefined {
  const s = fold(text);
  const y = Number(today.slice(0, 4));
  const exact = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (exact) return exact[0];
  const dm = s.match(/\b(\d{1,2}) ([a-z]+)(?: (\d{4}))?\b/);
  const md = s.match(/\b([a-z]+) (\d{1,2})(?: (\d{4}))?\b/);
  for (const [d, m, yr] of [dm && [dm[1], dm[2], dm[3]], md && [md[2], md[1], md[3]]].filter(Boolean) as string[][]) {
    const month = MONTHS[m];
    if (!month || Number(d) < 1 || Number(d) > 31) continue;
    let date = iso(yr ? Number(yr) : y, month, Number(d));
    if (!yr && date < today) date = iso(y + 1, month, Number(d));
    return date;
  }
  const within = s.match(/\b(?:dalam|in) (\d{1,3}) (hari|days?|minggu|weeks?|bulan|months?)\b/);
  if (within) {
    const n = Number(within[1]);
    return addDays(today, /hari|day/.test(within[2]) ? n : /minggu|week/.test(within[2]) ? n * 7 : n * 30);
  }
  if (/\b(besok|tomorrow)\b/.test(s)) return addDays(today, 1);
  if (/\b(lusa)\b/.test(s)) return addDays(today, 2);
  if (/\b(minggu depan|next week)\b/.test(s)) return addDays(today, 7);
  if (/\b(bulan depan|next month)\b/.test(s)) return addDays(today, 30);
  if (/\b(akhir bulan|end of (the )?month)\b/.test(s)) {
    const [yy, mm] = today.split('-').map(Number);
    return addDays(mm === 12 ? `${yy + 1}-01-01` : iso(yy, mm + 1, 1), -1);
  }
  if (/\b(akhir tahun|end of (the )?year)\b/.test(s)) return `${y}-12-31`;
  return undefined;
}

/** The day a story is about: today, unless it says yesterday. */
const storyDate = (text: string, today: ISODate) => (/\b(kemarin|yesterday)\b/i.test(text) ? addDays(today, -1) : today);

/* ---------------- what kind of element, and where ---------------- */

const KIND_WORDS: [RegExp, ElementKind][] = [
  [/^(tujuan|goal|target|sasaran)$/, 'goal'],
  [/^(nilai|value|prinsip|principle)$/, 'value'],
  [/^(ketakutan|takut|fear|kekhawatiran|worry)$/, 'fear'],
  [/^(keyakinan|belief|kepercayaan)$/, 'belief'],
  [/^(pertanyaan|question)$/, 'question'],
  [/^(kebiasaan|habit|perilaku|behaviou?r|rutinitas|routine)$/, 'behaviour'],
  [/^(komitmen|commitment|proyek|project|projek)$/, 'commitment'],
  [/^(skill|keahlian|keterampilan|kemampuan)$/, 'skill'],
  [/^(peran|role)$/, 'role'],
  [/^(keadaan|kondisi|state)$/, 'state'],
  [/^(orang|person|teman|friend)$/, 'person'],
  [/^(sumber daya|resource|modal)$/, 'resource'],
  [/^(tempat|place|lokasi)$/, 'place'],
];
const kindOf = (word: string) => KIND_WORDS.find(([r]) => r.test(fold(word)))?.[1];

// Everyday words, and those of the kinds of work in the examples (design, accounting, management, running a business,
// events, data, programming, studying), so what such a person writes lands in the right area.
const AREA_WORDS: [RegExp, AreaKey][] = [
  [
    /\b(uang|duit|gaji|tabungan|utang|hutang|money|salary|savings|debt|budget|anggaran|invest|bayar|pay|income|penghasilan|runway|kas|cash|bonus|diskon|discount|sponsor|tagihan|invoice|beasiswa|scholarship|ukt)\b/,
    'money',
  ],
  [
    /\b(tidur|sleep|olahraga|exercise|lari|run|makan|diet|sehat|health|energi|energy|capek|tired|sakit|sick|gym|stres|stress|begadang|kopi|coffee|tensi)\b/,
    'health',
  ],
  [
    /\b(kerja|work|kantor|office|klien|client|bos|boss|karier|career|job|pekerjaan|rapat|meeting|lembur|overtime|shift|tim|team|supervisor|closing|audit|rekonsiliasi|reconciliation|brief|revisi|revision|deploy|rilis|release|bug|sprint|kode|code|vendor|gudang|warehouse|pabrik|factory|pelanggan|customer|direksi|stakeholder|dasbor|dashboard)\b/,
    'work',
  ],
  [/\b(teman|friend|keluarga|family|pasangan|partner|ibu|ayah|mom|dad|anak|child|pacar|istri|suami|wife|husband)\b/, 'people'],
  [
    /\b(belajar|learn|kursus|course|bahasa|language|skill|baca|read|buku|book|latihan|practice|kuliah|kuis|quiz|ujian|exam|skripsi|thesis|dosen|lecturer|sertifikasi|certification|cpa|magang|internship|mentor|portofolio|portfolio)\b/,
    'growth',
  ],
  [/\b(rumah|home|kota|city|pindah|move|kos|apartemen|apartment|studio)\b/, 'place'],
  [
    /\b(proyek|project|film|buku saya|startup|bisnis|business|aplikasi|app|acara|event|konser|concert|festival|pameran|exhibition|lomba|competition|organisasi|bem)\b/,
    'projects',
  ],
];
const KIND_AREA: Record<ElementKind, AreaKey> = {
  value: 'self',
  belief: 'self',
  fear: 'self',
  goal: 'projects',
  question: 'self',
  behaviour: 'self',
  commitment: 'projects',
  skill: 'growth',
  role: 'work',
  state: 'health',
  person: 'people',
  resource: 'money',
  place: 'place',
};
export const areaFor = (kind: ElementKind, label: string): AreaKey => AREA_WORDS.find(([r]) => r.test(fold(label)))?.[1] ?? KIND_AREA[kind];

/* ---------------- statements and commands that build ---------------- */

const UP = /\b(naik|meningkat|bertambah|lebih (baik|banyak|semangat)|raises?|increases?|boosts?|more|better|up)\b/;
const DOWN = /\b(turun|menurun|berkurang|lebih (buruk|sedikit)|lowers?|reduces?|decreases?|drains?|less|worse|down)\b/;
const effectIn = (s: string): Effect => (DOWN.test(s) ? 'lowers' : UP.test(s) ? 'raises' : 'triggers');

const element = (label: string, kind: ElementKind, summary?: string): Change => ({
  kind: 'element',
  label: capital(tidy(label)),
  element: kind,
  area: areaFor(kind, label),
  summary,
});
const steps = (s: string) =>
  s
    .split(/\s*(?:,|;|\blalu\b|\bkemudian\b|\bterus\b|\bthen\b|\band then\b|→|->)\s*/i)
    .map(tidy)
    .filter((x) => x.length > 1);

/**
 * What a sentence asks to add, or states plainly enough to add: "tambah tujuan: …", "aku takut …", "I believe …",
 * "setiap kali …, …" (a repeat), "X bikin Y turun" (a reason, between two elements), "deadline … 6 Desember" (a quest),
 * "pilihan: … atau …" (options).
 */
export function changesIn(data: AtlasData, sentence: string, today: ISODate): Change[] {
  const raw = sentence.trim();
  const s = fold(raw);
  // "tambah(kan)/buat(kan)/add/create <kind> <name>"
  const cmd =
    raw.match(/^(?:tolong\s+)?(?:tambah(?:kan)?|buat(?:kan)?|catat(?:kan)?|add|create|new)\s+(?:a\s+|an\s+|sebuah\s+)?([a-zA-Z ]+?)\s*[:\-–"“]\s*(.+)$/i) ??
    raw.match(
      /^(?:tolong\s+)?(?:tambah(?:kan)?|buat(?:kan)?|add|create)\s+(?:a\s+|an\s+)?(tujuan|goal|nilai|value|ketakutan|fear|keyakinan|belief|kebiasaan|habit|komitmen|commitment|proyek|project|skill|keahlian|orang|person|tempat|place|pertanyaan|question|keadaan|state)\s+(.+)$/i,
    );
  if (cmd) {
    const what = fold(cmd[1]);
    const rest = cmd[2];
    if (/^(quest|misi|deadline|tenggat)$/.test(what)) return questFrom(rest, today);
    if (/^(opsi|option|pilihan|jalur|path)$/.test(what)) return [{ kind: 'option', title: capital(tidy(rest)), objective: '' }];
    if (/^(pola|repeat|pattern|pengulangan)$/.test(what)) {
      const st = steps(rest);
      return st.length >= 2 ? [{ kind: 'repeat', steps: st.map(capital), observation: capital(tidy(rest)) }] : [];
    }
    const kind = kindOf(cmd[1]);
    if (kind) return [element(rest, kind)];
  }
  const out: Change[] = [];
  const grab = (r: RegExp, kind: ElementKind) => {
    const m = raw.match(r);
    if (m && tidy(m[m.length - 1]).length > 2) out.push(element(m[m.length - 1].split(/\s+(?:karena|because|tapi|but)\s+/i)[0], kind));
  };
  grab(/\b(?:tujuan|goal|target)\s+(?:saya|aku|ku|my)\s*(?:adalah|ialah|is|:)?\s+(.+)$/i, 'goal');
  grab(/\b(?:saya|aku|gue|i)\s+(?:ingin|mau|pengen|pengin|want to|would like to)\s+(?:bisa\s+)?(.+)$/i, 'goal');
  grab(/\b(?:saya|aku|gue)\s+(?:takut|khawatir|cemas)\s+(?:kalau|bahwa|akan|soal)?\s*(.+)$/i, 'fear');
  grab(/\bi(?:'m| am)\s+(?:afraid|scared|worried)\s+(?:of|that|about)?\s*(.+)$/i, 'fear');
  grab(/\b(?:saya|aku|gue)\s+(?:percaya|yakin)\s+(?:bahwa\s+)?(.+)$/i, 'belief');
  grab(/\bi believe\s+(?:that\s+)?(.+)$/i, 'belief');
  grab(/\b(?:yang penting (?:bagi|buat) (?:saya|aku|ku)|nilai (?:saya|aku|ku)|i value|what matters to me is)\s*(?:adalah|ialah|:)?\s*(.+)$/i, 'value');
  // "setiap kali / tiap kali / always when / whenever A, B (lalu C)" — something that keeps happening
  const rep = raw.match(/^(?:setiap kali|tiap kali|tiap|setiap|selalu|kalau|whenever|every time|each time)\s+(.+?),\s*(.+)$/i);
  if (rep && /\b(setiap|tiap|selalu|whenever|every|each)\b/i.test(raw)) {
    const st = [tidy(rep[1]), ...steps(rep[2])].map(capital);
    if (st.length >= 2) out.push({ kind: 'repeat', steps: st.slice(0, 5), observation: capital(tidy(raw)) });
  }
  // "A bikin/membuat/makes/causes B (turun/naik)": a reason between two elements on the map
  const why = raw.match(/^(.+?)\s+(?:bikin|membuat|menyebabkan|bikin aku|bikin saya|makes?|causes?|leads? to|drains?)\s+(.+)$/i);
  if (why) {
    const [a] = elementsIn(data, why[1]);
    const [b] = elementsIn(data, why[2]);
    if (a && b && a.id !== b.id) out.push({ kind: 'reason', from: a.label, to: b.label, effect: effectIn(fold(why[2])) });
  }
  // "B (turun/naik) karena A", "B because A"
  const because = raw.match(/^(.+?)\s+(?:karena|gara-gara|gara2|akibat|because of|because)\s+(.+)$/i);
  if (because) {
    const [b] = elementsIn(data, because[1]);
    const [a] = elementsIn(data, because[2]);
    if (a && b && a.id !== b.id) out.push({ kind: 'reason', from: a.label, to: b.label, effect: effectIn(fold(because[1])) });
  }
  // "deadline/tenggat/quest … (date)" with steps after "langkah:" / "steps:"
  if (/\b(deadline|tenggat|quest|misi|harus selesai|must finish|due)\b/.test(s)) out.push(...questFrom(raw, today));
  // "pilihan/opsi: A atau B", "between A and B", "antara A atau B"
  const options = raw.match(
    /\b(?:pilihan(?:nya)?|opsi(?:nya)?|options?|antara|between|choosing between)\s*:?\s*(.+?)\s+(?:atau|or|vs\.?|versus|and|dan)\s+(.+?)$/i,
  );
  if (options) for (const o of [options[1], options[2]]) if (tidy(o).length > 2) out.push({ kind: 'option', title: capital(tidy(o)), objective: '' });
  return out;
}

function questFrom(text: string, today: ISODate): Change[] {
  const due = dateAhead(text, today);
  const [head, tail] = text.split(/\b(?:langkah(?:nya)?|steps?)\s*:\s*/i);
  const title = tidy(
    head
      .replace(/\b(deadline|tenggat|quest|misi|harus selesai|must finish|due)\b\s*:?/gi, '')
      .replace(/\b(sebelum|paling lambat|pada|tanggal|tgl|by|before|on)\b.*$/i, '')
      .replace(/\b(\d{4}-\d{2}-\d{2}|besok|lusa|tomorrow|minggu depan|next week|bulan depan|next month|akhir (bulan|tahun)|end of the (month|year))\b.*$/i, '')
      .replace(new RegExp(`\\b(\\d{1,2}\\s+(${MONTH_NAMES})|(${MONTH_NAMES})\\s+\\d{1,2})\\b.*$`, 'i'), '')
      .replace(/\b(?:dalam|in) \d{1,3} (hari|days?|minggu|weeks?|bulan|months?)\b.*$/i, ''),
  );
  if (!title || !due) return [];
  return [{ kind: 'quest', title: capital(title), due, steps: tail ? steps(tail).map(capital).slice(0, 8) : [] }];
}

/* ---------------- answers from the atlas ---------------- */

const statusOf = (data: AtlasData, id: string) => STATUS_META[claimStatus(data, data.claims[id])].label.toLowerCase();

function whyAnswer(data: AtlasData, n: AtlasNode): AgentReply {
  const reasons = Object.values(data.claims).filter((c) => c.to === n.id && c.state === 'adopted' && !c.retired);
  const repeats = Object.values(data.patterns).filter((p) => !p.setAside && p.nodeIds.includes(n.id));
  const notes = Object.values(data.entries)
    .filter((e) => e.nodeIds.includes(n.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  const lines: string[] = [];
  if (reasons.length) {
    lines.push(t('What your atlas has on why “{name}” happens:', { name: n.label }));
    for (const c of reasons.slice(0, 5)) lines.push(`• [R${c.code}] · ${statusOf(data, c.id)}`);
  } else lines.push(t('There is no possible reason for “{name}” on your atlas yet.', { name: n.label }));
  if (repeats.length) lines.push(t('It takes part in:'), ...repeats.slice(0, 3).map((p) => `• [P${p.code}]`));
  if (notes.length) lines.push(t('Your latest notes about it:'), ...notes.map((e) => `• [N${e.seq}] · ${formatDate(e.date)}`));
  lines.push(
    reasons.length
      ? t('These are possibilities, not findings: a reason grows surer only as your notes show it, in separate weeks, and a test is the strongest.')
      : t('Tell me what you think leads to it (for example “late nights make Energy go down”), and I’ll draft it as a hunch to check.'),
  );
  return {
    text: lines.join('\n'),
    cites: [...reasons.map((c) => ({ kind: 'claim' as const, id: c.id })), { kind: 'node', id: n.id }],
    open: [{ label: t('Open Causes'), route: 'network' }],
  };
}

function aboutAnswer(data: AtlasData, n: AtlasNode): AgentReply {
  const notes = Object.values(data.entries).filter((e) => e.nodeIds.includes(n.id));
  const latest = [...notes].sort((a, b) => b.date.localeCompare(a.date))[0];
  const into = Object.values(data.claims).filter((c) => c.to === n.id && c.state === 'adopted' && !c.retired);
  const from = Object.values(data.claims).filter((c) => c.from === n.id && c.state === 'adopted' && !c.retired);
  const links = Object.values(data.edges).filter((e) => e.source === n.id || e.target === n.id);
  const lines = [
    `${n.label} · ${KIND_META[n.kind].label} · ${AREA_META[n.area].label}`,
    n.summary ? n.summary : '',
    tn(notes.length, 'One note is about it.', '{n} notes are about it.') + (latest ? ` ${t('The latest:')} [N${latest.seq}]` : ''),
    into.length ? `${t('Possible reasons for it:')} ${into.map((c) => `[R${c.code}]`).join(' ')}` : '',
    from.length ? `${t('What it may lead to:')} ${from.map((c) => `[R${c.code}]`).join(' ')}` : '',
    links.length ? tn(links.length, 'Linked to one other element.', 'Linked to {n} other elements.') : '',
  ].filter(Boolean);
  return { text: lines.join('\n'), cites: [{ kind: 'node', id: n.id }], open: [{ label: t('Open the Map'), route: 'orbit' }] };
}

function summaryAnswer(data: AtlasData, today: ISODate, days: number): AgentReply {
  const since = addDays(today, -(days - 1));
  const within = (d?: string) => Boolean(d && d >= since && d <= today);
  const notes = Object.values(data.entries)
    .filter((e) => within(e.date))
    .sort((a, b) => b.date.localeCompare(a.date));
  const decisions = Object.values(data.decisions).filter((d) => within(d.date));
  const { actions, targets } = allWork(data);
  const done = actions.filter((a) => a.status === 'done' && within(a.doneAt));
  const met = targets.filter((x) => x.done && within(x.doneAt));
  const repeats = Object.values(data.patterns).filter((p) => p.evidence.some((e) => e.stance === 'supports' && within(resolveSource(data, e.source).date)));
  const soon = targets.filter((x) => !x.done && x.due >= today && x.due <= addDays(today, 14));
  const lines = [
    days > 7 ? t('The last month, from your atlas:') : t('The last seven days, from your atlas:'),
    notes.length
      ? `• ${tn(notes.length, 'One note', '{n} notes')}: ${notes
          .slice(0, 6)
          .map((e) => `[N${e.seq}]`)
          .join(' ')}`
      : `• ${t('No notes in this time. Nothing written is not the same as nothing happening.')}`,
    decisions.length ? `• ${tn(decisions.length, 'One decision', '{n} decisions')}: ${decisions.map((d) => `[D${d.seq}]`).join(' ')}` : '',
    done.length || met.length
      ? `• ${tn(done.length, 'One step done', '{n} steps done')}${met.length ? `, ${tn(met.length, 'one target met', '{n} targets met')}` : ''}`
      : '',
    repeats.length ? `• ${t('Repeats that happened again:')} ${repeats.map((p) => `[P${p.code}]`).join(' ')}` : '',
    soon.length ? `• ${t('Due in the next two weeks:')} ${soon.map((x) => `${x.title} (${formatDate(x.due)})`).join(', ')}` : '',
  ].filter(Boolean);
  return { text: lines.join('\n'), open: [{ label: t('Open Time'), route: 'timeline' }] };
}

/* ---------------- the reply ---------------- */

const GREETING =
  /^(hai|halo|hallo|hi|hello|hey|hei|pagi|siang|sore|malam|selamat (pagi|siang|sore|malam)|assalamualaikum|makasih|terima kasih|thanks|thank you|ok|oke|sip)\b/;
const CAN_DO = /\b(apa yang bisa (kamu|kau|anda) (lakukan|bantu)|kamu bisa apa|bisa bantu apa|what can you do|how can you help|help me|bantuan|fitur agen)\b/;
const SUMMARY =
  /\b(rangkum|ringkas|ringkasan|rekap|summar(y|ise|ize)|recap|what happened|apa yang terjadi|minggu ini|this week|akhir akhir ini|lately|bulan ini|this month)\b/;
const NEXT =
  /\b(langkah (berikut(nya)?|selanjutnya)|next step|what (should|do) i do (next|now)|apa yang (harus|sebaiknya|perlu) (saya|aku) (lakukan|kerjakan)|harus ngapain|ngapain (sekarang|dulu)|what now)\b/;
const WHY = /\b(kenapa|mengapa|why|apa (penyebab|sebab|alasan)(nya)?|what causes|what makes)\b/;
const ABOUT = /^(tentang|soal|about|ceritakan( tentang)?|tell me about|apa (yang )?(aku|saya) tahu tentang|what do i know about|lihat|show me)\b/;
const QUESTION =
  /^(apa|apakah|kenapa|mengapa|bagaimana|gimana|kapan|siapa|dimana|di mana|berapa|bisakah|bisa(kah)? (aku|saya)|why|what|how|when|who|where|is|are|do|does|can|could|should|cara)\b/;
const FIRST_PERSON = /\b(saya|aku|gue|gw|ku|i|i'm|im|my|me|we|kami|kita)\b/;

export function localReply(text: string, data: AtlasData, today: ISODate): AgentReply {
  const s = fold(text);
  const words = s.split(' ').filter(Boolean).length;
  const asking = /\?\s*$/.test(text.trim()) || QUESTION.test(s);

  if (GREETING.test(s) && words <= 5)
    return {
      text: t(
        'Hello! Tell me what happened, a plan, or something that keeps happening, and I’ll draft it into your atlas. Or ask me why something keeps happening, or what happened this week.',
      ),
    };
  if (CAN_DO.test(s)) return { text: searchKnowledge('agent agen')[0]?.text() ?? '' };
  if (SUMMARY.test(s) && words <= 12) return summaryAnswer(data, today, /\b(bulan|month)\b/.test(s) ? 30 : 7);
  if (NEXT.test(s)) {
    const step = nextStep(data, today);
    return {
      text: `${t('The Atlas’s next step for you:')}\n${step.title}${step.detail ? `\n${step.detail}` : ''}`,
      open: [{ label: t('Open the Map'), route: 'orbit' }],
    };
  }
  const named = elementsIn(data, text);
  if (WHY.test(s) && named.length) return whyAnswer(data, named[0]);
  if (named.length && (ABOUT.test(s) || fold(named[0].label) === s.replace(/^(apa|what|who|siapa)\s+(itu|is)\s+/, ''))) return aboutAnswer(data, named[0]);

  if (asking) {
    const found = searchKnowledge(text, 2);
    if (found.length) {
      const [first, second] = found;
      return {
        text: [answerFrom(first, text), second ? `${t('See also:')} ${second.title()}.` : ''].filter(Boolean).join('\n\n'),
        open: first.route ? [{ label: first.title(), route: first.route }] : undefined,
      };
    }
    if (WHY.test(s)) return { text: t('I couldn’t find that on your Map. Name it the way it is called there, or tell me what happened and I’ll add it.') };
  }

  // Something to build: what the sentences state or ask for, and the story itself as a note.
  const sentences = sentencesOf(text);
  const changes = sentences.flatMap((x) => changesIn(data, x, today));
  const story = !asking && words >= 5 && (FIRST_PERSON.test(s) || sentences.length > 1 || /\b(hari ini|kemarin|tadi|today|yesterday)\b/.test(s));
  const commandOnly = changes.length > 0 && sentences.length === 1 && /^(tolong\s+)?(tambah|buat|catat|add|create|new)\b/.test(s);
  if (story && !commandOnly) changes.push({ kind: 'note', content: text.trim(), date: storyDate(text, today) });

  if (changes.length) return { text: draftText(data, changes, today), changes };

  return {
    text: t(
      'I’m not sure what you’d like. I can draft what you tell me into your atlas (“today I…”, “add goal: …”, “every time X, Y”, “deadline: … by 6 December”), answer why something on your Map keeps happening, summarise this week, or explain how the Atlas works.',
    ),
  };
}

/** What the draft is, said in a few lines, with what the note will connect when it is saved. */
function draftText(data: AtlasData, changes: Change[], today: ISODate): string {
  const lines = [t('Here is what I would add. Nothing changes until you apply it.')];
  const note = changes.find((c): c is Extract<Change, { kind: 'note' }> => c.kind === 'note');
  if (note) {
    const draft: Entry = {
      id: 'draft',
      seq: 0,
      kind: 'journal',
      title: '',
      content: note.content,
      date: note.date,
      areas: [],
      tags: [],
      nodeIds: [],
      createdAt: `${today}T00:00:00.000Z`,
      updatedAt: `${today}T00:00:00.000Z`,
    };
    const read = analyzeEntryLocally(draft, data);
    const about = [
      ...new Set([
        ...read.suggestions.flatMap((x) => (x.type === 'link_node' && data.nodes[x.nodeId] ? [data.nodes[x.nodeId].label] : [])),
        ...changes.flatMap((c) => (c.kind === 'element' && fold(note.content).includes(fold(c.label)) ? [c.label] : [])),
      ]),
    ];
    const decided = decisionIn(draft);
    const finished = finishedIn(data, draft);
    const explains = read.suggestions.filter((x) => x.type === 'attribution');
    const will = [
      about.length ? t('it is about {names}', { names: about.map((x) => `“${x}”`).join(', ') }) : '',
      decided ? t('a decision: “{what}”', { what: decided.title }) : '',
      finished.length ? t('finished: {steps}', { steps: finished.map((f) => `“${f.title}”`).join(', ') }) : '',
      explains.length ? t('your explanation is offered as a possible reason') : '',
    ].filter(Boolean);
    if (will.length) lines.push(`${t('When the note is saved, the Atlas will also connect it:')} ${will.join(' · ')}.`);
  }
  const added = changes.filter((c) => c.kind !== 'note');
  if (!note && added.length === 1 && added[0].kind === 'reason') lines.push(t('A reason starts as a hunch to check: saying so is not evidence.'));
  return lines.join('\n');
}
