/**
 * Deterministic, transparent heuristics that stand in for a language model.
 *
 * Every output carries its basis (the phrases or metadata that triggered it),
 * so the user can see exactly why something was suggested. The Claude provider
 * returns the same shapes; this module is also the offline fallback.
 */
import { computeConfidence } from '../domain/confidence';
import { DOMAIN_KEYS, OUTCOME_RATING_LABEL } from '../domain/constants';
import { decisionCode, decisionHorizon, patternCode, sortedDecisions } from '../domain/selectors';
import type {
  AnalysisSuggestion,
  AtlasData,
  AtlasNode,
  Decision,
  DomainKey,
  Entry,
  EntryAnalysis,
  Experiment,
  ExperimentResult,
  ISODateTime,
  NavigationPlan,
  Observation,
  Pattern,
  StrategicPath,
} from '../domain/types';
import { addDays, todayISO, weekStart } from '../lib/dates';
import { createId } from '../lib/ids';
import { excerpt as firstSentence, sentenceContaining } from '../lib/text';
import type { ExperimentDraft, ModelUpdateProposal, PatternCandidate } from './types';

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

/* ------------------------------------------------------------ domains */

const DOMAIN_LEXICON: Record<DomainKey, string[]> = {
  identity: ['identity', 'who i am', 'author', 'myself', 'director', 'the kind of person'],
  values: ['value', 'values', 'autonomy', 'craft', 'depth', 'integrity', 'matters most', 'principle'],
  goals: ['goal', 'goals', 'target', 'milestone', 'by next', 'aim', 'success means'],
  career: ['career', 'client', 'clients', 'role', 'job', 'offer', 'portfolio', 'festival', 'panel', 'promotion'],
  skills: ['skill', 'skills', 'learn', 'learning', 'practice', 'technique', 'editing', 'layout pass'],
  projects: ['project', 'projects', 'night ferry', 'podcast', 'video', 'animatic', 'workshop', 'deadline', 'deliverable', 'edit'],
  finance: ['money', 'runway', 'income', 'rate', 'invoice', 'budget', 'salary', 'unpaid', 'fee', 'savings', 'rent'],
  relationships: ['partner', 'friend', 'mentor', 'collaborator', 'family', 'sam', 'juna', 'ruth', 'marta', 'teo'],
  environment: ['studio', 'flat', 'afternoon', 'afternoons', 'calls', 'noise', 'desk', 'home', 'office', 'commute'],
  habits: ['habit', 'routine', 'morning', 'mornings', 'review', 'sleep', 'slept', 'running', 'every day', 'streak'],
};

/* ------------------------------------------------------------ observations */

interface ObservationRule {
  statement: string;
  test: (text: string, entry: Entry) => string[] | null;
}

/** Phrases preceded by these words describe something that did not happen. */
const NEGATIONS = ['not', 'never', "wasn't", "didn't", 'supposed to be', 'success means:'];

function affirmed(text: string, phrase: string): boolean {
  if (!has(text, phrase)) return false;
  return !NEGATIONS.some((n) => has(text, `${n} ${phrase}`));
}

function phraseRule(statement: string, phrases: string[]): ObservationRule {
  return {
    statement,
    test: (text) => {
      const hits = phrases.filter((p) => affirmed(text, p));
      return hits.length ? hits : null;
    },
  };
}

const OBSERVATION_RULES: ObservationRule[] = [
  phraseRule('Describes accepting a new commitment.', ['said yes', 'agreed to', 'took on', 'signed on', 'committing to']),
  phraseRule('Describes declining, pausing or limiting a commitment.', ['declined', 'said no', 'turned down', 'paused', 'commitment cap', 'down to three']),
  phraseRule('Describes work compressed against a deadline.', [
    'last four days',
    'last minute',
    'all-nighters',
    'all-nighter',
    'minutes before',
    'deadline',
    'deadlines',
  ]),
  phraseRule('Describes a protected or single-focus work period.', [
    'deep work',
    'protected',
    'only project',
    'mornings only',
    'phone in another room',
    'one project per block',
    'thursday blocks',
  ]),
  phraseRule('Reports something finished.', ['finished', 'shipped', 'locked', 'submitted', 'wrapped']),
  phraseRule('Reports work slipping or stalling.', ['slipping', 'slipped', 'jumps ahead', 'stalled', "haven't opened", 'lost six weeks', 'eating']),
  phraseRule('Describes fragmented or interrupted time.', ['calls', 'interrupted', 'fragmented', 'inbox', 'meetings']),
  phraseRule('Describes changing or expanding scope.', ['added a second', 'rewrote', 'added scope', 'expanded', 'bigger version']),
  phraseRule('Describes a deliberate, intentional choice.', ['deliberately', 'on purpose', 'intentionally']),
  phraseRule('Records a question that was hard to answer.', ["couldn't answer", "don't know how", 'asked what']),
  phraseRule('References financial conditions.', ['runway', 'income', 'day rate', 'salary', 'unpaid', 'money', 'fee']),
  {
    statement: 'States a count of active commitments.',
    test: (text) => {
      const m = text.match(/\b(two|three|four|five|six|seven|\d+) active (things|projects|commitments)\b/);
      return m ? [m[0]] : null;
    },
  },
];

