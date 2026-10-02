/**
 * The training data for the local AI: sentences like the ones people write in their notes, in Indonesian and
 * English (and the mix of both people actually write), each labelled for the five heads in src/ml/tasks.ts.
 *
 * Sentences are composed from clause templates and slots, so the labels follow from how they were built: a
 * "done" clause makes act = done, a "because" between two clauses makes cause = yes, and so on. Informal
 * spelling ("udah", "gak", "bgt"), missing subjects and lower case are added the way people type.
 *
 * About a fifth of the templates of every kind are kept out of training and used only for the test set, so the
 * test measures sentences built in ways the model has never seen, not memory. The hand-written gold set
 * (gold.jsonl) is the real test: natural sentences, written apart from any template.
 *
 * Run: npm run ml:data   (deterministic: the same seed gives the same data)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pack, type Example, type Labels, type Lang } from '../../src/ml/tasks.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/* ---------------- a seeded random source ---------------- */

let seed = 0x5eed2026;
const rand = () => {
  seed = (seed + 0x6d2b79f5) >>> 0;
  let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
  return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;

/* ---------------- slots ---------------- */

type Pair = readonly [string, string];

const TASKS = [
  ['the invoice', 'invoice-nya'],
  ['the client deck', 'deck klien'],
  ['the storyboard', 'storyboard'],
  ['the edit', 'editan'],
  ['the proposal', 'proposal'],
  ['the grant application', 'aplikasi hibah'],
  ['the report', 'laporan'],
  ['the website', 'website'],
  ['the portfolio', 'portofolio'],
  ['the budget', 'anggaran'],
  ['scene 4', 'scene 4'],
  ['the script', 'naskah'],
  ['the presentation', 'presentasi'],
  ['my tax return', 'laporan pajak'],
  ['the thesis chapter', 'bab skripsi'],
  ['the newsletter', 'newsletter'],
  ['the slides', 'slide'],
  ['the contract', 'kontrak'],
  ['the demo', 'demo'],
  ['the workshop deck', 'deck workshop'],
  ['the rough cut', 'rough cut'],
  ['the quarterly review', 'review kuartal'],
] as const;
const PEOPLE = ['Juna', 'Ruth', 'Sam', 'Marta', 'Dina', 'Budi', 'Rina', 'Andi', 'Sari', 'Tom'];
const PEOPLE_ROLE = [
  ['my manager', 'atasan'],
  ['the client', 'klien'],
  ['my mum', 'ibu'],
  ['my partner', 'pasangan'],
  ['the producer', 'produser'],
] as const;
const PLACES = [
  ['the studio', 'studio'],
  ['the office', 'kantor'],
  ['the gym', 'gym'],
  ['home', 'rumah'],
  ['campus', 'kampus'],
  ['the café', 'kafe'],
  ['the market', 'pasar'],
] as const;
/** Factors, and whether more of them is better (+1) or worse (-1). */
const FACTORS = [
  ['energy', 'energi', 1],
  ['my focus', 'fokus', 1],
  ['motivation', 'motivasi', 1],
  ['my savings', 'tabungan', 1],
  ['income', 'pemasukan', 1],
  ['my mood', 'mood', 1],
  ['sleep', 'jam tidur', 1],
  ['stress', 'stres', -1],
  ['the workload', 'beban kerja', -1],
  ['anxiety', 'kecemasan', -1],
  ['debt', 'utang', -1],
  ['screen time', 'screen time', -1],
] as const;
const CHOICES = [
  ['take the retainer', 'ambil kontrak retainer'],
  ['keep two days for my film', 'nyisain dua hari buat film'],
  ['pause the podcast', 'menunda podcast'],
  ['move to the new flat', 'pindah ke kos baru'],
  ['accept the full-time offer', 'terima tawaran kerja tetap'],
  ['stop taking new clients', 'berhenti ambil klien baru'],
  ['work from home on Fridays', 'kerja dari rumah tiap Jumat'],
  ['raise my rate', 'naikin tarif'],
] as const;
const OFFERS = [
  ['the agency job', 'kerjaan agensi'],
  ['the extra project', 'proyek tambahan'],
  ['the Northlight role', 'posisi di Northlight'],
  ['the weekend shoot', 'syuting akhir pekan'],
  ['the speaking invite', 'undangan jadi pembicara'],
] as const;
const MOOD_LOW: readonly Pair[] = [
  ['exhausted', 'capek banget'],
  ['drained', 'lelah'],
  ['tired', 'capek'],
  ['stressed out', 'stres'],
  ['anxious', 'cemas'],
  ['flat', 'lemas'],
  ['burnt out', 'burnout'],
  ['sad', 'sedih'],
  ['overwhelmed', 'kewalahan'],
  ['frustrated', 'kesel'],
];
const MOOD_HIGH: readonly Pair[] = [
  ['energised', 'semangat'],
  ['happy', 'senang'],
  ['proud', 'bangga'],
  ['calm', 'tenang'],
  ['relieved', 'lega'],
  ['excited', 'excited'],
  ['great', 'bahagia'],
  ['focused', 'fokus banget'],
];
const MOOD_MID: readonly Pair[] = [
  ['okay', 'biasa aja'],
  ['fine', 'lumayan'],
  ['so-so', 'datar aja'],
];

type L = 0 | 1; // 0 = English, 1 = Indonesian
const task = (l: L) => pick(TASKS)[l];
const person = (l: L) => (chance(0.7) ? pick(PEOPLE) : pick(PEOPLE_ROLE)[l]);
const place = (l: L) => pick(PLACES)[l];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------------- clauses ---------------- */

type Part = Partial<Labels>;
interface Clause {
  text: string;
  labels: Part;
  /** Whether it can stand as the effect (before "because") or the cause (after it). */
  role: 'effect' | 'cause' | 'any';
}
type Template = { id: string; lang: L; make(): Clause };

const T: Template[] = [];
const add = (id: string, lang: L, role: Clause['role'], labels: Part, make: () => string) => T.push({ id, lang, make: () => ({ text: make(), labels, role }) });

const I = () => pick(['I', 'I', 'We']);
const AKU = () => pick(['aku', 'saya', 'gue', 'kami', '']);

// What was finished.
add('en.done.1', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} finished ${task(0)}`);
add('en.done.2', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} sent ${task(0)} to ${person(0)}`);
add('en.done.3', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} got ${task(0)} done`);
add('en.done.4', 0, 'cause', { act: 'done', time: 'past' }, () => `${cap(task(0))} is finally done`);
add('en.done.5', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} wrapped up ${task(0)}`);
add('en.done.6', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} submitted ${task(0)}`);
add('en.done.7', 0, 'cause', { act: 'done', time: 'past' }, () => `Done with ${task(0)}`);
add('en.done.8', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} handed in ${task(0)} on time`);
add('en.done.9', 0, 'cause', { act: 'done', time: 'past' }, () => `Ticked off ${task(0)}`);
add('en.done.10', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} completed ${task(0)} before lunch`);
add('id.done.1', 1, 'cause', { act: 'done', time: 'past' }, () => `${AKU()} udah selesaiin ${task(1)}`);
add('id.done.2', 1, 'cause', { act: 'done', time: 'past' }, () => `akhirnya ${task(1)} selesai`);
add('id.done.3', 1, 'cause', { act: 'done', time: 'past' }, () => `${task(1)} beres hari ini`);
add('id.done.4', 1, 'cause', { act: 'done', time: 'past' }, () => `kelar juga ${task(1)}`);
add('id.done.5', 1, 'cause', { act: 'done', time: 'past' }, () => `${AKU()} sudah kirim ${task(1)} ke ${person(1)}`);
add('id.done.6', 1, 'cause', { act: 'done', time: 'past' }, () => `${task(1)} sudah terkirim`);
add('id.done.7', 1, 'cause', { act: 'done', time: 'past' }, () => `${AKU()} berhasil menyelesaikan ${task(1)}`);
add('id.done.8', 1, 'cause', { act: 'done', time: 'past' }, () => `${task(1)} rampung juga`);
add('id.done.9', 1, 'cause', { act: 'done', time: 'past' }, () => `${AKU()} udah submit ${task(1)}`);
add('id.done.10', 1, 'cause', { act: 'done', time: 'past' }, () => `tuntas ${task(1)} sebelum makan siang`);

// What is still to do.
add('en.plan.1', 0, 'effect', { act: 'planned', time: 'future' }, () => `${I()} will finish ${task(0)} tomorrow`);
add('en.plan.2', 0, 'effect', { act: 'planned', time: 'future' }, () => `${I()} need to send ${task(0)}`);
add('en.plan.3', 0, 'effect', { act: 'planned', time: 'future' }, () => `${I()} have to review ${task(0)} next week`);
add('en.plan.4', 0, 'effect', { act: 'planned', time: 'now' }, () => `${I()} haven't finished ${task(0)} yet`);
add('en.plan.5', 0, 'effect', { act: 'planned', time: 'future' }, () => `Going to write ${task(0)} this weekend`);
add('en.plan.6', 0, 'effect', { act: 'planned', time: 'future' }, () => `Planning to submit ${task(0)} on Friday`);
add('en.plan.7', 0, 'effect', { act: 'planned', time: 'now' }, () => `${cap(task(0))} is still not done`);
add('en.plan.8', 0, 'effect', { act: 'planned', time: 'future' }, () => `Should start ${task(0)} soon`);
add('en.plan.9', 0, 'effect', { act: 'planned', time: 'future' }, () => `${I()} want to fix ${task(0)} before Monday`);
add('id.plan.1', 1, 'effect', { act: 'planned', time: 'future' }, () => `besok ${AKU()} mau selesaiin ${task(1)}`);
add('id.plan.2', 1, 'effect', { act: 'planned', time: 'future' }, () => `${AKU()} harus kirim ${task(1)} minggu depan`);
add('id.plan.3', 1, 'effect', { act: 'planned', time: 'now' }, () => `${task(1)} belum selesai`);
add('id.plan.4', 1, 'effect', { act: 'planned', time: 'now' }, () => `${AKU()} belum sempat ngerjain ${task(1)}`);
add('id.plan.5', 1, 'effect', { act: 'planned', time: 'future' }, () => `rencananya ${task(1)} dikirim hari Jumat`);
add('id.plan.6', 1, 'effect', { act: 'planned', time: 'future' }, () => `${AKU()} perlu cek ${task(1)} lagi`);
add('id.plan.7', 1, 'effect', { act: 'planned', time: 'future' }, () => `nanti malam ${AKU()} lanjut ${task(1)}`);
add('id.plan.8', 1, 'effect', { act: 'planned', time: 'future' }, () => `${AKU()} pengen beresin ${task(1)} sebelum Senin`);
add('id.plan.9', 1, 'effect', { act: 'planned', time: 'now' }, () => `${task(1)} masih numpuk`);

