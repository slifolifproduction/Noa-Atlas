/**
 * Cognitive Atlas data model.
 *
 * Four layers and one fenced mode, never collapsed into each other:
 *
 *   RECORD         What the person wrote: notes (Entry) and decisions (Decision).
 *                  The ground everything traces back to; the system never rewrites it.
 *   HISTORY        What happened, when: dated occurrences read from the records
 *                  (events, actions, experiences, readings of a state), plus the
 *                  decisions themselves.
 *   MAP            What exists: standing elements (AtlasNode), each of a kind, in a
 *                  life area, with a lifespan; and the declared links between them.
 *   UNDERSTANDING  What is claimed about how things affect each other (Claim, with
 *                  evidence, a derived status, rivals) and what keeps happening
 *                  (Pattern, a regularity in history).
 *   POSSIBILITY    What might have been or might be: options not taken, imagined
 *                  outcomes, paths not yet lived. Never evidence for anything.
 *
 * Everything carries who said it (the person, or the analysis proposing) and
 * when. Statuses of claims and patterns are derived from their evidence in
 * `domain/claims.ts` and `domain/patterns.ts`; nothing numeric is typed in.
 *
 * Collections are normalised records keyed by id, so the store can later be
 * swapped for a backend without reshaping the interface.
 */

export type ID = string;
/** Calendar date, `YYYY-MM-DD`. */
export type ISODate = string;
/** Full timestamp, ISO 8601. */
export type ISODateTime = string;

/** Whether the person wrote something, or the analysis proposed it. */
export type Origin = 'user' | 'inferred';

/* ------------------------------------------------------------------ */
/* Map: where things sit                                               */
/* ------------------------------------------------------------------ */

/**
 * Territories of a life. `self` is the centre of the map (identity, core
 * values); the others are sectors around it.
 */
export type AreaKey = 'self' | 'work' | 'projects' | 'money' | 'people' | 'health' | 'place' | 'growth';

/** Rings of the map, from the person outward: what they hold, what they do, what surrounds them. */
export type LayerKey = 'hold' | 'do' | 'around';

/** What an element is. Each kind belongs to one layer. */
export type ElementKind =
  // hold: the inner layer
  | 'value'
  | 'belief'
  | 'fear'
  | 'goal'
  | 'question'
  // do: behaviour and commitments
  | 'behaviour'
  | 'commitment'
  | 'skill'
  | 'role'
  // around: conditions and the world
  | 'state'
  | 'person'
  | 'resource'
  | 'place';

export type QuestionStatus = 'open' | 'exploring' | 'resolved';
export type SkillStatus = 'have' | 'developing' | 'gap';

/** A territory's one-line state, written by the person. */
export interface Area {
  key: AreaKey;
  statement: string;
  summary: string;
  updatedAt: ISODateTime;
}

/**
 * A question can anchor an investigation: why did something happen (backward),
 * what if something changed (forward), or a question of value that only the
 * person can settle.
 */
export interface Investigation {
  kind: 'why' | 'what_if' | 'value';
  /** The element being explained (why) or changed (what if). */
  anchorId?: ID;
  /** "Rather than what?" A why-question needs a contrast. */
  contrast?: string;
  /** Claims gathered as possible contributors or consequences. */
  claimIds: ID[];
  /** A provisional conclusion, in the person's words. */
  conclusion?: string;
  concludedAt?: ISODateTime;
}

/**
 * An element of the map: something that exists and persists. One element is
 * shown everywhere it matters (Orbit, the network, search, the panel).
 */
