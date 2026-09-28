/**
 * The analysis layer contract.
 *
 * Every provider returns structured objects that the UI renders directly: no
 * free-text verdicts. Confidence on patterns is never produced by a provider;
 * it is derived from evidence in `domain/confidence.ts`. Providers may only
 * propose evidence, observations, interpretations and experiments, and the
 * user accepts or dismisses each proposal.
 */
import type {
  AtlasData,
  DomainKey,
  Entry,
  EntryAnalysis,
  Experiment,
  ExperimentResult,
  ID,
  NavigationPlan,
  Pattern,
  PatternKind,
  Stance,
  StrategicPath,
} from '../domain/types';

export type ProviderId = 'local' | 'claude';

/** A pattern the analysis layer proposes. It becomes a Pattern only if the user adopts it. */
export interface PatternCandidate {
  signature: string;
  kind: PatternKind;
  title: string;
  chain: string[];
  /** First-person summary, e.g. "I tend to optimise for immediate opportunity…". */
  statement: string;
  observation: string;
  triggers: string[];
  behaviors: string[];
  consequences: string[];
  supporting: { decisionId: ID; excerpt: string }[];
  counter: { decisionId: ID; excerpt: string }[];
  interpretation: { statement: string; confidence: number; rationale?: string };
  counterStatement?: string;
  implication?: string;
  domains: DomainKey[];
  /** Set when a pattern with the same signature is already in the model. */
  existingPatternId?: ID;
}

export interface PatternChange {
  patternId: ID;
  stance: Stance;
  weight: number;
  before: number;
  after: number;
  excerpt: string;
}

/** What an experiment result would change. Shown to the user before it is applied. */
export interface ModelUpdateProposal {
  experimentId: ID;
  changes: PatternChange[];
  learningNote: string;
  interpretationNotes: { patternId: ID; statement: string }[];
}

export interface ExperimentDraft {
  title: string;
  hypothesis: string;
  design: string;
  durationDays: number;
  measures: { label: string; baseline?: string; target?: string }[];
}

export interface AnalysisProvider {
  readonly id: ProviderId;
  readonly label: string;
  analyzeEntry(entry: Entry, data: AtlasData): Promise<EntryAnalysis>;
  detectDecisionPatterns(data: AtlasData): Promise<PatternCandidate[]>;
  proposeExperiments(pattern: Pattern, data: AtlasData): Promise<ExperimentDraft[]>;
  evaluateExperiment(experiment: Experiment, result: ExperimentResult, data: AtlasData): Promise<ModelUpdateProposal>;
  draftNavigationPlan(path: StrategicPath, data: AtlasData): Promise<NavigationPlan>;
}