// A choice made.
add('en.dec.1', 0, 'cause', { act: 'decided', time: 'past' }, () => `${I()} decided to ${pick(CHOICES)[0]}`);
add('en.dec.2', 0, 'cause', { act: 'decided', time: 'past' }, () => `${I()} chose to ${pick(CHOICES)[0]} instead of ${pick(OFFERS)[0]}`);
add('en.dec.3', 0, 'cause', { act: 'decided', time: 'past' }, () => `${I()} turned down ${pick(OFFERS)[0]}`);
add('en.dec.4', 0, 'cause', { act: 'decided', time: 'past' }, () => `${I()} said no to ${pick(OFFERS)[0]}`);
add('en.dec.5', 0, 'cause', { act: 'decided', time: 'past' }, () => `In the end I went with ${pick(OFFERS)[0]}`);
add('en.dec.6', 0, 'cause', { act: 'decided', time: 'past' }, () => `${I()} said yes to ${pick(OFFERS)[0]}`);
add('en.dec.7', 0, 'cause', { act: 'decided', time: 'past' }, () => `Made up my mind to ${pick(CHOICES)[0]}`);
add('id.dec.1', 1, 'cause', { act: 'decided', time: 'past' }, () => `${AKU()} memutuskan untuk ${pick(CHOICES)[1]}`);
add('id.dec.2', 1, 'cause', { act: 'decided', time: 'past' }, () => `${AKU()} memilih ${pick(CHOICES)[1]} daripada ${pick(OFFERS)[1]}`);
add('id.dec.3', 1, 'cause', { act: 'decided', time: 'past' }, () => `${AKU()} menolak ${pick(OFFERS)[1]}`);
add('id.dec.4', 1, 'cause', { act: 'decided', time: 'past' }, () => `akhirnya ${AKU()} ambil ${pick(OFFERS)[1]}`);
add('id.dec.5', 1, 'cause', { act: 'decided', time: 'past' }, () => `jadi ${AKU()} putuskan ${pick(CHOICES)[1]}`);
add('id.dec.6', 1, 'cause', { act: 'decided', time: 'past' }, () => `${AKU()} bilang gak ke ${pick(OFFERS)[1]}`);
add('id.dec.7', 1, 'cause', { act: 'decided', time: 'past' }, () => `udah fix ${AKU()} ${pick(CHOICES)[1]}`);

