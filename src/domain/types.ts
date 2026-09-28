/**
 * Cognitive Atlas data model.
 *
 * The model follows the product chain:
 *   user data (Entry, Decision)
 *   → observations and evidence (Observation, Evidence)
 *   → interpretation and patterns (Interpretation, CounterEvidence, Pattern)
 *   → the metacognitive map (AtlasNode, AtlasEdge)
 *   → strategic options (StrategicPath) → experiments (Experiment)
 *   → results → model updates (ModelUpdate).
 *
 * Collections are normalised records keyed by id so the store can later be
 * swapped for a backend without reshaping the UI.
 */

export type ID = string;
/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Full timestamp, ISO 8601. */
export type ISODateTime = string;

/* ------------------------------------------------------------------ */
/* Graph                                                               */
/* ------------------------------------------------------------------ */

export type DomainKey =
  | 'identity'
  | 'values'
  | 'goals'
  | 'career'
  | 'skills'
  | 'projects'
  | 'finance'
  | 'relationships'
  | 'environment'
  | 'habits';

export type MindCategory =
  | 'belief'
  | 'assumption'
  | 'motivation'
  | 'fear'
  | 'value'
  | 'mental_model'
  | 'decision'
  | 'question'
  | 'experience';

export type RelationType =
  | 'part_of'
  | 'influences'
  | 'causes'
  | 'supports'
  | 'conflicts'
  | 'contradicts'
  | 'derived_from'
  | 'depends_on'
  | 'examines';

export type GraphLayer = 'orbit' | 'mind';

/** Whether the user authored something, or the analysis layer proposed it. */
export type Origin = 'user' | 'inferred';

export type QuestionStatus = 'open' | 'exploring' | 'resolved';

/** A pointer to a piece of raw user data that can act as evidence. */
export interface SourceRef {
  kind: 'entry' | 'decision' | 'experiment';
  id: ID;
}

/** A life domain: the hubs of the Orbit graph. */
export interface Domain {
  key: DomainKey;
  /** One-line statement of the current state, e.g. "Creative Producer". */
  statement: string;
  summary: string;
  updatedAt: ISODateTime;
}

/**
 * A node in the atlas. One node can live in both graphs: `domain` places it in
 * Orbit (as a satellite of that domain hub), `category` places it in Mind.
 * A value such as "Autonomy" is therefore a single record shown in both maps.
 */
