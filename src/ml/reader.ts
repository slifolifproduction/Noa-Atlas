/**
 * What the local AI adds to reading a note (engine.ts reads; this decides what it means for the atlas).
 *
 * It starts from what the rules already read (ai/localAnalysis.ts) and adds what they cannot see:
 *
 *   by meaning     elements the note is about though it never names them, another time a repeat happened in
 *                  other words, a step finished though the note says it differently from the step's title, what
 *                  went up or down and what is expected, matched to the element it is about
 *                  (only with the language model, which reads meaning)
 *   by reading     a sentence that makes a choice, a sentence that explains a cause, how the person says they feel
 *                  (with either model)
 *
 * Every sentence's reading is kept with the note (shown in its panel, where it can be corrected), and nothing the
 * rules found is changed or removed. What it adds goes through the same weave as everything else: taken on its
 * own when it only says what the note says, offered when it is a reading, and every part can be taken back,
 * which teaches it (see engine.ts and the store's ml memory).
 */
import { mapElements, patternLive, patternTitle } from '../domain/selectors';
import { allWork } from '../domain/quests';
import type { AnalysisSuggestion, AtlasData, Entry, EntryAnalysis, FactorReading, ID, Observation, SentenceReading } from '../domain/types';
import { createId } from '../lib/ids';
import { t } from '../i18n';
import { canCompare, cosine, elementText, embed, mean, readSentences, useLocalAI, type Correction } from './engine';
import { sentencesOf } from './tasks';

/** How sure a head must be for its answer to be acted on. */
const SURE = 0.6;
/** How close in meaning a sentence must be to a step's title, at least, to read the step as finished. */
const FINISHED_FLOOR = 0.6;
/** Elements linked by meaning to one note, at most. */
const MOST_LINKS = 3;
const quote = (s: string) => `“${s}”`;

export const LOCAL_AI_LABEL = 'Local AI';

export async function readWithAI(entry: Entry, data: AtlasData, base: EntryAnalysis): Promise<EntryAnalysis> {
  const sentences = sentencesOf(entry.content);
  if (!sentences.length) return base;
  const corrections = (data.learning?.ml?.corrections ?? []) as Correction[];
  const readings = await readSentences(sentences, corrections);
  const suggestions = [...base.suggestions];
  const observations: Observation[] = [...base.observations];
  const hints: NonNullable<EntryAnalysis['hints']> = {};
  const sure = (r: (typeof readings)[number], head: keyof SentenceReading['labels']) => r.sure[head] >= SURE;

  // A choice made, in a sentence the rules did not read as one.
  const choice = readings.find((r) => r.labels.act === 'decided' && sure(r, 'act'));
  if (choice) hints.decided = choice.text;

  // Explanations the rules missed: offered, never taken, as every explanation is.
  const explained = new Set(suggestions.filter((s) => s.type === 'attribution').map((s) => (s.type === 'attribution' ? s.excerpt : '')));
  for (const r of readings)
    if (r.labels.cause === 'yes' && sure(r, 'cause') && ![...explained].some((x) => x.includes(r.text) || r.text.includes(x)))
      suggestions.push({
        id: createId('sug'),
        type: 'attribution',
        excerpt: r.text,
        reason: t('Reads as an explanation in your own words. That is your hypothesis about a cause, not evidence of it.'),
        state: 'pending',
      });

  // How the note sounds: said, never inferred from anything else.
  const low = readings.filter((r) => r.labels.mood === 'low' && sure(r, 'mood'));
  const high = readings.filter((r) => r.labels.mood === 'high' && sure(r, 'mood'));
  if (low.length > high.length) observations.push({ id: createId('obs'), statement: t('Sounds low.'), basis: low.map((r) => quote(r.text)).join(' ') });
  else if (high.length > low.length) observations.push({ id: createId('obs'), statement: t('Sounds good.'), basis: high.map((r) => quote(r.text)).join(' ') });

  if (canCompare()) await byMeaning(entry, data, readings, suggestions, hints);

  return {
    ...base,
    provider: LOCAL_AI_LABEL,
    suggestions,
    observations: observations.slice(0, 6),
    readings: readings.map(({ text, labels, sure, by, taught }) => ({ text, labels, sure, by, ...(taught ? { taught } : {}) })),
    hints,
  };
}