// Something that happened.
add('en.hap.1', 0, 'cause', { act: 'happened', time: 'past' }, () => `${I()} met ${person(0)} at ${place(0)}`);
add('en.hap.2', 0, 'cause', { act: 'happened', time: 'past' }, () => `${cap(person(0))} called about ${task(0)}`);
add('en.hap.3', 0, 'cause', { act: 'happened', time: 'past' }, () => `${I()} worked on ${task(0)} all morning`);
add('en.hap.4', 0, 'cause', { act: 'happened', time: 'past' }, () => `Spent the evening at ${place(0)}`);
add('en.hap.5', 0, 'cause', { act: 'happened', time: 'past' }, () => `${I()} had a long meeting with ${person(0)}`);
add('en.hap.6', 0, 'cause', { act: 'happened', time: 'past' }, () => `The client asked for changes to ${task(0)}`);
add('en.hap.7', 0, 'cause', { act: 'happened', time: 'past' }, () => `${I()} went to ${place(0)}`);
add('en.hap.8', 0, 'cause', { act: 'happened', time: 'past' }, () => `${I()} stayed up late on ${task(0)}`);
add('en.hap.9', 0, 'cause', { act: 'happened', time: 'past' }, () => `${I()} skipped the gym`);
add('en.hap.10', 0, 'cause', { act: 'happened', time: 'past' }, () => `${cap(person(0))} dropped by ${place(0)}`);
add('id.hap.1', 1, 'cause', { act: 'happened', time: 'past' }, () => `${AKU()} ketemu ${person(1)} di ${place(1)}`);
add('id.hap.2', 1, 'cause', { act: 'happened', time: 'past' }, () => `${person(1)} nelpon soal ${task(1)}`);
add('id.hap.3', 1, 'cause', { act: 'happened', time: 'past' }, () => `${AKU()} ngerjain ${task(1)} seharian`);
add('id.hap.4', 1, 'cause', { act: 'happened', time: 'past' }, () => `tadi malam ${AKU()} ke ${place(1)}`);
add('id.hap.5', 1, 'cause', { act: 'happened', time: 'past' }, () => `rapat panjang sama ${person(1)}`);
add('id.hap.6', 1, 'cause', { act: 'happened', time: 'past' }, () => `klien minta revisi ${task(1)}`);
add('id.hap.7', 1, 'cause', { act: 'happened', time: 'past' }, () => `${AKU()} begadang ngerjain ${task(1)}`);
add('id.hap.8', 1, 'cause', { act: 'happened', time: 'past' }, () => `${AKU()} bolos gym`);
add('id.hap.9', 1, 'cause', { act: 'happened', time: 'past' }, () => `${person(1)} mampir ke ${place(1)}`);
add('id.hap.10', 1, 'cause', { act: 'happened', time: 'past' }, () => `lembur sampai jam 11`);

