/**
 * Structured-output contracts for the Claude analysis tasks.
 *
 * These Zod schemas are the single source of truth for what the model may
 * return: the proxy passes them to the API as the output format, and the
 * browser validates every response against them again before anything touches
 * the store. There are no confidence numbers anywhere: how well something is
 * supported is derived from evidence by the application, never estimated.
 * This file only depends on `zod` so the Node proxy can import it.
 */
import { z } from 'zod';

const AREA_KEYS = ['self', 'work', 'projects', 'money', 'people', 'health', 'place', 'growth'] as const;
const STANCES = ['supports', 'counters'] as const;
const OCCURRENCE_KINDS = ['event', 'action', 'experience', 'reading'] as const;
const READINGS = ['up', 'down', 'high', 'low', 'present', 'absent'] as const;

export const EntryAnalysisOutput = z.object({
  observations: z
    .array(z.object({ statement: z.string(), basis: z.string() }))
    .describe('Neutral descriptions of what the note reports. No interpretation, no traits.'),
  node_links: z.array(z.object({ node_id: z.string(), reason: z.string() })),
  pattern_evidence: z.array(
    z.object({
      pattern_id: z.string(),
      stance: z.enum(STANCES),
      excerpt: z.string().describe('The exact sentence from the note that bears on the pattern.'),
      matched: z.array(z.string()),
      reason: z.string(),
    }),
  ),
  areas: z.array(z.object({ area: z.enum(AREA_KEYS), reason: z.string() })),
  occurrences: z
    .array(
      z.object({
        kind: z.enum(OCCURRENCE_KINDS),
        label: z.string().describe('What happened, in the note’s own words, under 70 characters.'),
        excerpt: z.string().describe('The exact sentence it comes from.'),
        about: z.array(z.string()).describe('Ids of elements it concerns, from the input only.'),
        instance_of: z.string().describe('Id of a behaviour element this is one instance of, or an empty string.'),
      }),
    )
    .describe('Happenings the note reports: events, actions, experiences. Never interpretations.'),
  attributions: z
    .array(z.object({ excerpt: z.string(), reason: z.string() }))
    .describe('Sentences where the note explains a cause in its own words. These are the person’s hypotheses, not evidence.'),
  changes: z
    .array(
      z.object({
        node_id: z.string().describe('Id of the element, from the input only.'),
        reads: z.enum(READINGS),
        excerpt: z.string().describe('The exact sentence that says it.'),
        reason: z.string(),
      }),
    )
    .describe(
      'What the note says an element did: went up or down, was high or low, happened or did not. Only when the note says which way; a mention alone is not a change.',
    ),
  expectations: z
    .array(
      z.object({
        node_id: z.string().describe('Id of the element, from the input only.'),
        reads: z.enum(READINGS),
        within_days: z.number().describe('How soon the note expects it, in days.'),
        excerpt: z.string().describe('The exact sentence that expects it.'),
        reason: z.string(),
      }),
    )
    .describe('What the note expects to happen to an element later. A prediction to check, never history.'),
});

export const DecisionPatternsOutput = z.object({
  candidates: z.array(
    z.object({
      signature: z.string().describe('Stable kebab-case key, prefixed with "decision:".'),
      title: z.string(),
      steps: z.array(z.string()).describe('Two to four short steps of what keeps happening.'),
      statement: z.string().describe('First person, hedged: "I tend to…".'),
      observation: z.string(),
      triggers: z.array(z.string()),
      behaviors: z.array(z.string()),
      consequences: z.array(z.string()),
      supporting: z.array(z.object({ decision_id: z.string(), excerpt: z.string() })),
      counter: z.array(z.object({ decision_id: z.string(), excerpt: z.string() })),
      explanation: z.string().describe('A possible explanation, phrased as a question to explore.'),
      counter_statement: z.string(),
      implication: z.string(),
      areas: z.array(z.enum(AREA_KEYS)),
    }),
  ),
});