function contextObservation(entry: Entry): Observation | null {
  const { energy, mood } = entry.context ?? {};
  if (energy === undefined || mood === undefined) return null;
  if (energy <= 2 && mood <= -1) {
    return { id: createId('obs'), statement: 'Logged with low energy and low mood.', basis: `Energy ${energy}/5, mood ${mood}` };
  }
  if (energy >= 4 && mood >= 1) {
    return { id: createId('obs'), statement: 'Logged with good energy and mood.', basis: `Energy ${energy}/5, mood +${mood}` };
  }
  return null;
}

/* ------------------------------------------------------------ node matching */

/**
 * Nodes mentioned in the text: full labels first, then distinctive
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
  'what which would saying good being build building missing financial freedom recognition clients client morning sunday running home afternoons income runway creative independent emerging real-time motion production business ship agency accepted paused declined committed burnout protected stability autonomy craft depth compounding barbell optionality working festival night two-track'.split(
    ' ',
  ),
);

/* ------------------------------------------------------------ entry analysis */

export function analyzeEntryLocally(entry: Entry, data: AtlasData, at: ISODateTime = new Date().toISOString()): EntryAnalysis {
  const text = norm(`${entry.title}. ${entry.content}`);
  const observations: Observation[] = [];
  const suggestions: AnalysisSuggestion[] = [];

  for (const rule of OBSERVATION_RULES) {
    const hits = rule.test(text, entry);
    if (hits) observations.push({ id: createId('obs'), statement: rule.statement, basis: `Matched ${hits.slice(0, 3).map(quote).join(', ')}` });
  }
  const ctx = contextObservation(entry);
  if (ctx) observations.push(ctx);

  // Mentions of several projects at once are a structural signal on their own.
  // Mirror nodes (a decision or experience) are linked through their record.
  const mentioned = matchNodes(
    text,
    Object.values(data.nodes).filter((n) => !n.source),
  );
  const projectHits = mentioned.filter((m) => m.node.domain === 'projects').map((m) => m.node.label);
  if (projectHits.length >= 2) {
    observations.push({ id: createId('obs'), statement: `Mentions ${projectHits.length} projects in the same entry.`, basis: projectHits.join(', ') });
  }

  // Pattern evidence: cue phrases for and against each live pattern.
  for (const p of Object.values(data.patterns)) {
    if (p.status === 'dismissed') continue;
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
      reason: `Matched ${matched.map(quote).join(', ')}: ${stance === 'supports' ? 'cues for' : 'cues against'} ${patternCode(p.code)}.`,
      confidence: Math.min(0.9, 0.4 + 0.15 * matched.length),
      state: already ? 'accepted' : 'pending',
    });
  }

  // Node links.
  for (const { node, hit } of mentioned.slice(0, 6)) {
    suggestions.push({
      id: createId('sug'),
      type: 'link_node',
      nodeId: node.id,
      reason: `Mentions ${quote(hit)}.`,
      state: entry.nodeIds.includes(node.id) ? 'accepted' : 'pending',
    });
  }

  // Domains.
  const scored = DOMAIN_KEYS.map((key) => ({ key, hits: DOMAIN_LEXICON[key].filter((w) => has(text, w)) }))
    .filter((d) => d.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length)
    .slice(0, 3);
  for (const d of scored) {
    suggestions.push({
      id: createId('sug'),
      type: 'domain',
      domain: d.key,
      reason: `Matched ${d.hits.slice(0, 3).map(quote).join(', ')}.`,
      state: entry.domains.includes(d.key) ? 'accepted' : 'pending',
    });
  }

  return { generatedAt: at, provider: LOCAL_PROVIDER_LABEL, observations: observations.slice(0, 5), suggestions };
}