// What went up or down (worse and better read through whether more of it is good).
const UP_EN = ['went up', 'rose', 'increased', 'picked up again', 'is climbing', 'doubled'];
const DOWN_EN = ['dropped', 'fell', 'went down', 'decreased', 'is slipping', 'crashed'];
const UP_ID = ['naik', 'meningkat', 'bertambah', 'naik lagi', 'makin tinggi', 'melonjak'];
const DOWN_ID = ['turun', 'menurun', 'berkurang', 'anjlok', 'makin rendah', 'drop'];
const factorChange = (l: L, dir: 'up' | 'down') => {
  const f = pick(FACTORS);
  const words = l === 0 ? (dir === 'up' ? UP_EN : DOWN_EN) : dir === 'up' ? UP_ID : DOWN_ID;
  return `${l === 0 ? cap(f[0]) : f[1]} ${pick(words)}`;
};
const factorValence = (l: L, better: boolean): [string, 'up' | 'down'] => {
  const f = pick(FACTORS);
  const dir = (better ? f[2] > 0 : f[2] < 0) ? 'up' : 'down';
  const word =
    l === 0
      ? better
        ? pick(['got better', 'improved'])
        : pick(['got worse', 'is worse'])
      : better
        ? pick(['membaik', 'lebih baik'])
        : pick(['memburuk', 'makin parah']);
  return [`${l === 0 ? cap(f[0]) : f[1]} ${word}`, dir];
};
add('en.up.1', 0, 'effect', { direction: 'up', time: 'past' }, () => factorChange(0, 'up'));
add('en.down.1', 0, 'effect', { direction: 'down', time: 'past' }, () => factorChange(0, 'down'));
add('id.up.1', 1, 'effect', { direction: 'up', time: 'past' }, () => factorChange(1, 'up'));
add('id.down.1', 1, 'effect', { direction: 'down', time: 'past' }, () => factorChange(1, 'down'));
add('en.up.2', 0, 'effect', { direction: 'up', time: 'past' }, () => `${I()} slept more than usual`);
add('en.down.2', 0, 'effect', { direction: 'down', time: 'past' }, () => `${I()} slept way less this week`);
add('id.up.2', 1, 'effect', { direction: 'up', time: 'past' }, () => `tidurku lebih banyak dari biasanya`);
add('id.down.2', 1, 'effect', { direction: 'down', time: 'past' }, () => `tidurku kurang banget minggu ini`);
add('en.up.3', 0, 'effect', { direction: 'up', time: 'now' }, () => `More and more requests keep coming in`);
add('id.down.3', 1, 'effect', { direction: 'down', time: 'now' }, () => `uang makin tipis`);
for (const [l, better] of [
  [0, true],
  [0, false],
  [1, true],
  [1, false],
] as const)
  T.push({
    id: `${l ? 'id' : 'en'}.val.${better ? 'b' : 'w'}`,
    lang: l,
    make: () => {
      const [text, direction] = factorValence(l, better);
      return { text, labels: { direction, time: 'past' }, role: 'effect' };
    },
  });

