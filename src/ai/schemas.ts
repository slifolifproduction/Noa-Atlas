/**
 * Structured-output contracts for the Claude analysis tasks.
 *
 * These Zod schemas are the single source of truth for what the model may
 * return: the proxy passes them to the API as the output format, and the
 * browser validates every response against them again before anything touches
 * the store. This file only depends on `zod` so the Node proxy can import it.
 */
import { z } from 'zod';

const DOMAIN_KEYS = ['identity', 'values', 'goals', 'career', 'skills', 'projects', 'finance', 'relationships', 'environment', 'habits'] as const;
const STANCES = ['supports', 'counters'] as const;

export const EntryAnalysisOutput = z.object({
  observations: z
    .array(z.object({ statement: z.string(), basis: z.string() }))
    .describe('Neutral descriptions of what the entry reports. No interpretation, no traits.'),
  node_links: z.array(z.object({ node_id: z.string(), reason: z.string() })),
  pattern_evidence: z.array(
    z.object({
      pattern_id: z.string(),
      stance: z.enum(STANCES),
      excerpt: z.string().describe('The exact sentence from the entry that bears on the pattern.'),
      matched: z.array(z.string()),
      reason: z.string(),
      confidence: z.number().describe('0 to 1: how clearly this entry bears on the pattern.'),
    }),
  ),
  domains: z.array(z.object({ domain: z.enum(DOMAIN_KEYS), reason: z.string() })),
});

export const DecisionPatternsOutput = z.object({
  candidates: z.array(
    z.object({
      signature: z.string().describe('Stable kebab-case key, prefixed with "decision:".'),
      title: z.string(),
      chain: z.array(z.string()).describe('Three short steps: trigger → behaviour → consequence.'),
      statement: z.string().describe('First person, hedged: "I tend to…".'),
      observation: z.string(),
      triggers: z.array(z.string()),
      behaviors: z.array(z.string()),
      consequences: z.array(z.string()),
      supporting: z.array(z.object({ decision_id: z.string(), excerpt: z.string() })),
      counter: z.array(z.object({ decision_id: z.string(), excerpt: z.string() })),
      interpretation: z.object({ statement: z.string(), confidence: z.number(), rationale: z.string() }),
      counter_statement: z.string(),
      implication: z.string(),
      domains: z.array(z.enum(DOMAIN_KEYS)),
    }),
  ),
});

export const ExperimentProposalsOutput = z.object({
  experiments: z.array(
    z.object({
      title: z.string(),
      hypothesis: z.string().describe('Hedged and falsifiable: "I may…", "If I…, then…".'),
      design: z.string(),
      duration_days: z.number(),
      measures: z.array(z.object({ label: z.string(), baseline: z.string(), target: z.string() })),
    }),
  ),
});

export const ExperimentReviewOutput = z.object({
  learning_note: z.string(),
  interpretation_notes: z.array(z.object({ pattern_id: z.string(), statement: z.string() })),
});

export const NavigationPlanOutput = z.object({
  objective: z.object({ title: z.string(), description: z.string(), months: z.number() }),
  milestone: z.object({ title: z.string(), weeks: z.number() }),
  targets: z.array(z.object({ title: z.string(), days: z.number() })),
  actions: z.array(z.object({ title: z.string(), target_index: z.number() })),
});

const SHARED_RULES = `You are the analysis layer of Cognitive Atlas, a personal metacognition tool.
Rules that always apply:
- Work only from the records provided. Cite them by id. Never invent records or ids.
- Describe observations neutrally. Offer interpretations as possibilities ("may", "possible"), never as facts about the person.
- No diagnoses, personality types, scores, or labels such as "you are an X".
- Never recommend a single "best" option. The user decides.
- Actively look for counter-evidence and report it.`;

export const TASKS = {
  entry_analysis: {
    schema: EntryAnalysisOutput,
    system: `${SHARED_RULES}
Task: analyse one journal entry. Report neutral observations with their basis, which existing nodes it mentions, whether it is evidence for or against any listed pattern (quote the exact sentence), and which life domains it touches. Only use node and pattern ids from the input.`,
  },
  decision_patterns: {
    schema: DecisionPatternsOutput,
    system: `${SHARED_RULES}
Task: look across the decision log for recurring decision-making patterns. A candidate needs at least three supporting decisions. For each, list supporting and counter decisions by id with a short excerpt. Skip candidates whose signature is already listed as existing.`,
  },
  experiment_proposals: {
    schema: ExperimentProposalsOutput,
    system: `${SHARED_RULES}
Task: propose one to three small, safe, time-boxed experiments that would test the given pattern. Include at least one experiment designed to find counter-evidence. Measures must be observable by the user.`,
  },
  experiment_review: {
    schema: ExperimentReviewOutput,
    system: `${SHARED_RULES}
Task: an experiment has a recorded result. Write a short learning note and, for each linked pattern, an optional revised interpretation. Do not state confidence numbers; the application derives them from evidence.`,
  },
  navigation_plan: {
    schema: NavigationPlanOutput,
    system: `${SHARED_RULES}
Task: turn the chosen strategic path into a navigation plan: a 12-month objective, the next milestone, two to four 30-day targets and three to six concrete actions for this week. Actions must be small enough to finish in one sitting.`,
  },
} as const;

export type TaskName = keyof typeof TASKS;
export type TaskOutput<T extends TaskName> = z.infer<(typeof TASKS)[T]['schema']>;
