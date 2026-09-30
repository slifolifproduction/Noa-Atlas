/**
 * Deterministic, transparent heuristics that stand in for a language model.
 *
 * Reading a note produces:
 * - observations: neutral descriptions of what it reports, with their basis;
 * - suggestions the person accepts or dismisses: elements it mentions, the
 *   life areas it touches, happenings to add to history, instances of a
 *   pattern, and explanations written in the note itself (which are the
 *   person's hypotheses, not evidence of the cause).
 *
 * Nothing here produces a number standing in for certainty. Every output
 * carries its basis (the phrases or metadata that triggered it). The Claude
 * provider returns the same shapes; this module is also the offline fallback.
 */
import { claimSentence, claimStatus } from '../domain/claims';
import { linksFromWords } from '../domain/learning';
import { OUTCOME_RATING_LABEL } from '../domain/constants';
import { decisionCode, decisionHorizon, displayNode, mapElements, patternCode, patternLive, sortedDecisions } from '../domain/selectors';
import type {
  AnalysisSuggestion,
  AreaKey,
  AtlasData,
  AtlasNode,
  Claim,
  Decision,
  Entry,
  EntryAnalysis,
  Experiment,
  ExperimentResult,
  FactorReading,
  ISODateTime,
  NavigationPlan,
  Observation,
  OccurrenceKind,
  StrategicPath,
} from '../domain/types';
import { addDays, todayISO, weekStart } from '../lib/dates';
import { createId } from '../lib/ids';
import { excerpt as firstSentence, sentenceContaining } from '../lib/text';
import type { ExperimentDraft, ModelUpdateProposal, PatternCandidate } from './types';
import { t, tn } from '../i18n';

export const LOCAL_PROVIDER_LABEL = 'Local heuristics';