export interface AtlasNode {
  id: ID;
  label: string;
  summary: string;
  domain?: DomainKey;
  category?: MindCategory;
  origin: Origin;
  /** Only for inferred nodes: how sure the analysis layer is (0–1). */
  confidence?: number;
  /** A node can mirror a raw record, e.g. a decision node mirrors Decision #03. */
  source?: SourceRef;
  /** Questions only. */
  status?: QuestionStatus;
  resolution?: string;
  tags: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * A typed relationship. Edges are layer-agnostic: a graph renders an edge when
 * both endpoints are visible in it. Domain hubs use ids of the form
 * `domain:<key>` so they can be connected like any other node.
 */
export interface AtlasEdge {
  id: ID;
  source: ID;
  target: ID;
  relation: RelationType;
  note?: string;
  origin: Origin;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Raw user data                                                       */
/* ------------------------------------------------------------------ */

export type EntryKind =
  | 'journal'
  | 'goal'
  | 'experience'
  | 'problem'
  | 'reflection'
  | 'project'
  | 'habit'
  | 'observation';

/** What the quick-capture surface can create. Decisions get their own record. */
export type CaptureKind = EntryKind | 'decision';

export interface EntryContext {
  /** 1 (depleted) – 5 (high). */
  energy?: number;
  /** -2 (very low) – +2 (very good). */
  mood?: number;
  emotions?: string[];
  setting?: string;
}

export interface Entry {
  id: ID;
  /** Human-facing sequence number: "Entry #12". */
  seq: number;
  kind: EntryKind;
  title: string;
  content: string;
  date: ISODate;
  domains: DomainKey[];
  tags: string[];
  context?: EntryContext;
  /** Atlas nodes this entry is about. Acts as evidence for those nodes. */
  nodeIds: ID[];
  analysis?: EntryAnalysis;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface DecisionOption {
  id: ID;
  label: string;
  /** Why this option was considered. */
  rationale: string;
}

export type OutcomeRating = 'better' | 'as_expected' | 'mixed' | 'worse';

export interface Decision {
  id: ID;
  seq: number;
  title: string;
  date: ISODate;
  context: string;
  options: DecisionOption[];
  chosenOptionId?: ID;
  chosenAction: string;
  expectedOutcome: string;
  actualOutcome?: string;
  outcomeRating?: OutcomeRating;
  learned?: string;
  /** What the decision was optimising for, in the user's own terms. */
  optimizingFor: string[];
  domains: DomainKey[];
  tags: string[];
  nodeIds: ID[];
  reviewedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Evidence-first reasoning                                            */
/* ------------------------------------------------------------------ */

export type Stance = 'supports' | 'counters';

/** One piece of raw data, linked to a claim, with the reason it was linked. */
export interface Evidence {
  id: ID;
  source: SourceRef;
  stance: Stance;
  /** The specific passage that bears on the claim. */
  excerpt: string;
  note?: string;
  /** Entries and decisions weigh 1, completed experiments weigh 2. */
  weight: number;
  addedBy: Origin;
  addedAt: ISODateTime;
}

/** A neutral description of what happened, before any interpretation. */
export interface Observation {
  id: ID;
  statement: string;
  /** Why the observation was made: matched phrases, metadata, counts. */
  basis: string;
}

/** A possible reading of the observed pattern. Never a fact. */
export interface Interpretation {
  id: ID;
  statement: string;
  /** Model estimate, 0–1. */
  confidence: number;
  rationale?: string;
}

export interface CounterEvidence {
  id: ID;
  statement: string;
  sources: SourceRef[];
}

export interface StrategicImplication {
  id: ID;
  statement: string;
  pathIds: ID[];
}

export type PatternKind = 'behavioral' | 'cognitive' | 'decision';
export type PatternStatus = 'emerging' | 'active' | 'weakening' | 'dismissed';
export type PatternVerdict = 'resonates' | 'partial' | 'inaccurate';

export interface Pattern {
  id: ID;
  /** Display code, e.g. 7 → "PATTERN 07". */
  code: number;
  kind: PatternKind;
  title: string;
  /** Short causal chain, e.g. ["Opportunity Accumulation", "Overcommitment", "Fragmentation"]. */
  chain: string[];
  status: PatternStatus;
  observation: string;
  triggers: string[];
  behaviors: string[];
  consequences: string[];
  evidence: Evidence[];
  interpretations: Interpretation[];
  counterEvidence: CounterEvidence[];
  implications: StrategicImplication[];
  domains: DomainKey[];
  nodeIds: ID[];
  /** Phrases the analysis layer uses to find new evidence. Shown to the user. */
  cues: { supports: string[]; counters: string[] };
  userAssessment?: { verdict: PatternVerdict; note?: string; at: ISODateTime };
  /** Stable key for analysis candidates, so a re-run doesn't duplicate a pattern. */
  signature?: string;
  origin: Origin;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Strategy                                                            */
/* ------------------------------------------------------------------ */

export interface CurrentState {
  position: string;
  summary: string;
  constraints: string[];
  assets: string[];
  updatedAt: ISODateTime;
}

export type SkillStatus = 'have' | 'developing' | 'gap';

export interface SkillRequirement {
  label: string;
  status: SkillStatus;
}

/** A scenario. Paths are never ranked; they are described comparably. */
export interface StrategicPath {
  id: ID;
  code: string;
  title: string;
  objective: string;
  summary: string;
  requirements: string[];
  dependencies: string[];
  skills: SkillRequirement[];
  capital: string;
  time: string;
  risks: string[];
  tradeoffs: string[];
  opportunityCosts: string[];
  unknowns: string[];
  /** Ideas for experiments that are not yet designed. */
  proposedExperiments: string[];
  experimentIds: ID[];
  patternIds: ID[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export type ExperimentStatus = 'proposed' | 'running' | 'completed' | 'abandoned';
export type ExperimentOutcome = 'supports' | 'contradicts' | 'inconclusive';

export interface Measure {
  id: ID;
  label: string;
  baseline?: string;
  target?: string;
  result?: string;
}

export interface ExperimentResult {
  outcome: ExperimentOutcome;
  summary: string;
  learning: string;
  recordedAt: ISODateTime;
}

/**
 * How an experiment bears on a pattern. If the hypothesis is supported, the
 * result counts as `ifSupported` evidence on the pattern; if contradicted, the
 * opposite stance applies.
 */
export interface PatternLink {
  patternId: ID;
  ifSupported: Stance;
}

export interface Experiment {
  id: ID;
  code: number;
  title: string;
  hypothesis: string;
  design: string;
  durationDays: number;
  startDate?: ISODate;
  status: ExperimentStatus;
  measures: Measure[];
  result?: ExperimentResult;
  patternLinks: PatternLink[];
  pathIds: ID[];
  questionIds: ID[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface NavTarget {
  id: ID;
  title: string;
  due: ISODate;
  done: boolean;
}

export type NavActionStatus = 'todo' | 'done' | 'skipped';

export interface NavAction {
  id: ID;
  title: string;
  targetId?: ID;
  /** Monday of the week this action belongs to. */
  week: ISODate;
  status: NavActionStatus;
}

/** The execution layer for one chosen path. */
export interface NavigationPlan {
  pathId: ID;
  committedAt: ISODate;
  position: string;
  objective: { title: string; description: string; targetDate: ISODate };
  experimentId?: ID;
  milestone: { title: string; due: ISODate };
  targets: NavTarget[];
  actions: NavAction[];
  currentActionId?: ID;
}

/* ------------------------------------------------------------------ */
/* Analysis records                                                    */
/* ------------------------------------------------------------------ */

export type SuggestionState = 'pending' | 'accepted' | 'dismissed';

export type AnalysisSuggestion =
  | {
      id: ID;
      type: 'link_node';
      nodeId: ID;
      reason: string;
      state: SuggestionState;
    }
  | {
      id: ID;
      type: 'pattern_evidence';
      patternId: ID;
      stance: Stance;
      excerpt: string;
      matched: string[];
      reason: string;
      confidence: number;
      state: SuggestionState;
    }
  | {
      id: ID;
      type: 'domain';
      domain: DomainKey;
      reason: string;
      state: SuggestionState;
    };

/** The persisted output of analysing one entry. */
export interface EntryAnalysis {
  generatedAt: ISODateTime;
  provider: string;
  observations: Observation[];
  suggestions: AnalysisSuggestion[];
}

export type ModelUpdateKind =
  | 'evidence_added'
  | 'evidence_removed'
  | 'pattern_created'
  | 'pattern_assessed'
  | 'pattern_status'
  | 'experiment_result'
  | 'direction_set';

/** An append-only log of how the model changed and why. */
export interface ModelUpdate {
  id: ID;
  at: ISODateTime;
  kind: ModelUpdateKind;
  summary: string;
  patternId?: ID;
  before?: number;
  after?: number;
  source?: SourceRef;
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export interface Profile {
  name: string;
  since: ISODate;
}

export interface Counters {
  entry: number;
  decision: number;
  pattern: number;
  experiment: number;
}

export interface AtlasData {
  profile: Profile;
  domains: Record<DomainKey, Domain>;
  nodes: Record<ID, AtlasNode>;
  edges: Record<ID, AtlasEdge>;
  entries: Record<ID, Entry>;
  decisions: Record<ID, Decision>;
  patterns: Record<ID, Pattern>;
  paths: Record<ID, StrategicPath>;
  experiments: Record<ID, Experiment>;
  currentState: CurrentState;
  navigation: NavigationPlan | null;
  modelLog: ModelUpdate[];
  counters: Counters;
}

/** Anything the inspector panel can show. */
export type EntityKind = 'node' | 'domain' | 'entry' | 'decision' | 'pattern' | 'experiment' | 'path';

export interface EntityRef {
  kind: EntityKind;
  id: ID;
}