// How the person feels.
const feel = (l: L, kind: 'low' | 'high' | 'neutral') => pick(kind === 'low' ? MOOD_LOW : kind === 'high' ? MOOD_HIGH : MOOD_MID)[l];
for (const kind of ['low', 'high', 'neutral'] as const) {
  add(`en.feel.${kind}.1`, 0, 'effect', { mood: kind, time: 'past' }, () => `${I()} felt ${feel(0, kind)}`);
  add(`en.feel.${kind}.2`, 0, 'effect', { mood: kind, time: 'now' }, () => `Feeling ${feel(0, kind)} today`);
  add(`en.feel.${kind}.3`, 0, 'effect', { mood: kind, time: 'past' }, () => `${I()} was so ${feel(0, kind)}`);
  add(`en.feel.${kind}.4`, 0, 'effect', { mood: kind, time: 'now' }, () => `Honestly ${feel(0, kind)}`);
  add(`id.feel.${kind}.1`, 1, 'effect', { mood: kind, time: 'now' }, () => `${AKU()} ngerasa ${feel(1, kind)}`);
  add(`id.feel.${kind}.2`, 1, 'effect', { mood: kind, time: 'now' }, () => `hari ini ${feel(1, kind)}`);
  add(`id.feel.${kind}.3`, 1, 'effect', { mood: kind, time: 'past' }, () => `tadi ${AKU()} ${feel(1, kind)} banget`);
  add(`id.feel.${kind}.4`, 1, 'effect', { mood: kind, time: 'now' }, () => `jujur ${feel(1, kind)}`);
}

// Reflection: nothing done, nothing changed.
add('en.ref.1', 0, 'effect', { act: 'none', time: 'now' }, () => `${I()} keep thinking about ${task(0)}`);
add('en.ref.2', 0, 'effect', { act: 'none', time: 'now' }, () => `Not sure what ${task(0)} means for the plan`);
add('en.ref.3', 0, 'effect', { act: 'none', time: 'now' }, () => `There is a lot on my plate`);
add('en.ref.4', 0, 'effect', { act: 'none', time: 'now' }, () => `Writing this down so I remember it`);
add('en.ref.5', 0, 'effect', { act: 'none', time: 'now' }, () => `${cap(task(0))} feels bigger than it is`);
add('id.ref.1', 1, 'effect', { act: 'none', time: 'now' }, () => `kepikiran terus soal ${task(1)}`);
add('id.ref.2', 1, 'effect', { act: 'none', time: 'now' }, () => `${AKU()} gak yakin ${task(1)} cocok buat rencana ini`);
add('id.ref.3', 1, 'effect', { act: 'none', time: 'now' }, () => `lagi banyak pikiran`);
add('id.ref.4', 1, 'effect', { act: 'none', time: 'now' }, () => `nulis ini biar inget`);
add('id.ref.5', 1, 'effect', { act: 'none', time: 'now' }, () => `${task(1)} kerasa lebih berat dari aslinya`);

// More ways to say each thing, the way notes are actually written.
const BILLS = [
  ['the credit card bill', 'tagihan kartu kredit'],
  ['the rent', 'uang kos'],
  ['the loan', 'cicilan'],
  ['the studio invoice', 'tagihan studio'],
] as const;
const ROUTINES = [
  ['the Sunday review', 'review mingguan'],
  ['the laundry', 'cucian'],
  ['my morning run', 'lari pagi'],
  ['the weekly planning', 'perencanaan mingguan'],
  ['the groceries', 'belanja bulanan'],
] as const;
const THINGS = [
  ['the cheaper flat', 'kos yang lebih murah'],
  ['the smaller camera', 'kamera yang lebih kecil'],
  ['the later deadline', 'deadline yang lebih longgar'],
  ['the remote role', 'kerja remote'],
  ['the morning shift', 'shift pagi'],
] as const;
const bill = (l: L) => pick(BILLS)[l];
const routine = (l: L) => pick(ROUTINES)[l];
const thing = (l: L) => pick(THINGS)[l];

add('en.done.11', 0, 'cause', { act: 'done', time: 'past' }, () => `${cap(task(0))} is live now`);
add('en.done.12', 0, 'cause', { act: 'done', time: 'past' }, () => `Paid off ${bill(0)}`);
add('en.done.13', 0, 'cause', { act: 'done', time: 'past' }, () => `Did ${routine(0)} after dinner`);
add('en.done.14', 0, 'cause', { act: 'done', time: 'past' }, () => `${cap(task(0))} has been approved`);
add('en.done.15', 0, 'cause', { act: 'done', time: 'past' }, () => `Fixed the last bug in ${task(0)}`);
add('en.done.16', 0, 'cause', { act: 'done', time: 'past' }, () => `${I()} managed to finish ${routine(0)}`);
add('id.done.11', 1, 'cause', { act: 'done', time: 'past' }, () => `${task(1)} udah live`);
add('id.done.12', 1, 'cause', { act: 'done', time: 'past' }, () => `${bill(1)} udah lunas`);
add('id.done.13', 1, 'cause', { act: 'done', time: 'past' }, () => `${routine(1)} udah kulakukan`);
add('id.done.14', 1, 'cause', { act: 'done', time: 'past' }, () => `${task(1)} udah di-approve`);
add('id.done.15', 1, 'cause', { act: 'done', time: 'past' }, () => `${task(1)} kelar dikerjain sebelum sore`);
add('id.done.16', 1, 'cause', { act: 'done', time: 'past' }, () => `${bill(1)} sudah kubayar`);