const norm = (s: string) => s.toLowerCase().replace(/[’‘]/g, "'").replace(/[“”]/g, '"');

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Word-boundary phrase match. */
function has(text: string, phrase: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(norm(phrase))}([^a-z0-9]|$)`).test(text);
}

const quote = (s: string) => `“${s}”`;

/* ------------------------------------------------------------ life areas */

const AREA_LEXICON: Record<AreaKey, string[]> = {
  self: [
    'identity',
    'who i am',
    'author',
    'myself',
    'director',
    'the kind of person',
    'value',
    'values',
    'autonomy',
    'craft',
    'integrity',
    'matters most',
    'principle',
    'identitas',
    'siapa saya',
    'diri saya',
    'jati diri',
    'nilai',
    'prinsip',
    'kebebasan',
    'integritas',
    'paling penting',
  ],
  work: [
    'career',
    'client',
    'clients',
    'role',
    'job',
    'offer',
    'portfolio',
    'festival',
    'panel',
    'promotion',
    'retainer',
    'karier',
    'karir',
    'klien',
    'pekerjaan',
    'kerjaan',
    'atasan',
    'promosi',
    'jabatan',
    'tawaran',
    'portofolio',
    'wawancara',
  ],
  projects: [
    'project',
    'projects',
    'night ferry',
    'podcast',
    'video',
    'animatic',
    'workshop',
    'deadline',
    'deliverable',
    'edit',
    'goal',
    'milestone',
    'proyek',
    'projek',
    'tenggat',
    'garapan',
    'tujuan',
    'target',
  ],
  money: [
    'money',
    'runway',
    'income',
    'rate',
    'invoice',
    'budget',
    'salary',
    'unpaid',
    'fee',
    'savings',
    'rent',
    'uang',
    'gaji',
    'tabungan',
    'biaya',
    'pengeluaran',
    'penghasilan',
    'pendapatan',
    'utang',
    'cicilan',
    'tagihan',
    'honor',
    'sewa',
    'anggaran',
  ],
  people: [
    'partner',
    'friend',
    'mentor',
    'collaborator',
    'family',
    'sam',
    'juna',
    'ruth',
    'marta',
    'teo',
    'pasangan',
    'teman',
    'sahabat',
    'keluarga',
    'orang tua',
    'rekan',
    'istri',
    'suami',
    'pacar',
    'anak',
    'ibu',
    'ayah',
  ],
  health: [
    'energy',
    'tired',
    'exhausted',
    'burnout',
    'sleep',
    'slept',
    'running',
    'exercise',
    'sick',
    'stress',
    'rest',
    'flat days',
    'all-nighter',
    'all-nighters',
    'energi',
    'lelah',
    'capek',
    'tidur',
    'olahraga',
    'lari',
    'sakit',
    'stres',
    'istirahat',
    'begadang',
  ],
  place: [
    'studio',
    'flat',
    'afternoon',
    'afternoons',
    'calls',
    'noise',
    'desk',
    'home',
    'office',
    'commute',
    'morning',
    'mornings',
    'review',
    'schedule',
    'routine',
    'rumah',
    'kantor',
    'kamar',
    'suasana',
    'lingkungan',
    'bising',
    'macet',
    'perjalanan',
    'kos',
    'siang',
    'pagi',
    'jadwal',
    'rutinitas',
  ],
  growth: [
    'skill',
    'skills',
    'learn',
    'learning',
    'practice',
    'technique',
    'layout pass',
    'course',
    'keterampilan',
    'keahlian',
    'belajar',
    'latihan',
    'kursus',
    'teknik',
    'sertifikasi',
  ],
};

/* ------------------------------------------------------------ observations */

interface ObservationRule {
  statement: string;
  test: (text: string, entry: Entry) => string[] | null;
  /** A happening this kind of sentence usually reports, for history. `reads` finds the behaviour it is an instance of. */
  occurrence?: { kind: OccurrenceKind; reads?: string };
}

/** Phrases preceded by these words describe something that did not happen. */
const NEGATIONS = ['not', 'never', "wasn't", "didn't", 'supposed to be', 'success means:', 'tidak', 'belum', 'bukan', 'tak', 'gagal'];

function affirmed(text: string, phrase: string): boolean {
  if (!has(text, phrase)) return false;
  return !NEGATIONS.some((n) => has(text, `${n} ${phrase}`));
}

function phraseRule(statement: string, phrases: string[], occurrence?: ObservationRule['occurrence']): ObservationRule {
  return {
    statement,
    occurrence,
    test: (text) => {
      const hits = phrases.filter((p) => affirmed(text, p));
      return hits.length ? hits : null;
    },
  };
}

const OBSERVATION_RULES: ObservationRule[] = [
  phraseRule(
    'Describes accepting a new commitment.',
    [
      'said yes',
      'agreed to',
      'took on',
      'signed on',
      'committing to',
      'bilang iya',
      'bilang ya',
      'setuju untuk',
      'mengiyakan',
      'menerima tawaran',
      'ambil proyek',
      'mengambil proyek',
      'menyanggupi',
    ],
    { kind: 'action', reads: 'accept' },
  ),
  phraseRule(
    'Describes declining, pausing or limiting a commitment.',
    ['declined', 'said no', 'turned down', 'paused', 'commitment cap', 'down to three', 'menolak', 'bilang tidak', 'menunda', 'membatasi'],
    { kind: 'action', reads: 'decline' },
  ),
  phraseRule(
    'Describes work compressed against a deadline.',
    [
      'last four days',
      'last minute',
      'all-nighters',
      'all-nighter',
      'minutes before',
      'deadline',
      'deadlines',
      'tenggat',
      'mepet',
      'kejar deadline',
      'menit terakhir',
      'lembur',
    ],
    { kind: 'action', reads: 'deadline' },
  ),
  phraseRule(
    'Describes a protected or single-focus work period.',
    [
      'deep work',
      'protected',
      'only project',
      'mornings only',
      'phone in another room',
      'one project per block',
      'thursday blocks',
      'fokus penuh',
      'tanpa gangguan',
      'satu proyek saja',
    ],
    { kind: 'action', reads: 'focus' },
  ),
  phraseRule('Reports something finished.', ['finished', 'shipped', 'locked', 'submitted', 'wrapped', 'selesai', 'rampung', 'beres', 'terkirim', 'tuntas'], {
    kind: 'event',
  }),
  phraseRule(
    'Reports work slipping or stalling.',
    [
      'slipping',
      'slipped',
      'jumps ahead',
      'stalled',
      "haven't opened",
      'lost six weeks',
      'eating',
      'tertunda',
      'molor',
      'terbengkalai',
      'mandek',
      'keteteran',
      'belum sempat',
    ],
    { kind: 'event' },
  ),
  phraseRule('Describes fragmented or interrupted time.', [
    'calls',
    'interrupted',
    'fragmented',
    'inbox',
    'meetings',
    'telepon',
    'rapat',
    'meeting',
    'terganggu',
    'terpecah',
    'notifikasi',
  ]),
  phraseRule(
    'Describes changing or expanding scope.',
    ['added a second', 'rewrote', 'added scope', 'expanded', 'bigger version', 'melebar', 'menambah lingkup', 'versi lebih besar'],
    { kind: 'action', reads: 'scope' },
  ),
  phraseRule('Describes a deliberate, intentional choice.', ['deliberately', 'on purpose', 'intentionally', 'sengaja', 'secara sadar']),
  phraseRule('Records a question that was hard to answer.', [
    "couldn't answer",
    "don't know how",
    'asked what',
    'tidak bisa menjawab',
    'tidak tahu harus',
    'bingung',
  ]),
  phraseRule('References financial conditions.', [
    'runway',
    'income',
    'day rate',
    'salary',
    'unpaid',
    'money',
    'fee',
    'uang',
    'gaji',
    'tabungan',
    'penghasilan',
    'biaya',
    'honor',
    'tagihan',
  ]),
  {
    statement: 'States a count of active commitments.',
    test: (text) => {
      const m =
        text.match(/\b(two|three|four|five|six|seven|\d+) active (things|projects|commitments)\b/) ??
        text.match(/\b(dua|tiga|empat|lima|enam|tujuh|\d+) (proyek|komitmen|kerjaan) aktif\b/);
      return m ? [m[0]] : null;
    },
  },
];

/**
 * Words that mark an explanation written into the note itself ("…because…",
 * "…caught up with me"). An explanation in the person's words is their
 * hypothesis about a cause; people often explain their own behaviour with
 * reasons that did not actually drive it, so it is never counted as evidence.
 */
const ATTRIBUTION_CUES = [
  'because',
  'caught up with me',
  'made it',
  'led to',
  'due to',
  "that's why",
  'as a result',
  'honest reason',
  'what decided it',
  'collecting its bill',
  'karena',
  'gara-gara',
  'sehingga',
  'akibatnya',
  'makanya',
  'membuat saya',
  'alasannya',
];

/**
 * What changed: words for a direction near an element's name. A mention alone
 * is never read as a change; only a sentence that says which way it went. A
 * sentence about the future is an expectation, never history.
 */
const CHANGE_CUES: { reads: FactorReading; phrases: string[] }[] = [
  {
    reads: 'down',
    phrases: [
      'dropped',
      'drop',
      'fell',
      'fall',
      'went down',
      'go down',
      'decreased',
      'decrease',
      'declined',
      'slipped',
      'stalled',
      'shrank',
      'turun',
      'menurun',
      'berkurang',
      'macet',
    ],
  },
  {
    reads: 'up',
    phrases: ['went up', 'go up', 'rose', 'rise', 'grew', 'grow', 'increased', 'increase', 'picked up', 'pick up', 'naik', 'meningkat', 'bertambah'],
  },
  { reads: 'low', phrases: ['was low', 'low', 'flat', 'drained', 'exhausted', 'depleted', 'rendah', 'lemas', 'lelah', 'capek'] },
  { reads: 'high', phrases: ['was high', 'high', 'full of', 'tinggi', 'penuh'] },
  { reads: 'absent', phrases: ['no', 'without', 'skipped', "didn't", 'did not', 'tidak ada', 'tanpa', 'belum', 'tidak'] },
];
/** Better or worse: which way that is depends on whether more of the element is better or worse. */
const VALENCE_CUES: { better: boolean; phrases: string[] }[] = [
  { better: false, phrases: ['got worse', 'worse', 'worsened', 'memburuk', 'makin parah'] },
  { better: true, phrases: ['got better', 'better', 'improved', 'improve', 'membaik'] },
];
const FUTURE_CUES = ['will', 'expect', 'going to', 'should', 'hope to', 'predict', 'akan', 'harusnya', 'semoga', 'berharap', 'diperkirakan'];
const withinDays = (text: string) =>
  has(text, 'tomorrow') || has(text, 'besok')
    ? 2
    : has(text, 'next week') || has(text, 'minggu depan')
      ? 7
      : has(text, 'this month') || has(text, 'bulan ini')
        ? 30
        : 28;

function readChanges(entry: Entry, elements: AtlasNode[]): AnalysisSuggestion[] {
  const out: AnalysisSuggestion[] = [];
  const factors = elements.filter((n) => n.kind === 'state' || n.kind === 'behaviour');
  const sentences = entry.content.split(/(?<=[.!?])\s+/).filter((x) => x.trim());
  const taken = new Set<string>();
  for (const sentence of sentences) {
    const text = norm(sentence);
    const future = FUTURE_CUES.some((c) => has(text, c));
    for (const { node, hit } of matchNodes(text, factors)) {
      if (taken.has(node.id)) continue;
      const at = text.indexOf(norm(hit));
      let best: { reads: FactorReading; cue: string; distance: number } | undefined;
      const consider = (reads: FactorReading, cue: string) => {
        if (!has(text, cue)) return;
        const distance = Math.abs(text.indexOf(norm(cue)) - at);
        if (!best || distance < best.distance) best = { reads, cue, distance };
      };
      for (const { reads, phrases } of CHANGE_CUES) {
        // Behaviours happen or not; states go up or down, or are high or low.
        if ((node.kind === 'behaviour') !== (reads === 'absent')) continue;
        for (const cue of phrases) consider(reads, cue);
      }
      if (node.kind === 'state') {
        const higherIsWorse = node.scale?.higherIs === 'worse';
        for (const { better, phrases } of VALENCE_CUES) for (const cue of phrases) consider(better !== higherIsWorse ? 'up' : 'down', cue);
      }
      if (!best || best.distance > 60) continue;
      taken.add(node.id);
      const reason = t('Matched {cue} near {name}.', { cue: quote(best.cue), name: quote(hit) });
      if (future)
        out.push({
          id: createId('sug'),
          type: 'expectation',
          factor: node.id,
          reads: best.reads,
          within: withinDays(text),
          excerpt: sentence.trim(),
          reason,
          state: 'pending',
        });
      else out.push({ id: createId('sug'), type: 'change', factor: node.id, reads: best.reads, excerpt: sentence.trim(), reason, state: 'pending' });
    }
  }
  return [...out.filter((x) => x.type === 'change').slice(0, 4), ...out.filter((x) => x.type === 'expectation').slice(0, 2)];
}

function contextObservation(entry: Entry): Observation | null {
  const { energy, mood } = entry.context ?? {};
  if (energy === undefined || mood === undefined) return null;
  if (energy <= 2 && mood <= -1) {
    return { id: createId('obs'), statement: t('Logged with low energy and low mood.'), basis: t('Energy {e}/5, mood {m}', { e: energy, m: mood }) };
  }
  if (energy >= 4 && mood >= 1) {
    return { id: createId('obs'), statement: t('Logged with good energy and mood.'), basis: t('Energy {e}/5, mood {m}', { e: energy, m: `+${mood}` }) };
  }
  return null;
}

/* ------------------------------------------------------------ element matching */

/**
 * Elements mentioned in the text: full labels first, then distinctive
 * capitalised words (usually names) that no full match already explains.
 */
function matchNodes(text: string, nodes: AtlasNode[]): { node: AtlasNode; hit: string }[] {
  const full = nodes
    .filter((n) => n.label.length >= 3 && (n.label.length >= 4 || /^[A-Z]/.test(n.label)) && has(text, n.label))
    .map((node) => ({ node, hit: node.label }));
  const covered = full.map((f) => norm(f.hit));
  const partial: { node: AtlasNode; hit: string }[] = [];
  for (const node of nodes) {
    if (full.some((f) => f.node.id === node.id)) continue;
    const words = node.label.split(/\s+/);
    for (const [i, raw] of words.entries()) {
      const word = raw.replace(/[^A-Za-z-]/g, '');
      if (!/^[A-Z][a-z]{2,}/.test(word)) continue;
      // Sentence-initial short words are rarely names ("Ship", "Home").
      if (i === 0 && words.length > 1 && word.length < 6) continue;
      if (COMMON_CAPITALISED.has(word.toLowerCase())) continue;
      if (covered.some((c) => has(c, word))) continue;
      if (has(text, word)) {
        partial.push({ node, hit: word });
        break;
      }
    }
  }
  return [...full, ...partial];
}

const COMMON_CAPITALISED = new Set(
  'what which would saying good being build building missing financial freedom recognition clients client morning sunday running home afternoons afternoon income runway creative independent emerging real-time motion production business ship agency accepted paused declined committed burnout protected stability autonomy craft depth compounding barbell optionality working festival night two-track active incoming energy feeling fragmented quality outside adding late keep focus commitment declining'.split(
    ' ',
  ),
);

/** A short label for a happening, in the note's own words. */
function shortLabel(sentence: string, max = 72): string {
  const s = sentence.replace(/\s+/g, ' ').trim().replace(/[.!]$/, '');
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : max).trimEnd()}…`;
}