export interface AtlasNode {
  id: ID;
  label: string;
  summary: string;
  kind: ElementKind;
  area: AreaKey;
  origin: Origin;
  /** A proposal from the analysis stays off the map until the person adopts it. */
  adopted: boolean;
  /** Lifespan: active from / until (a project, a belief held, a condition). */
  since?: ISODate;
  until?: ISODate;
  /** An outcome of concern: something the person wants explained or changed. */
  concern?: boolean;
  /** Outside the person's control. */
  external?: boolean;
  /** States: the scale readings use. */
  scale?: { min: number; max: number; higherIs: 'better' | 'worse' };
  /** Skills. */
  level?: SkillStatus;
  /** Beliefs: the claim this belief makes about how life works (a belief is also a hypothesis). */
  claimId?: ID;
  /** Questions. */
  status?: QuestionStatus;
  resolution?: string;
  investigation?: Investigation;
  tags: string[];
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * A declared link: true because the person says so, so it needs no evidence.
 * Links organise the map; they never claim that one thing changes another.
 */
export type LinkType = 'part_of' | 'about' | 'aims_at' | 'motivates' | 'conflicts' | 'aligns';

export interface AtlasEdge {
  id: ID;
  source: ID;
  target: ID;
  type: LinkType;
  note?: string;
  origin: Origin;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Record                                                              */
/* ------------------------------------------------------------------ */

/** A pointer to something that can act as evidence or as the source of a reading. */
export interface SourceRef {
  kind: 'entry' | 'decision' | 'experiment' | 'occurrence';
  id: ID;
}

/** Genres of writing. Some can also place something on the map. */
export type EntryKind = 'journal' | 'goal' | 'experience' | 'problem' | 'reflection' | 'project' | 'habit' | 'observation';

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
  areas: AreaKey[];
  tags: string[];
  context?: EntryContext;
  /** Elements this note is about. */
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
  /** What this option was expected to bring, at the time (history of expectations). */
  expected?: string;
  /** For options not taken: what might have happened, imagined afterwards (possibility, never history). */
  imagined?: string;
}

export type OutcomeRating = 'better' | 'as_expected' | 'mixed' | 'worse';

/**
 * A decision is a branch point: the options that were seen, the one chosen
 * (the lived branch) and the ones not taken (possibilities). Deciding,
 * doing, the outcome, judging the outcome and explaining it are kept apart.
 */
export interface Decision {
  id: ID;
  seq: number;
  title: string;
  date: ISODate;
  context: string;
  options: DecisionOption[];
  chosenOptionId?: ID;
  chosenAction: string;
  /** What was expected overall, at the time. */
  expectedOutcome: string;
  /** Was it carried out? The gap between deciding and doing. */
  enacted?: 'yes' | 'partly' | 'no';
  /** What actually followed. */
  actualOutcome?: string;
  /** The outcome judged against what was expected. */
  outcomeRating?: OutcomeRating;
  /** The decision judged by what was knowable at the time, not by its result. */
  processNote?: string;
  learned?: string;
  /** An if-then rule for next time a similar choice comes. */
  nextTime?: string;
  /** What the decision was optimising for, in the person's own terms (stated reasons). */
  optimizingFor: string[];
  /** Claims that may explain how it turned out. */
  claimIds: ID[];
  areas: AreaKey[];
  tags: string[];
  nodeIds: ID[];
  reviewedAt?: ISODateTime;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* History                                                             */
/* ------------------------------------------------------------------ */

/**
 * Whether something happened, was expected, is planned, or is only possible.
 * Only the actual can be evidence about the world.
 */
export type Mode = 'actual' | 'expected' | 'planned' | 'possible';

export type OccurrenceKind = 'event' | 'action' | 'experience' | 'reading';

/** Something that happened at a time, read from a record. */
export interface Occurrence {
  id: ID;
  kind: OccurrenceKind;
  label: string;
  date: ISODate;
  /** The end, for something that lasted (a week, a sprint). */
  until?: ISODate;
  /** The date is approximate ("around April"). */
  approx?: boolean;
  /** Elements it concerns. */
  about: ID[];
  /** The behaviour it is one instance of, or the state it is a reading of. */
  instanceOf?: ID;
  /** Readings: the level on the state's scale. */
  value?: number;
  /** It happened to the person rather than by them. */
  external?: boolean;
  /** A formative episode worth keeping in view. */
  landmark?: boolean;
  /** The trail back to the record it was read from. */
  source?: SourceRef;
  excerpt?: string;
  mode: Mode;
  origin: Origin;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Understanding                                                       */
/* ------------------------------------------------------------------ */

export type Stance = 'supports' | 'counters';

/** What a piece of evidence establishes about a claim. The kind matters more than the count. */
export type EvidenceKind = 'instance' | 'contrast' | 'counter_case' | 'mechanism' | 'intervention';

/** A source linked to a claim or a pattern, with the passage that bears on it. */
export interface Evidence {
  id: ID;
  source: SourceRef;
  stance: Stance;
  /** Claims only; patterns count instances and counter-cases. */
  kind?: EvidenceKind;
  /** The exact passage. */
  excerpt: string;
  note?: string;
  addedBy: Origin;
  addedAt: ISODateTime;
}

/** How a claim says one factor changes another. */
export type Effect = 'raises' | 'lowers' | 'triggers' | 'enables' | 'constrains' | 'sustains';

/** Proposals from the analysis stay off the map until the person adopts them. */
export type ClaimState = 'suggested' | 'adopted' | 'set_aside';

/** The person's own view, kept apart from what the evidence supports. */
export type View = 'agree' | 'unsure' | 'disagree';

/**
 * An explanatory claim: "changing A changes B". Always a hypothesis with a
 * status derived from its evidence; the label never upgrades its basis.
 */
export interface Claim {
  id: ID;
  code: number;
  from: ID;
  /** Only together with these: joint conditions. */
  with: ID[];
  to: ID;
  effect: Effect;
  /** How, in words: the mechanism. */
  via?: string;
  /** When it holds, e.g. "in deadline weeks". */
  when?: string;
  /** Typical delay, e.g. "2–6 weeks". */
  lag?: string;
  author: Origin;
  state: ClaimState;
  view?: { stance: View; note?: string; at: ISODateTime };
  evidence: Evidence[];
  /** Competing explanations of the same effect. */
  rivalIds: ID[];
  /** People change: a claim can stop holding. */
  retired?: { at: ISODate; note?: string };
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/**
 * Derived from a claim's evidence (see `domain/claims.ts`), never typed in:
 * proposed → plausible (an instance and a mechanism) → supported (repeated,
 * with a contrast) → tested (a deliberate change produced the predicted
 * difference); weakened by counter-evidence or a failed test; retired when
 * it stopped holding.
 */
export type ClaimStatus = 'proposed' | 'plausible' | 'supported' | 'tested' | 'weakened' | 'retired';

/** What kind of knowledge something is. Everything in the Atlas carries one. */
export type Knowledge = 'recorded' | 'declared' | 'observed' | 'claimed' | 'tested' | 'imagined' | 'suggested';

/** A neutral description of what a note reports, before any interpretation. */
export interface Observation {
  id: ID;
  statement: string;
  /** Why the observation was made: matched phrases, metadata, counts. */
  basis: string;
}

export interface StrategicImplication {
  id: ID;
  statement: string;
  pathIds: ID[];
}

export type PatternKind = 'behavioral' | 'cognitive' | 'decision';
export type PatternVerdict = 'resonates' | 'partial' | 'inaccurate';
/** Derived from a pattern's instances over time. */
export type Regularity = 'emerging' | 'recurring' | 'fading';

export interface PatternStep {
  label: string;
  /** The element the step refers to, when there is one. */
  elementId?: ID;
}

/**
 * A regularity in history: something that keeps happening. It describes;
 * explanations of why it happens are claims (`explainedBy`).
 */
export interface Pattern {
  id: ID;
  /** Display code, e.g. 7 → "Pattern 07". */
  code: number;
  kind: PatternKind;
  title: string;
  steps: PatternStep[];
  observation: string;
  triggers: string[];
  behaviors: string[];
  consequences: string[];
  /** Instances (supports) and counter-cases (counters). */
  evidence: Evidence[];
  /** Claims that may explain why it happens. */
  explainedBy: ID[];
  implications: StrategicImplication[];
  areas: AreaKey[];
  nodeIds: ID[];
  /** Phrases the analysis layer uses to find new instances. Shown to the person. */
  cues: { supports: string[]; counters: string[] };
  /** The person's view. It never changes what the evidence shows. */
  userAssessment?: { verdict: PatternVerdict; note?: string; at: ISODateTime };
  /** Set aside by the person: kept for reference, no longer informs paths. */
  setAside?: { at: ISODateTime; note?: string };
  /** Stable key for analysis candidates, so a re-run doesn't duplicate a pattern. */
  signature?: string;
  origin: Origin;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Possibility and plans                                               */
/* ------------------------------------------------------------------ */

export interface CurrentState {
  position: string;
  summary: string;
  constraints: string[];
  assets: string[];
  updatedAt: ISODateTime;
}

export interface SkillRequirement {
  label: string;
  status: SkillStatus;
}

/** A possible direction. Paths are never ranked; they are described comparably. */
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
  /** Claims the path relies on; their status shows how solid it is. */
  assumptionIds: ID[];
  /** Ideas for tests that are not yet designed. */
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
  /** What else changed that was not the target. */
  sideEffects?: string;
  recordedAt: ISODateTime;
}

/**
 * A test: change one factor on purpose, keep recording, compare with the
 * prediction made beforehand. The result becomes intervention evidence on
 * the claim being tested.
 */
export interface Experiment {
  id: ID;
  code: number;
  title: string;
  hypothesis: string;
  design: string;
  durationDays: number;
  startDate?: ISODate;
  status: ExperimentStatus;
  /** The link being tested. */
  claimId?: ID;
  /** Written before starting: what should happen if the claim holds. */
  prediction?: string;
  /** What would count as "it didn't work". */
  criteria?: string;
  /** How things were before, for comparison. */
  baseline?: string;
  measures: Measure[];
  result?: ExperimentResult;
  patternIds: ID[];
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

/** The planned layer for one chosen path. */
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
  | { id: ID; type: 'link_node'; nodeId: ID; reason: string; state: SuggestionState }
  | {
      id: ID;
      type: 'pattern_evidence';
      patternId: ID;
      stance: Stance;
      excerpt: string;
      matched: string[];
      reason: string;
      state: SuggestionState;
    }
  | { id: ID; type: 'area'; area: AreaKey; reason: string; state: SuggestionState }
  | {
      /** "This note reports…": a happening to add to history. */
      id: ID;
      type: 'occurrence';
      kind: OccurrenceKind;
      label: string;
      about: ID[];
      instanceOf?: ID;
      excerpt: string;
      reason: string;
      state: SuggestionState;
    }
  | {
      /** The note explains something in its own words: the person's hypothesis, not evidence of the cause. */
      id: ID;
      type: 'attribution';
      excerpt: string;
      reason: string;
      state: SuggestionState;
    };

/** The persisted output of reading one note. */
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
  | 'pattern_set_aside'
  | 'experiment_result'
  | 'direction_set'
  | 'claim_added'
  | 'claim_adopted'
  | 'claim_view'
  | 'claim_retired'
  | 'element_adopted'
  | 'investigation_concluded';

/** An append-only log of how the understanding changed and why. */
export interface ModelUpdate {
  id: ID;
  at: ISODateTime;
  kind: ModelUpdateKind;
  summary: string;
  patternId?: ID;
  claimId?: ID;
  /** Status before and after, where one changed. */
  before?: string;
  after?: string;
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
  claim: number;
}

export interface AtlasData {
  profile: Profile;
  areas: Record<AreaKey, Area>;
  /** Elements of the map. */
  nodes: Record<ID, AtlasNode>;
  /** Declared links between elements. */
  edges: Record<ID, AtlasEdge>;
  claims: Record<ID, Claim>;
  occurrences: Record<ID, Occurrence>;
  entries: Record<ID, Entry>;
  decisions: Record<ID, Decision>;
  patterns: Record<ID, Pattern>;
  paths: Record<ID, StrategicPath>;
  experiments: Record<ID, Experiment>;
  currentState: CurrentState;
  navigation: NavigationPlan | null;
  modelLog: ModelUpdate[];
  counters: Counters;
  /** Names the person gave to loops (loops themselves are derived from claims). */
  loopNames: Record<string, string>;
}

/** The two graphs: the whole map, and the network of claims. */
export type GraphLayer = 'orbit' | 'network';

/** Anything the side panel can show. */
export type EntityKind = 'node' | 'area' | 'entry' | 'decision' | 'pattern' | 'experiment' | 'path' | 'claim' | 'occurrence' | 'loop';

export interface EntityRef {
  kind: EntityKind;
  id: ID;
}