export const ExperimentProposalsOutput = z.object({
  experiments: z.array(
    z.object({
      title: z.string(),
      hypothesis: z.string().describe('Hedged and falsifiable: "I may…", "If I…, then…".'),
      design: z.string().describe('Change one factor on purpose, keep everything else, keep recording.'),
      duration_days: z.number(),
      prediction: z.string().describe('What should happen if the claim holds, stated before starting.'),
      criteria: z.string().describe('What result would count as the claim not holding.'),
      measures: z.array(z.object({ label: z.string(), baseline: z.string(), target: z.string() })),
    }),
  ),
});

export const ExperimentReviewOutput = z.object({
  learning_note: z.string(),
});

export const NavigationPlanOutput = z.object({
  objective: z.object({ title: z.string(), description: z.string(), months: z.number() }),
  milestone: z.object({ title: z.string(), weeks: z.number() }),
  targets: z.array(z.object({ title: z.string(), days: z.number() })),
  actions: z.array(z.object({ title: z.string(), target_index: z.number() })),
});

export const SHARED_RULES = `You are the analysis layer of Cognitive Atlas, a personal metacognition tool.
Rules that always apply:
- Work only from the records provided. Cite them by id. Never invent records or ids.
- Keep what happened, what is claimed about causes, and what is imagined apart.
- Describe observations neutrally. Offer explanations as possibilities ("may", "could"), never as facts about the person.
- No diagnoses, personality types, traits, scores, confidence numbers, probabilities, effect sizes, or labels such as "you are an X".
- Never state a motive or an inner state as fact; ask instead.
- Never recommend a single "best" option. The person decides.
- Actively look for counter-evidence and contrast cases, and report them.
- Coming first, happening together, and the person's own "because" are reasons to look, never proof that one thing causes another.
- Nothing written about something is not the same as it not happening: say it is unknown.
- Describe regularities in situations ("when X, Y tends to follow"), never dispositions of the person.
- Suggest a change to try only if it is something the person does, reversible, and never where health or money is at stake.`;

/** The interface language the text fields should be written in (ids and quotes stay as they are). */
export const LANGUAGE_RULE: Record<string, string> = {
  id: '\nWrite every free-text field in Indonesian (Bahasa Indonesia). Quotes from the records stay exactly as written.',
};

export const TASKS = {
  entry_analysis: {
    schema: EntryAnalysisOutput,
    system: `${SHARED_RULES}
Task: read one note. Report neutral observations with their basis; which existing elements it mentions; whether it is an instance of, or a counter-case to, any listed pattern (quote the exact sentence); which life areas it touches; the happenings it reports, for the person's timeline; any sentence where the note explains a cause in its own words; what the note says an element did (went up or down, was high or low, happened or did not), only where it says which way; and anything the note expects to happen later. Only use element and pattern ids from the input.`,
  },
  decision_patterns: {
    schema: DecisionPatternsOutput,
    system: `${SHARED_RULES}
Task: look across the decision log for recurring regularities in how decisions are made and how they turn out. A candidate needs at least three supporting decisions. For each, list supporting and counter decisions by id with a short excerpt. Skip candidates whose signature is already listed as existing.`,
  },
  experiment_proposals: {
    schema: ExperimentProposalsOutput,
    system: `${SHARED_RULES}
Task: propose one to three small, safe, time-boxed tests of the given claim. Each changes one factor on purpose, states its prediction beforehand and what would count as failure. Include at least one test designed to find contrast cases. Measures must be observable by the person.`,
  },
  experiment_review: {
    schema: ExperimentReviewOutput,
    system: `${SHARED_RULES}
Task: a test has a recorded result. Write a short learning note comparing the result with the prediction. Do not state confidence numbers; the application derives the claim's status from evidence.`,
  },
  navigation_plan: {
    schema: NavigationPlanOutput,
    system: `${SHARED_RULES}
Task: turn the chosen path into a plan: a 12-month objective, the next milestone, two to four 30-day targets and three to six concrete actions for this week. Actions must be small enough to finish in one sitting.`,
  },
} as const;

export type TaskName = keyof typeof TASKS;
export type TaskOutput<T extends TaskName> = z.infer<(typeof TASKS)[T]['schema']>;