/* ------------------------------------------------------------ reading a note */

export function analyzeEntryLocally(entry: Entry, data: AtlasData, at: ISODateTime = new Date().toISOString()): EntryAnalysis {
  const text = norm(`${entry.title}. ${entry.content}`);
  const observations: Observation[] = [];
  const suggestions: AnalysisSuggestion[] = [];
  const elements = mapElements(data);

  const matchedRules: { rule: ObservationRule; hits: string[] }[] = [];
  for (const rule of OBSERVATION_RULES) {
    const hits = rule.test(text, entry);
    if (!hits) continue;
    matchedRules.push({ rule, hits });
    observations.push({ id: createId('obs'), statement: t(rule.statement), basis: t('Matched {list}', { list: hits.slice(0, 3).map(quote).join(', ') }) });
  }
  const ctx = contextObservation(entry);
  if (ctx) observations.push(ctx);

  // Several commitments named in one note are a structural signal on their own.
  const mentioned = matchNodes(text, elements);
  const commitmentHits = mentioned.filter((m) => m.node.kind === 'commitment').map((m) => m.node.label);
  if (commitmentHits.length >= 2) {
    observations.push({
      id: createId('obs'),
      statement: t('Mentions {n} commitments in the same note.', { n: commitmentHits.length }),
      basis: commitmentHits.join(', '),
    });
  }

  // Happenings to add to history, in the note's own words.
  const fromThisNote = Object.values(data.occurrences).filter((o) => o.source?.kind === 'entry' && o.source.id === entry.id);
  let occurrenceCount = 0;
  for (const { rule, hits } of matchedRules) {
    if (!rule.occurrence || occurrenceCount >= 3) continue;
    const sentence = sentenceContaining(entry.content, hits[0]) ?? firstSentence(entry.content);
    const behaviour = rule.occurrence.reads ? elements.find((n) => n.kind === 'behaviour' && n.tags.includes(`reads:${rule.occurrence!.reads}`)) : undefined;
    const about = matchNodes(norm(sentence), elements)
      .map((m) => m.node.id)
      .filter((id) => id !== behaviour?.id)
      .slice(0, 4);
    const recorded = fromThisNote.some((o) => o.kind === rule.occurrence!.kind && (!behaviour || o.instanceOf === behaviour.id));
    occurrenceCount++;
    suggestions.push({
      id: createId('sug'),
      type: 'occurrence',
      kind: rule.occurrence.kind,
      label: shortLabel(sentence),
      about,
      instanceOf: behaviour?.id,
      excerpt: sentence,
      reason: behaviour ? t('{what}: one instance of “{behaviour}”.', { what: t(rule.statement), behaviour: behaviour.label }) : t(rule.statement),
      state: recorded ? 'accepted' : 'pending',
    });
  }

  // Explanations written into the note: the person's own hypotheses.
  const raw = norm(entry.content);
  const cues = ATTRIBUTION_CUES.filter((c) => has(raw, c));
  const seen = new Set<string>();
  for (const cue of cues) {
    const sentence = sentenceContaining(entry.content, cue);
    if (!sentence || seen.has(sentence)) continue;
    seen.add(sentence);
    if (seen.size > 2) break;
    suggestions.push({
      id: createId('sug'),
      type: 'attribution',
      excerpt: sentence,
      reason: t('Explains something in your own words ({cue}). That is your hypothesis about a cause, not evidence of it.', { cue: quote(cue) }),
      state: 'pending',
    });
  }

  // What changed, and what the note expects: only where a sentence says which way.
  suggestions.push(...readChanges(entry, elements));

  // Instances of a pattern: cue phrases for and against each live pattern.
  for (const p of Object.values(data.patterns)) {
    if (!patternLive(p)) continue;
    const sup = p.cues.supports.filter((c) => has(text, c));
    const cnt = p.cues.counters.filter((c) => has(text, c));
    if (sup.length === cnt.length) continue;
    const stance = sup.length > cnt.length ? 'supports' : 'counters';
    const matched = stance === 'supports' ? sup : cnt;
    const already = p.evidence.some((e) => e.source.kind === 'entry' && e.source.id === entry.id);
    suggestions.push({
      id: createId('sug'),
      type: 'pattern_evidence',
      patternId: p.id,
      stance,
      matched,
      excerpt: sentenceContaining(entry.content, matched[0]) ?? firstSentence(entry.content),
      reason: t(stance === 'supports' ? 'Matched {list}: cues for {code}.' : 'Matched {list}: cues against {code}.', {
        list: matched.map(quote).join(', '),
        code: patternCode(p.code),
      }),
      state: already ? 'accepted' : 'pending',
    });
  }

  // Elements the note mentions.
  for (const { node, hit } of mentioned.slice(0, 6)) {
    suggestions.push({
      id: createId('sug'),
      type: 'link_node',
      nodeId: node.id,
      reason: t('Mentions {what}.', { what: quote(hit) }),
      state: entry.nodeIds.includes(node.id) ? 'accepted' : 'pending',
    });
  }

  // Elements this note may be about in the person's own words: what they linked notes using these words to before.
  for (const { nodeId, words } of linksFromWords(data, entry)) {
    if (mentioned.some((m) => m.node.id === nodeId) || !data.nodes[nodeId]) continue;
    const w = words[0];
    suggestions.push({
      id: createId('sug'),
      type: 'link_node',
      nodeId,
      reason: tn(w.notes, 'You linked a note that uses “{word}” to this before.', 'You linked {n} notes that use “{word}” to this before.', { word: w.word }),
      state: 'pending',
    });
  }

  // Life areas.
  const scored = (Object.keys(AREA_LEXICON) as AreaKey[])
    .map((key) => ({ key, hits: AREA_LEXICON[key].filter((w) => has(text, w)) }))
    .filter((d) => d.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, 3);
  for (const d of scored) {
    suggestions.push({
      id: createId('sug'),
      type: 'area',
      area: d.key,
      reason: t('Matched {list}.', { list: d.hits.slice(0, 3).map(quote).join(', ') }),
      state: entry.areas.includes(d.key) ? 'accepted' : 'pending',
    });
  }

  return { generatedAt: at, provider: LOCAL_PROVIDER_LABEL, observations: observations.slice(0, 5), suggestions };
}