add('en.plan.10', 0, 'effect', { act: 'planned', time: 'future' }, () => `Have to prepare ${task(0)} for Thursday`);
add('en.plan.11', 0, 'effect', { act: 'planned', time: 'future' }, () => `${I()}'ll do ${routine(0)} over the weekend`);
add('en.plan.12', 0, 'effect', { act: 'planned', time: 'now' }, () => `${cap(bill(0))} is still pending`);
add('en.plan.13', 0, 'effect', { act: 'planned', time: 'now' }, () => `Still haven't replied to ${person(0)}`);
add('id.plan.10', 1, 'effect', { act: 'planned', time: 'future' }, () => `harus siapin ${task(1)} buat hari Kamis`);
add('id.plan.11', 1, 'effect', { act: 'planned', time: 'future' }, () => `weekend ini mau ${routine(1)}`);
add('id.plan.12', 1, 'effect', { act: 'planned', time: 'now' }, () => `${bill(1)} masih belum dibayar`);
add('id.plan.13', 1, 'effect', { act: 'planned', time: 'now' }, () => `masih belum balas chat ${person(1)}`);

add('en.dec.8', 0, 'cause', { act: 'decided', time: 'past' }, () => `We picked ${thing(0)} over ${thing(0)}`);
add('en.dec.9', 0, 'cause', { act: 'decided', time: 'past' }, () => `Made the call to ${pick(CHOICES)[0]}`);
add('en.dec.10', 0, 'cause', { act: 'decided', time: 'now' }, () => `${I()}'m going with ${thing(0)}`);
add('en.dec.11', 0, 'cause', { act: 'decided', time: 'now' }, () => `${I()}'m stopping ${task(0)} for now`);
add('id.dec.8', 1, 'cause', { act: 'decided', time: 'past' }, () => `kami pilih ${thing(1)} daripada ${thing(1)}`);
add('id.dec.9', 1, 'cause', { act: 'decided', time: 'past' }, () => `${AKU()} iyain ${pick(OFFERS)[1]}`);
add('id.dec.10', 1, 'cause', { act: 'decided', time: 'now' }, () => `${task(1)} aku stop dulu`);
add('id.dec.11', 1, 'cause', { act: 'decided', time: 'past' }, () => `udah kuputuskan nggak ${pick(CHOICES)[1]}`);

add('en.hap.11', 0, 'cause', { act: 'happened', time: 'past' }, () => `${cap(person(0))} visited for the weekend`);
add('en.hap.12', 0, 'cause', { act: 'happened', time: 'past' }, () => `Went for a long walk after work`);
add('en.hap.13', 0, 'cause', { act: 'happened', time: 'past' }, () => `The meeting got cancelled`);
add('en.hap.14', 0, 'cause', { act: 'happened', time: 'past' }, () => `The payment came in late`);
add('en.hap.15', 0, 'cause', { act: 'happened', time: 'past' }, () => `We missed the deadline for ${task(0)}`);
add('id.hap.11', 1, 'cause', { act: 'happened', time: 'past' }, () => `${person(1)} nginep di rumah pas akhir pekan`);
add('id.hap.12', 1, 'cause', { act: 'happened', time: 'past' }, () => `jalan-jalan sore habis kerja`);
add('id.hap.13', 1, 'cause', { act: 'happened', time: 'past' }, () => `rapatnya batal`);
add('id.hap.14', 1, 'cause', { act: 'happened', time: 'past' }, () => `pembayarannya telat masuk`);
add('id.hap.15', 1, 'cause', { act: 'happened', time: 'past' }, () => `kita telat deadline ${task(1)}`);

const UP2_EN = ['crept up', 'went through the roof', 'got heavier', 'is higher than last week', 'kept rising'];
const DOWN2_EN = ['got lighter', 'fell short', 'is lower than last week', 'dipped', 'shrank'];
const UP2_ID = ['naik terus', 'makin berat', 'membengkak', 'nambah lagi', 'lebih tinggi dari minggu lalu'];
const DOWN2_ID = ['makin ringan', 'kurang lagi', 'menipis', 'merosot', 'lebih rendah dari minggu lalu'];
add('en.up.4', 0, 'effect', { direction: 'up', time: 'past' }, () => `${cap(pick(FACTORS)[0])} ${pick(UP2_EN)}`);
add('en.down.4', 0, 'effect', { direction: 'down', time: 'past' }, () => `${cap(pick(FACTORS)[0])} ${pick(DOWN2_EN)}`);
add('id.up.4', 1, 'effect', { direction: 'up', time: 'past' }, () => `${pick(FACTORS)[1]} ${pick(UP2_ID)}`);
add('id.down.4', 1, 'effect', { direction: 'down', time: 'past' }, () => `${pick(FACTORS)[1]} ${pick(DOWN2_ID)}`);
add('en.up.5', 0, 'effect', { direction: 'up', time: 'past' }, () => `${cap(pick(FACTORS)[0])} was much higher this week`);
add('id.down.5', 1, 'effect', { direction: 'down', time: 'past' }, () => `${pick(FACTORS)[1]} minggu ini jauh lebih rendah`);