/* ------------------------------------------------------------ decision patterns */

function driverExcerpt(d: Decision): string {
  const drivers = d.optimizingFor.length ? ` Optimising for ${d.optimizingFor.join(', ').toLowerCase()}.` : '';
  return `${d.chosenAction}${drivers}`;
}

const codes = (ds: Decision[]) => ds.map((d) => decisionCode(d.seq)).join(', ');

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
    const confidence = computeConfidence([
      ...immediate.map(() => ({ stance: 'supports' as const, weight: 1 })),
      ...longTerm.map(() => ({ stance: 'counters' as const, weight: 1 })),
    ]);
    const signature = 'decision:immediate-over-long-term';
    out.push({
      signature,
      kind: 'decision',
      title: 'Immediate opportunity over long-term focus',
      chain: ['Immediate Opportunity', 'Accept', 'Long-term Focus Deferred'],
      statement: 'I tend to optimize for immediate opportunity rather than long-term focus.',
      observation: `In ${immediate.length} of ${immediate.length + longTerm.length} decisions with a clear time horizon, the chosen option optimised for income, opportunity or visibility over focus, craft or long-term growth.`,
      triggers: ['A direct offer with a short response window', 'Income or visibility on the table'],
      behaviors: ['Chooses the option with the nearest payoff'],
      consequences: ['Long-horizon work is deferred'],
      supporting: immediate.map((d) => ({ decisionId: d.id, excerpt: driverExcerpt(d) })),
      counter: longTerm.map((d) => ({ decisionId: d.id, excerpt: driverExcerpt(d) })),
      interpretation: {
        statement: 'May tend to weight near-term payoffs more heavily than stated long-term priorities.',
        confidence: Math.max(0.3, confidence - 0.08),
        rationale: 'Based on the drivers you recorded for each decision, not on the outcomes.',
      },
      counterStatement: longTerm.length ? `${codes(longTerm)} chose long-term focus over an immediate gain.` : undefined,
      implication: 'Opportunities that arrive with a short response window may be the ones to slow down.',
      domains: ['career', 'projects'],
      existingPatternId: bySignature.get(signature),
    });
  }

  const rated = immediate.filter((d) => d.outcomeRating);
  const short = rated.filter((d) => d.outcomeRating === 'worse' || d.outcomeRating === 'mixed');
  const fine = rated.filter((d) => d.outcomeRating === 'better' || d.outcomeRating === 'as_expected');
  if (short.length >= 3 && short.length > fine.length) {
    const signature = 'decision:opportunity-cost-underestimated';
    const confidence = computeConfidence([
      ...short.map(() => ({ stance: 'supports' as const, weight: 1 })),
      ...fine.map(() => ({ stance: 'counters' as const, weight: 1 })),
    ]);
    out.push({
      signature,
      kind: 'decision',
      title: 'Underestimated cost of new commitments',
      chain: ['Opportunity Accepted', 'Cost Underestimated', 'Outcome Below Expectation'],
      statement: 'Opportunity-driven commitments tend to cost more time than I expect.',
      observation: `${short.length} of ${rated.length} reviewed opportunity-driven decisions turned out worse than or mixed against what was expected.`,
      triggers: ['Estimating a new commitment in isolation'],
      behaviors: ['Scopes the new commitment without the existing load'],
      consequences: ['Overruns that land on existing work'],
      supporting: short.map((d) => ({ decisionId: d.id, excerpt: `${OUTCOME_RATING_LABEL[d.outcomeRating!]}: ${d.actualOutcome ?? ''}`.trim() })),
      counter: fine.map((d) => ({ decisionId: d.id, excerpt: `${OUTCOME_RATING_LABEL[d.outcomeRating!]}: ${d.actualOutcome ?? ''}`.trim() })),
      interpretation: {
        statement: 'Estimates may be made against an empty calendar rather than the real one.',
        confidence: Math.max(0.3, confidence - 0.1),
        rationale: 'Several reviews mention overruns alongside existing commitments.',
      },
      counterStatement: fine.length ? `${codes(fine)} went as expected or better.` : undefined,
      implication: 'Doubling the first estimate, or estimating against the current week, could be tested.',
      domains: ['projects', 'career'],
      existingPatternId: bySignature.get(signature),
    });
  }
  return out;
}