/* ------------------------------------------------------------ decision patterns */

function driverExcerpt(d: Decision): string {
  const drivers = d.optimizingFor.length
    ? ` ${t('Optimising for {drivers}.', {
        drivers: d.optimizingFor
          .map((x) => t(x))
          .join(', ')
          .toLowerCase(),
      })}`
    : '';
  return `${d.chosenAction}${drivers}`;
}

const codes = (ds: Decision[]) => ds.map((d) => decisionCode(d.seq)).join(', ');

/**
 * Regularities across the decision log, from the reasons the person gave and
 * how decisions turned out. Offered as candidates with their instances and
 * counter-cases; a possible explanation comes as a question, not a finding.
 */
export function detectDecisionPatternsLocally(data: AtlasData): PatternCandidate[] {
  const decisions = sortedDecisions(data).reverse();
  const bySignature = new Map(
    Object.values(data.patterns)
      .filter((p) => p.signature)
      .map((p) => [p.signature!, p.id]),
  );
  const out: PatternCandidate[] = [];

  const immediate = decisions.filter((d) => decisionHorizon(d) === 'immediate');
  const longTerm = decisions.filter((d) => decisionHorizon(d) === 'long_term');

  if (immediate.length >= 3 && immediate.length > longTerm.length) {
    const signature = 'decision:immediate-over-long-term';
    out.push({
      signature,
      kind: 'decision',
      title: t('Immediate opportunity over long-term focus'),
      steps: [t('Immediate Opportunity'), t('Accept'), t('Long-term Focus Deferred')],
      statement: t('I tend to optimize for immediate opportunity rather than long-term focus.'),
      observation: t(
        'In {n} of {total} decisions with a clear time horizon, the chosen option optimised for income, opportunity or visibility over focus, craft or long-term growth.',
        { n: immediate.length, total: immediate.length + longTerm.length },
      ),
      triggers: [t('A direct offer with a short response window'), t('Income or visibility on the table')],
      behaviors: [t('Chooses the option with the nearest payoff')],
      consequences: [t('Long-horizon work is deferred')],
      supporting: immediate.map((d) => ({ decisionId: d.id, excerpt: driverExcerpt(d) })),
      counter: longTerm.map((d) => ({ decisionId: d.id, excerpt: driverExcerpt(d) })),
      explanation: t('Could near-term payoffs weigh more than the long-term priorities you state?'),
      counterStatement: longTerm.length ? t('{codes} chose long-term focus over an immediate gain.', { codes: codes(longTerm) }) : undefined,
      implication: t('Opportunities that arrive with a short response window may be the ones to slow down.'),
      areas: ['work', 'projects'],
      existingPatternId: bySignature.get(signature),
    });
  }

  const rated = immediate.filter((d) => d.outcomeRating);
  const short = rated.filter((d) => d.outcomeRating === 'worse' || d.outcomeRating === 'mixed');
  const fine = rated.filter((d) => d.outcomeRating === 'better' || d.outcomeRating === 'as_expected');
  if (short.length >= 3 && short.length > fine.length) {
    const signature = 'decision:opportunity-cost-underestimated';
    out.push({
      signature,
      kind: 'decision',
      title: t('Underestimated cost of new commitments'),
      steps: [t('Opportunity Accepted'), t('Cost Underestimated'), t('Outcome Below Expectation')],
      statement: t('Opportunity-driven commitments tend to cost more time than I expect.'),
      observation: t('{n} of {total} reviewed opportunity-driven decisions turned out worse than or mixed against what was expected.', {
        n: short.length,
        total: rated.length,
      }),
      triggers: [t('Estimating a new commitment in isolation')],
      behaviors: [t('Scopes the new commitment without the existing load')],
      consequences: [t('Overruns that land on existing work')],
      supporting: short.map((d) => ({ decisionId: d.id, excerpt: `${OUTCOME_RATING_LABEL[d.outcomeRating!]}: ${d.actualOutcome ?? ''}`.trim() })),
      counter: fine.map((d) => ({ decisionId: d.id, excerpt: `${OUTCOME_RATING_LABEL[d.outcomeRating!]}: ${d.actualOutcome ?? ''}`.trim() })),
      explanation: t('Could estimates be made against an empty calendar rather than the real one?'),
      counterStatement: fine.length ? t('{codes} went as expected or better.', { codes: codes(fine) }) : undefined,
      implication: t('Doubling the first estimate, or estimating against the current week, could be tested.'),
      areas: ['projects', 'work'],
      existingPatternId: bySignature.get(signature),
    });
  }
  return out;
}