// Feeling now, in more words.
const LOW2: readonly Pair[] = [
  ['completely drained', 'deg-degan'],
  ['a bit anxious', 'agak cemas'],
  ['disappointed', 'kecewa'],
  ['worn out', 'lemes'],
  ['low', 'down banget'],
];
const HIGH2: readonly Pair[] = [
  ['really good', 'seneng banget'],
  ['thrilled', 'nggak sabar'],
  ['grateful', 'bersyukur'],
  ['light', 'plong'],
  ['motivated', 'termotivasi'],
];
for (const [kind, list] of [
  ['low', LOW2],
  ['high', HIGH2],
] as const) {
  add(`en.feel2.${kind}.1`, 0, 'effect', { mood: kind, time: 'now' }, () => `I'm ${pick(list)[0]}`);
  add(`en.feel2.${kind}.2`, 0, 'effect', { mood: kind, time: 'now' }, () => `So ${pick(list)[0]} right now`);
  add(`en.feel2.${kind}.3`, 0, 'effect', { mood: kind, time: 'future' }, () => `${cap(pick(list)[0])} about ${task(0)} next week`);
  add(`id.feel2.${kind}.1`, 1, 'effect', { mood: kind, time: 'now' }, () => `rasanya ${pick(list)[1]}`);
  add(`id.feel2.${kind}.2`, 1, 'effect', { mood: kind, time: 'now' }, () => `lagi ${pick(list)[1]}`);
  add(`id.feel2.${kind}.3`, 1, 'effect', { mood: kind, time: 'future' }, () => `${pick(list)[1]} soal ${task(1)} minggu depan`);
}

// Describing how things are: nothing done, nothing changed.
add('en.ref.6', 0, 'effect', { act: 'none', time: 'now' }, () => `There's a lot going on at ${place(0)}`);
add('en.ref.7', 0, 'effect', { act: 'none', time: 'now' }, () => `${cap(task(0))} is on my mind again`);
add('en.ref.8', 0, 'effect', { act: 'none', time: 'past' }, () => `Quiet day, nothing special`);
add('en.ref.9', 0, 'effect', { act: 'none', time: 'now' }, () => `I keep wondering if ${task(0)} is worth it`);
add('id.ref.6', 1, 'effect', { act: 'none', time: 'now' }, () => `lagi banyak urusan di ${place(1)}`);
add('id.ref.7', 1, 'effect', { act: 'none', time: 'now' }, () => `masih mikir apakah ${task(1)} worth it`);
add('id.ref.8', 1, 'effect', { act: 'none', time: 'past' }, () => `hari yang sepi, nggak ada yang spesial`);
add('id.ref.9', 1, 'effect', { act: 'none', time: 'now' }, () => `${task(1)} kepikiran lagi`);

/* ---------------- sentences ---------------- */

const BECAUSE = [
  [' because ', ' since ', ' due to the fact that '],
  [' karena ', ' gara-gara ', ' soalnya '],
] as const;
const SO = [
  [', so ', ', which is why ', ' and that is why '],
  [', jadi ', ', makanya ', ' sehingga '],
] as const;
/** "…so I can…", "…biar…": what a choice or an act was for, which explains it too. */
const FOR = [
  [' so I can ', ' so that ', ' to make sure '],
  [' biar ', ' supaya ', ' agar '],
] as const;
const PURPOSE = [
  ['keep my mornings free', 'pagi tetap kosong'],
  ['have time for the film', 'ada waktu buat film'],
  ['rest properly this weekend', 'bisa istirahat akhir pekan ini'],
  ['save a bit more', 'bisa nabung lebih banyak'],
  ['focus on one thing', 'bisa fokus ke satu hal'],
] as const;
const AND = [
  [' and ', ', then ', ' and also '],
  [' dan ', ', terus ', ', lalu '],
] as const;
const ACT_RANK = { decided: 4, done: 3, planned: 2, happened: 1, none: 0 } as const;

function merge(a: Part, b: Part, cause: boolean): Labels {
  const acts = [a.act, b.act].filter(Boolean) as Labels['act'][];
  const act = acts.sort((x, y) => ACT_RANK[y] - ACT_RANK[x])[0] ?? 'none';
  const times = [a.time, b.time].filter(Boolean);
  const time = times.includes('future') ? 'future' : times.includes('past') ? 'past' : 'now';
  return {
    act,
    direction: a.direction ?? b.direction ?? 'none',
    cause: cause ? 'yes' : 'no',
    time,
    mood: a.mood ?? b.mood ?? 'neutral',
  };
}
const single = (c: Clause): Labels => merge(c.labels, {}, false);