/* ------------------------------------------------------------ experiments */

export function proposeExperimentsLocally(pattern: Pattern): ExperimentDraft[] {
  const behavior = pattern.behaviors[0] ?? pattern.chain[1] ?? pattern.title;
  const consequence = pattern.consequences[0] ?? pattern.chain[pattern.chain.length - 1] ?? 'the consequence';
  const trigger = pattern.triggers[0] ?? pattern.chain[0] ?? 'the trigger';
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  return [
    {
      title: `Interrupt: ${pattern.chain[0] ?? pattern.title}`,
      hypothesis: `If I interrupt the trigger (${lower(trigger)}), ${lower(consequence)} may happen less often.`,
      design: `For 30 days, add one deliberate pause between the trigger and the behaviour (“${lower(behavior)}”). Log every time the trigger appears and what you did.`,
      durationDays: 30,
      measures: [
        { label: `Times the trigger appeared`, baseline: '—' },
        { label: `Times the behaviour followed`, baseline: '—' },
        { label: 'Focus hours per week' },
        { label: 'Stress (1–5)' },
      ],
    },
    {
      title: `Look for counter-evidence: ${patternCode(pattern.code)}`,
      hypothesis: `${patternCode(pattern.code)} holds less often than the current evidence suggests.`,
      design: 'For 14 days, note every time the trigger appears and the behaviour does not follow. This tests the pattern rather than trying to change it.',
      durationDays: 14,
      measures: [{ label: 'Trigger without the behaviour' }, { label: 'Trigger followed by the behaviour' }],
    },
  ];
}

export function evaluateExperimentLocally(experiment: Experiment, result: ExperimentResult, data: AtlasData): ModelUpdateProposal {
  const changes = experiment.patternLinks
    .map((link) => {
      const pattern = data.patterns[link.patternId];
      if (!pattern || result.outcome === 'inconclusive') return null;
      const stance = result.outcome === 'supports' ? link.ifSupported : link.ifSupported === 'supports' ? 'counters' : 'supports';
      const before = computeConfidence(pattern.evidence);
      const after = computeConfidence([...pattern.evidence, { stance, weight: 2 }]);
      return {
        patternId: pattern.id,
        stance,
        weight: 2,
        before,
        after,
        excerpt: result.summary || `${experiment.title}: hypothesis ${result.outcome === 'supports' ? 'supported' : 'not supported'}.`,
      };
    })
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  const note =
    result.outcome === 'inconclusive'
      ? 'An inconclusive result does not change pattern confidence. Consider tightening the measures and running it again.'
      : `The hypothesis was ${result.outcome === 'supports' ? 'supported' : 'contradicted'}. Linked patterns receive this result as evidence with double weight, because the experiment was designed to test them.`;

  return { experimentId: experiment.id, changes, learningNote: note, interpretationNotes: [] };
}

/* ------------------------------------------------------------ navigation */

export function draftNavigationPlanLocally(path: StrategicPath, data: AtlasData, today = todayISO()): NavigationPlan {
  const experiments = path.experimentIds.map((id) => data.experiments[id]).filter(Boolean);
  const strategic =
    experiments.find((x) => x.status === 'running' && x.durationDays >= 60) ?? experiments.find((x) => x.status !== 'completed' && x.status !== 'abandoned');
  const targets = path.requirements.slice(0, 3).map((title, i) => ({ id: createId('tgt'), title, due: addDays(today, 30), done: false, _i: i }));
  const week = weekStart(today);
  const actions = targets.map((t) => ({
    id: createId('act'),
    title: `First concrete step toward: ${t.title.charAt(0).toLowerCase()}${t.title.slice(1)}`,
    targetId: t.id,
    week,
    status: 'todo' as const,
  }));
  return {
    pathId: path.id,
    committedAt: today,
    position: data.currentState.position,
    objective: { title: path.objective, description: path.summary, targetDate: addDays(today, 365) },
    experimentId: strategic?.id,
    milestone: { title: path.requirements[0] ?? 'First milestone', due: addDays(today, 60) },
    targets: targets.map(({ _i, ...t }) => t),
    actions,
    currentActionId: actions[0]?.id,
  };
}