/* ------------------------------------------------------------ tests */

const labelOf = (data: AtlasData, id: string) => displayNode(data, id)?.label ?? '';
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Two ways to test a claim: change the cause on purpose, or look for contrast cases. */
export function proposeExperimentsLocally(claim: Claim, data: AtlasData): ExperimentDraft[] {
  const from = labelOf(data, claim.from);
  const to = labelOf(data, claim.to);
  return [
    {
      title: t('Change “{from}” on purpose', { from }),
      hypothesis: claimSentence(data, claim, 'proposed'),
      design: t('For 30 days, change “{from}” deliberately and keep everything else as it was. Keep recording “{to}” as usual.', {
        from: lower(from),
        to: lower(to),
      }),
      durationDays: 30,
      prediction: t('If the claim holds, “{to}” changes in the direction it predicts within the 30 days.', { to: lower(to) }),
      criteria: t('If “{to}” does not change, the claim is weakened.', { to: lower(to) }),
      measures: [
        { label: from, baseline: '—' },
        { label: to, baseline: '—' },
      ],
    },
    {
      title: t('Look for contrast cases: {to}', { to }),
      hypothesis: t('“{to}” also changes when “{from}” does not.', { to, from: lower(from) }),
      design: t(
        'For 14 days, note each time “{to}” changes and whether “{from}” changed first. This looks for other causes rather than trying to change anything.',
        {
          to: lower(to),
          from: lower(from),
        },
      ),
      durationDays: 14,
      prediction: t('If the claim holds, most changes in “{to}” follow a change in “{from}”.', { to: lower(to), from: lower(from) }),
      criteria: t('If “{to}” changes as often without it, another explanation is likely.', { to: lower(to) }),
      measures: [{ label: t('Changes in “{to}” after “{from}”', { to, from }) }, { label: t('Changes in “{to}” without it', { to }) }],
    },
  ];
}