/** What only the language model can find: what a note is about, by what it means. */
async function byMeaning(
  entry: Entry,
  data: AtlasData,
  readings: Awaited<ReturnType<typeof readSentences>>,
  suggestions: AnalysisSuggestion[],
  hints: NonNullable<EntryAnalysis['hints']>,
) {
  const threshold = useLocalAI.getState().threshold;
  const sentences = readings.map((r) => r.text);
  const sv = await embed(sentences);
  const best = (v: Float32Array) => sv.reduce((b, s, i) => (cosine(s, v) > b.s ? { s: cosine(s, v), i } : b), { s: -1, i: 0 });
  const learned = data.learning?.ml?.links ?? {};

  // Elements: by their name and summary, and by the sentences you linked to them before; never one you took back.
  const elements = mapElements(data);
  const ev = await embed(elements.map((n) => elementText(n.label, n.summary)));
  const linked = new Set([...entry.nodeIds, ...suggestions.flatMap((s) => (s.type === 'link_node' ? [s.nodeId] : []))]);
  const found: { id: ID; s: number; i: number }[] = [];
  for (const [k, n] of elements.entries()) {
    if (linked.has(n.id)) continue;
    let hit = best(ev[k]);
    const yes = learned[n.id]?.yes ?? [];
    if (yes.length) {
      const proto = mean(await embed(yes));
      const h = best(proto);
      if (h.s > hit.s) hit = h;
    }
    const no = learned[n.id]?.no ?? [];
    if (no.length) {
      const near = Math.max(...(await embed(no)).map((v) => cosine(v, sv[hit.i])));
      if (near >= hit.s) continue;
    }
    if (hit.s >= threshold) found.push({ id: n.id, ...hit });
  }
  for (const f of found.sort((a, b) => b.s - a.s).slice(0, MOST_LINKS))
    suggestions.push({
      id: createId('sug'),
      type: 'link_node',
      nodeId: f.id,
      excerpt: sentences[f.i],
      reason: t('Close in meaning to {what}.', { what: quote(data.nodes[f.id].label) }),
      state: 'pending',
      inferred: true,
    });

  // Repeats: another time one happened, said in other words than its cues.
  const already = new Set(suggestions.flatMap((s) => (s.type === 'pattern_evidence' ? [s.patternId] : [])));
  for (const p of Object.values(data.patterns)) {
    if (!patternLive(p) || already.has(p.id) || p.evidence.some((e) => e.source.kind === 'entry' && e.source.id === entry.id)) continue;
    const said = [
      patternTitle(p),
      ...p.steps.map((s) => s.label),
      ...p.cues.supports,
      ...p.evidence.filter((e) => e.stance === 'supports').map((e) => e.excerpt),
    ].filter(Boolean);
    const hit = best(mean(await embed(said)));
    if (hit.s < threshold + 0.05) continue;
    suggestions.push({
      id: createId('sug'),
      type: 'pattern_evidence',
      patternId: p.id,
      stance: 'supports',
      matched: [],
      excerpt: sentences[hit.i],
      reason: t('Close in meaning to the times {what} happened.', { what: quote(patternTitle(p)) }),
      state: 'pending',
      inferred: true,
    });
  }

  // Steps finished: a sentence that reads as done, close in meaning to an open step's title.
  const { actions, targets } = allWork(data);
  const open = [...actions.filter((a) => a.status === 'todo'), ...targets.filter((x) => !x.done)];
  const done = readings.map((r, i) => ({ r, i })).filter(({ r }) => r.labels.act === 'done' && r.sure.act >= SURE);
  if (open.length && done.length) {
    const tv = await embed(open.map((o) => o.title));
    // Ticking a step off changes your plan, so only when it is plainly that one: very close in meaning, and clearly
    // closer than any other open step.
    const floor = Math.max(threshold + 0.1, FINISHED_FLOOR);
    const finished: { id: ID; excerpt: string }[] = [];
    for (const { i } of done) {
      const scores = tv.map((v) => cosine(v, sv[i]));
      const k = scores.indexOf(Math.max(...scores));
      const runnerUp = Math.max(-1, ...scores.filter((_, j) => j !== k));
      if (scores[k] >= floor && scores[k] - runnerUp >= 0.05 && !finished.some((f) => f.id === open[k].id))
        finished.push({ id: open[k].id, excerpt: sentences[i] });
    }
    if (finished.length) hints.finished = finished;
  }

  // What went up or down, and what is expected to: matched to the factor it is about.
  const factors = elements.filter((n) => n.kind === 'state' || n.kind === 'behaviour');
  if (!factors.length) return;
  const fv = await embed(factors.map((n) => elementText(n.label, n.summary)));
  const changed = new Set(suggestions.flatMap((s) => (s.type === 'change' || s.type === 'expectation' ? [s.factor] : [])));
  readings.forEach((r, i) => {
    if (r.labels.direction === 'none' || r.sure.direction < SURE) return;
    const scores = fv.map((v) => cosine(v, sv[i]));
    const k = scores.indexOf(Math.max(...scores));
    const factor = factors[k];
    if (scores[k] < threshold || changed.has(factor.id)) return;
    changed.add(factor.id);
    const reads: FactorReading = factor.kind === 'behaviour' ? (r.labels.direction === 'up' ? 'present' : 'absent') : (r.labels.direction as FactorReading);
    const reason = t('Reads as {what} going {way}.', { what: quote(factor.label), way: r.labels.direction === 'up' ? t('up') : t('down') });
    suggestions.push(
      r.labels.time === 'future'
        ? { id: createId('sug'), type: 'expectation', factor: factor.id, reads, within: 28, excerpt: r.text, reason, state: 'pending', inferred: true }
        : { id: createId('sug'), type: 'change', factor: factor.id, reads, excerpt: r.text, reason, state: 'pending', inferred: true },
    );
  });
}
