/**
 * The analysis layer contract.
 *
 * Every provider returns structured objects that the interface renders
 * directly: no free-text verdicts, and no numbers standing in for certainty.
 * Statuses of claims and patterns are derived from evidence in the domain
 * layer. Providers may only read notes into observations and suggestions,
 * propose patterns and tests, and describe what a test result would change;
 * the person accepts or dismisses each proposal.
 */
import type {
  AreaKey,
  AtlasData,
  Claim,
  ClaimStatus,
  Entry,
  EntryAnalysis,
  Experiment,
  ExperimentResult,
  ID,
  NavigationPlan,
  PatternKind,
  Stance,
  StrategicPath,
} from '../domain/types';

export type ProviderId = 'local' | 'claude' | 'account';

/** A regularity the analysis proposes. It becomes a Pattern only if the person adopts it. */
export interface PatternCandidate {
  signature: string;
  kind: PatternKind;
  title: string;
  steps: string[];
  /** First person, hedged: "I tend to…". */
  statement: string;
  observation: string;
  triggers: string[];
  behaviors: string[];
  consequences: string[];
  supporting: { decisionId: ID; excerpt: string }[];
  counter: { decisionId: ID; excerpt: string }[];
  /** A possible explanation, offered as a question to explore, not a finding. */
  explanation?: string;
  counterStatement?: string;
  implication?: string;
  areas: AreaKey[];
  /** Set when a pattern with the same signature is already in the atlas. */
  existingPatternId?: ID;
}

/** What a test result would change on the claim it tests. Shown before it is applied. */
export interface ClaimChange {
  claimId: ID;
  stance: Stance;
  before: ClaimStatus;
  after: ClaimStatus;
  excerpt: string;
}

export interface ModelUpdateProposal {
  experimentId: ID;
  changes: ClaimChange[];
  learningNote: string;
}

export interface ExperimentDraft {
  title: string;
  hypothesis: string;
  design: string;
  durationDays: number;
  /** What should happen if the claim holds, written before starting. */
  prediction: string;
  /** What would count as "it didn't work". */
  criteria: string;
  measures: { label: string; baseline?: string; target?: string }[];
}

export interface AnalysisProvider {
  readonly id: ProviderId;
  readonly label: string;
  analyzeEntry(entry: Entry, data: AtlasData): Promise<EntryAnalysis>;
  detectDecisionPatterns(data: AtlasData): Promise<PatternCandidate[]>;
  proposeExperiments(claim: Claim, data: AtlasData): Promise<ExperimentDraft[]>;
  evaluateExperiment(experiment: Experiment, result: ExperimentResult, data: AtlasData): Promise<ModelUpdateProposal>;
  draftNavigationPlan(path: StrategicPath, data: AtlasData): Promise<NavigationPlan>;
}