/**
 * A test's result becomes intervention evidence on the claim it tests: the
 * strongest evidence one person can produce. An inconclusive result changes
 * nothing.
 */
export function evaluateExperimentLocally(experiment: Experiment, result: ExperimentResult, data: AtlasData): ModelUpdateProposal {
  const claim = experiment.claimId ? data.claims[experiment.claimId] : undefined;
  const changes =
    claim && result.outcome !== 'inconclusive'
      ? (() => {
          const stance = result.outcome === 'supports' ? ('supports' as const) : ('counters' as const);
          // The status after is read exactly as the store will read it: the same claim with the test added.
          const after = claimStatus(data, {
            ...claim,
            evidence: [
              ...claim.evidence,
              { id: 'preview', source: { kind: 'experiment', id: experiment.id }, stance, kind: 'intervention', excerpt: '', addedBy: 'user', addedAt: '' },
            ],
          });
          return [
            {
              claimId: claim.id,
              stance,
              before: claimStatus(data, claim),
              after,
              excerpt:
                result.summary ||
                t(result.outcome === 'supports' ? '{title}: hypothesis supported.' : '{title}: hypothesis not supported.', { title: experiment.title }),
            },
          ];
        })()
      : [];

  const note =
    result.outcome === 'inconclusive'
      ? t('An inconclusive result changes no claim. Consider tightening the measures and running it again.')
      : t(
          result.outcome === 'supports'
            ? 'The prediction held. The claim gets a test result as evidence: the strongest kind one person can produce.'
            : 'The prediction did not hold. The claim gets a failed test as evidence, which weakens it.',
        );

  return { experimentId: experiment.id, changes, learningNote: note };
}