/** The way people type: lower case, no full stop, informal spellings. */
function roughen(text: string, lang: L): string {
  let s = text.replace(/\s+/g, ' ').trim();
  if (lang === 1 && chance(0.4))
    s = s
      .replace(/\bsudah\b/g, pick(['udah', 'sdh', 'sudah']))
      .replace(/\btidak\b/g, pick(['gak', 'nggak', 'tdk']))
      .replace(/\bbanget\b/g, pick(['bgt', 'banget', 'bngt']));
  s = chance(0.25) ? s.toLowerCase() : cap(s);
  return chance(0.3) ? s : `${s}${pick(['.', '.', '.', '!'])}`;
}

function sentence(pool: Template[]): Example {
  const lang = pick([0, 1] as const);
  const mine = pool.filter((t) => t.lang === lang);
  const shape = rand();
  let text: string;
  let labels: Labels;
  let templates: string[];
  if (shape < 0.6) {
    const t = pick(mine);
    const c = t.make();
    text = c.text;
    labels = single(c);
    templates = [t.id];
  } else if (shape < 0.8) {
    // An effect, and what caused it: "… because …" or "…, so …".
    const effect = pick(mine.filter((t) => t.make().role !== 'cause'));
    const cause = pick(mine.filter((t) => t.make().role !== 'effect' && t.id !== effect.id));
    const e = effect.make();
    const c = cause.make();
    text = chance(0.6)
      ? `${e.text}${pick(BECAUSE[lang])}${c.text.charAt(0).toLowerCase()}${c.text.slice(1)}`
      : `${c.text}${pick(SO[lang])}${e.text.charAt(0).toLowerCase()}${e.text.slice(1)}`;
    labels = merge(e.labels, c.labels, true);
    templates = [effect.id, cause.id];
  } else if (shape < 0.92) {
    // A choice or an act, and what it was for.
    const act = pick(mine.filter((t) => /\.(dec|done|hap|plan)\./.test(t.id)));
    const c = act.make();
    text = `${c.text}${pick(FOR[lang])}${pick(PURPOSE)[lang]}`;
    labels = merge(c.labels, {}, true);
    templates = [act.id];
  } else {
    // Two things side by side, with no reason given.
    const a = pick(mine);
    const b = pick(mine.filter((t) => t.id !== a.id));
    const ca = a.make();
    const cb = b.make();
    text = `${ca.text}${pick(AND[lang])}${cb.text.charAt(0).toLowerCase()}${cb.text.slice(1)}`;
    labels = merge(ca.labels, cb.labels, false);
    templates = [a.id, b.id];
  }
  return { text: roughen(text, lang), labels, lang: lang ? 'id' : 'en', templates };
}

/* ---------------- splits ---------------- */

// A fifth of the templates of every kind are kept for testing only.
const kinds = new Map<string, Template[]>();
for (const t of T) {
  const kind = t.id.split('.').slice(0, 2).join('.');
  kinds.set(kind, [...(kinds.get(kind) ?? []), t]);
}
const heldOut = new Set<string>();
for (const list of kinds.values()) if (list.length >= 4) for (const t of list.slice(-Math.max(1, Math.round(list.length / 5)))) heldOut.add(t.id);
const trainPool = T.filter((t) => !heldOut.has(t.id));
const testPool = T.filter((t) => heldOut.has(t.id));

function generate(pool: Template[], n: number): Example[] {
  const seen = new Set<string>();
  const out: Example[] = [];
  for (let tries = 0; out.length < n && tries < n * 20; tries++) {
    const e = sentence(pool);
    const key = e.text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

const train = generate(trainPool, 9000);
// Test sentences use at least one held-out template; the rest of each may be any.
const test = generate([...testPool, ...testPool, ...trainPool.filter(() => chance(0.15))], 2400).filter((e) => e.templates!.some((id) => heldOut.has(id)));

const jsonl = (rows: Example[]) => rows.map((r) => JSON.stringify({ text: r.text, ...r.labels, lang: r.lang, templates: r.templates })).join('\n') + '\n';
writeFileSync(join(HERE, 'train.jsonl'), jsonl(train));
writeFileSync(join(HERE, 'test.jsonl'), jsonl(test));
// What the app ships, to train the heads on the device once the language model is there: a balanced sample, packed.
const sample = [...train].sort(() => rand() - 0.5).slice(0, 2400);
mkdirSync(join(ROOT, 'public', 'ml'), { recursive: true });
writeFileSync(join(ROOT, 'public', 'ml', 'sample.json'), JSON.stringify(sample.map(pack)));

const count = (rows: Example[], head: keyof Labels) =>
  Object.entries(rows.reduce<Record<string, number>>((m, r) => ((m[r.labels[head]] = (m[r.labels[head]] ?? 0) + 1), m), {}));
console.log(`templates ${T.length} (held out for testing ${heldOut.size})`);
console.log(`train ${train.length} · test ${test.length} · shipped sample ${sample.length}`);
for (const h of ['act', 'direction', 'cause', 'time', 'mood'] as const) console.log(h.padEnd(10), JSON.stringify(count(train, h)));
export type { Lang };