/* ------------------------------------------------------------ navigation */

export function draftNavigationPlanLocally(path: StrategicPath, data: AtlasData, today = todayISO()): NavigationPlan {
  const experiments = path.experimentIds.map((id) => data.experiments[id]).filter(Boolean);
  const strategic =
    experiments.find((x) => x.status === 'running' && x.durationDays >= 60) ?? experiments.find((x) => x.status !== 'completed' && x.status !== 'abandoned');
  const targets = path.requirements.slice(0, 3).map((title, i) => ({ id: createId('tgt'), title, due: addDays(today, 30), done: false, _i: i }));
  const week = weekStart(today);
  const actions = targets.map((target) => ({
    id: createId('act'),
    title: t('First concrete step toward: {target}', { target: `${target.title.charAt(0).toLowerCase()}${target.title.slice(1)}` }),
    targetId: target.id,
    week,
    status: 'todo' as const,
  }));
  return {
    pathId: path.id,
    committedAt: today,
    position: data.currentState.position,
    objective: { title: path.objective, description: path.summary, targetDate: addDays(today, 365) },
    experimentId: strategic?.id,
    milestone: { title: path.requirements[0] ?? t('First milestone'), due: addDays(today, 60) },
    targets: targets.map(({ _i, ...rest }) => rest),
    actions,
    currentActionId: actions[0]?.id,
  };
}
