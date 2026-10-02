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
  /** What the Atlas connected on its own when the note was saved (see domain/weave), so each part can be undone. */
  woven?: Woven;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Steps and targets a note said were finished, ticked off from it; and the ones you took back, never ticked again from it. */
export interface Woven {
  parts: ID[];
  declined?: ID[];
  /** The area it was put in, from what it is about. */
  area?: AreaKey;
  /** The decision it said was made, logged from it; or that you took that back, so it is not logged again. */
  decision?: ID;
  decisionDeclined?: boolean;
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

/**
 * What a record says about a factor at that time: that it went up or down,
 * was high or low, happened or did not. "Not recorded" is never one of these:
 * a factor nothing says anything about is unknown, not absent.
 */
export type FactorReading = 'up' | 'down' | 'high' | 'low' | 'present' | 'absent';

/**
 * How what a record says came to be known. The Atlas never sees what really
 * happened, only what was recorded; these say how far from it a record is:
 *
 *   felt      experienced from inside (energy, mood, a fear rising)
 *   noticed   observed: something done, something that happened
 *   counted   tallied or measured (commitments running, pages written)
 *
 * An inference is never a channel of its own: what the Atlas reads from a
 * record (a level against the usual, an episode's background) says so in its
 * trace, and what it merely suggests stays a suggestion until confirmed.
 */
export type Channel = 'felt' | 'noticed' | 'counted';

/** What changed: a factor (a state or behaviour element) and what the record says about it. */
export interface FactorChange {
  factor: ID;
  reads: FactorReading;
  /** A level on the factor's scale, when one was given. */
  level?: number;
  /** How it was known, when the person says (otherwise read from the kind of factor and happening). */
  channel?: Channel;
}

/**
 * A prediction written down before its window: what should happen to a
 * factor, by when, and what it follows from. Kept apart from history (the
 * occurrence carrying it is in the "expected" mode) and checked against what
 * is recorded in the window.
 */
export interface Expectation {
  /** The claims it follows from. One claim: a direct check of it. Several: a chain, checked together. */
  basis: ID[];
  /** The person's own verdict, when they give one; otherwise it is read from what was recorded. */
  verdict?: { outcome: 'held' | 'failed' | 'unobserved'; note?: string; at: ISODateTime };
}

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
  /** The trail back to the record it was read from (for an expectation: the test or decision it belongs to). */
  source?: SourceRef;
  excerpt?: string;
  /** What changed, according to the record. */
  changes?: FactorChange[];
  /**
   * Which episode it belongs to, when the person says so. Records that share
   * a key are one episode; a key of its own keeps it apart. Otherwise
   * episodes are read from dates, records and shared elements.
   */
  episode?: string;
  /** Expected mode only: the prediction. */
  expectation?: Expectation;
  mode: Mode;
  origin: Origin;
  createdAt: ISODateTime;
}

/* ------------------------------------------------------------------ */
/* Understanding                                                       */
/* ------------------------------------------------------------------ */

/**
 * Where a piece of evidence points. `neutral` is for what bears on the outcome
 * without bearing on this explanation: the outcome happening without the
 * factor shows that something else can bring it about, not that the factor
 * does not.
 */
export type Stance = 'supports' | 'counters' | 'neutral';

/**
 * What a piece of evidence establishes about a claim ("A may contribute to B").
 * The kind matters more than the count, and every kind is counted per episode:
 *
 *   instance      A, then B: in that order (dated records, or one passage that tells the sequence)
 *   contrast      without A, B did not happen either
 *   counter_case  an exception: A was there and B did not follow
 *   mechanism     the "how" seen happening, not only described
 *   intervention  a deliberate change and the prediction written before it (a test)
 *   elsewhere     B happened without A: another route to B, not a case against A
 */
export type EvidenceKind = 'instance' | 'contrast' | 'counter_case' | 'mechanism' | 'intervention' | 'elsewhere' | 'analysis';

/** A source linked to a claim or a pattern, with the passage that bears on it. */
export interface Evidence {
  id: ID;
  source: SourceRef;
  stance: Stance;
  /** Claims only; patterns count instances and counter-cases. */
  kind?: EvidenceKind;
  /**
   * Instances drawn from history: the record showing the factor, when `source`
   * shows the outcome. Its date comes first; the gap is the lag.
   */
  cause?: SourceRef;
  /** The exact passage. */
  excerpt: string;
  note?: string;
  /** Carried over from the version of the claim this one revises. */
  carriedFrom?: ID;
  /**
   * Analysis only: a formal comparison, run only when the record was ready
   * for it (see `domain/readiness.ts`), with the method and what it assumed.
   * It feeds the same status ladder; it never makes a claim "tested".
   */
  method?: { name: string; assumptions: string[] };
  addedBy: Origin;
  addedAt: ISODateTime;
}

/**
 * How a claim says a factor may contribute to another. Each effect is one
 * role (what part it plays) with one direction (more or less of the outcome):
 * raises (adds to it), lowers (holds it back), triggers (sets it off),
 * enables (a condition that makes it possible), constrains (a condition that
 * limits it), sustains (keeps it going). See EFFECT_META.
 */
export type Effect = 'raises' | 'lowers' | 'triggers' | 'enables' | 'constrains' | 'sustains';

/** The part a contributor plays in an outcome. */
export type CausalRole = 'trigger' | 'condition' | 'contributor' | 'maintainer' | 'buffer';

/** Proposals from the analysis stay off the map until the person adopts them. */
export type ClaimState = 'suggested' | 'adopted' | 'set_aside';

/** The person's own view, kept apart from what the evidence supports. */
export type View = 'agree' | 'unsure' | 'disagree';

/**
 * An explanatory claim: "a change in A may contribute to a change in B".
 * Always a hypothesis with a status derived from its evidence; the label never
 * upgrades its basis. It is about factors: when an end is a whole thing (a
 * project, a belief, a person), `aspect` names what about it changes, so the
 * thing itself is not made the cause.
 */
export interface Claim {
  id: ID;
  code: number;
  from: ID;
  /** What about each end changes, e.g. "scope added late", "being active". */
  aspect?: { from?: string; to?: string };
  /** Only together with these: joint conditions. */
  with: ID[];
  to: ID;
  effect: Effect;
  /** How it may work, in words: an explanation to check, never evidence by itself. */
  via?: string;
  /** When it holds, in words, e.g. "in deadline weeks". */
  when?: string;
  /** When it holds, as a factor the record can check: "only when afternoons are interrupted". */
  condition?: { factor: ID; reads: FactorReading };
  /**
   * Where else it is bounded. A relationship need not hold everywhere: it can
   * hold only under further conditions, only for a stretch of time (true
   * then, whether or not it still is), and at its own timescale.
   */
  scope?: ClaimScope;
  /** Typical delay, e.g. "2–6 weeks". */
  lag?: string;
  author: Origin;
  state: ClaimState;
  view?: { stance: View; note?: string; at: ISODateTime };
  evidence: Evidence[];
  /** Competing explanations of the same effect. */
  rivalIds: ID[];
  /** People change: a claim can stop holding, or be revised into a new version. */
  retired?: { at: ISODate; note?: string; revisedInto?: ID };
  /** The earlier version this claim revises. The earlier one stays, retired, with its evidence. */
  revises?: ID;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** A condition the record can check. */
export interface Condition {
  factor: ID;
  reads: FactorReading;
}

/**
 * The bounds of a claim beyond its first condition.
 *
 *   also       further conditions, all of which must hold
 *   from/until the stretch of time it is about (e.g. "before the move")
 *   timescale  acute: one change, then the effect within the delay;
 *              cumulative: the cause kept up over several episodes, the
 *              effect building over the delay
 */
export interface ClaimScope {
  also?: Condition[];
  from?: ISODate;
  until?: ISODate;
  timescale?: 'acute' | 'cumulative';
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
  /** The element this measures, so the test can read it from history. */
  factor?: ID;
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
  /** The day it was marked done (older plans have none). */
  doneAt?: ISODate;
  /** Dates it had before, that passed with something still open (Quests: the boss got away), with how far it had got. */
  missed?: MissedDate[];
}

/** A date that passed before the work was done, kept when a new date is set. */
export interface MissedDate {
  due: ISODate;
  done: number;
  total: number;
}

export type NavActionStatus = 'todo' | 'done' | 'skipped';

export interface NavAction {
  id: ID;
  title: string;
  targetId?: ID;
  /** Monday of the week this action belongs to. */
  week: ISODate;
  status: NavActionStatus;
  /** The day it was marked done (older plans have none). */
  doneAt?: ISODate;
}

/** The planned layer for one chosen path. */
export interface NavigationPlan {
  pathId: ID;
  committedAt: ISODate;
  position: string;
  objective: { title: string; description: string; targetDate: ISODate };
  experimentId?: ID;
  milestone: { title: string; due: ISODate; missed?: MissedDate[] };
  targets: NavTarget[];
  actions: NavAction[];
  currentActionId?: ID;
}

/* ------------------------------------------------------------------ */
/* Analysis records                                                    */
/* ------------------------------------------------------------------ */

export type SuggestionState = 'pending' | 'accepted' | 'dismissed';

/** What taking a suggestion made, so it can be taken back exactly. */
export interface SuggestionMade {
  occurrence?: ID;
  /** The happening a change was added to (rather than one made for it). */
  host?: ID;
  evidence?: ID;
  claim?: ID;
}

export type AnalysisSuggestion = (
  | {
      id: ID;
      type: 'link_node';
      nodeId: ID;
      reason: string;
      /** The sentence that means it, when the local AI found it by meaning rather than by name. */
      excerpt?: string;
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
      /** The explanation as a claim, when an element is named on each side: offered, never taken on its own. */
      claim?: { from: ID; to: ID; effect: Effect };
      state: SuggestionState;
    }
  | {
      /** "This note says a factor went up, went down, happened or did not": what changed, kept with the note's happening. */
      id: ID;
      type: 'change';
      factor: ID;
      reads: FactorReading;
      excerpt: string;
      reason: string;
      state: SuggestionState;
    }
  | {
      /** "This note expects something": a prediction to check later, never history. */
      id: ID;
      type: 'expectation';
      factor: ID;
      reads: FactorReading;
      /** Days from the note until it should show. */
      within: number;
      excerpt: string;
      reason: string;
      state: SuggestionState;
    }
) & {
  /** Taken by the Atlas on its own when the note was saved, not by you. */
  auto?: boolean;
  /**
   * Read by meaning (the local AI's language model), not from the note's own words. Offered, never taken on its own,
   * except a link: it only says what the note is about, and taking it back teaches the model.
   */
  inferred?: boolean;
  made?: SuggestionMade;
};

/** The persisted output of reading one note. */
export interface EntryAnalysis {
  generatedAt: ISODateTime;
  provider: string;
  observations: Observation[];
  suggestions: AnalysisSuggestion[];
  /** What the local AI read in each sentence (src/ml), when it read the note. */
  readings?: SentenceReading[];
  /** What it read that the weave acts on directly: steps it says are finished, a sentence that makes a choice. */
  hints?: { finished?: { id: ID; excerpt: string }[]; decided?: string };
}

/** One sentence as the local AI read it: an answer per head, and how sure it was (0–1). */
export interface SentenceReading {
  text: string;
  labels: { act: string; direction: string; cause: string; time: string; mood: string };
  sure: { act: number; direction: number; cause: number; time: number; mood: number };
  by: 'lite' | 'model';
  /** The questions you corrected it on (it reads them as you said). */
  taught?: string[];
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
  | 'claim_edited'
  | 'claim_revised'
  | 'expectation_added'
  | 'expectation_checked'
  | 'element_adopted'
  | 'investigation_concluded'
  /** Derived: a claim's status moved because of what was recorded, not because you edited it. */
  | 'status_changed'
  /** Derived: something counted against a claim (an exception, a failed prediction or test), whether or not its status moved. */
  | 'challenged'
  /** Derived: another way to read an outcome was set aside, or opened again, by what was recorded. */
  | 'account_changed'
  | 'rule_changed'
  | 'learning_forgotten';

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
  /** The rule of the logic that produced the status after (see `domain/trace.ts`), and its version. */
  rule?: string;
  logicVersion?: number;
}

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

export interface Profile {
  name: string;
  since: ISODate;
  /** Set on an example atlas (data/examples): which one it is. An atlas of the person's own has none. */
  example?: string;
  /** The language an example is written in ('id' when not set: the first examples were only in Indonesian). */
  exampleLang?: 'en' | 'id';
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
  /**
   * What the Atlas last believed about each claim and each outcome's other
   * readings, so that a change in belief is logged with what caused it (see
   * `domain/beliefs.ts`). Derived; kept only to compare against.
   */
  beliefs?: BeliefLedger;
  /** Checks the Atlas asked for and the person declined, with the day: not asked again for a while. */
  inquiry?: { declined: Record<string, ISODate> };
  /** What the Atlas learned from the person (see `domain/learning.ts`); created on first use. */
  learning?: LearningMemory;
  /** Quests (see `domain/quests.ts`): what stands in each boss's way, and the skills raised with level points. Everything else there is derived. */
  quests?: QuestState;
  /**
   * Which revision of the logic of causes the data was prepared for
   * (3: claims on factors, episodes in order; 4: what changed, episodes,
   * expectations and revisions).
   */
  causesLogic?: number;
}

/** A boss's armor plate: a repeat (Repeats) or a cycle (Causes) the person says stands in its way. */
export interface ArmorRef {
  kind: 'pattern' | 'loop';
  /** A pattern id, or a cycle's id (its claim ids, sorted, joined by "|"). */
  id: string;
}

/** A skill raised one step with a level point, on a day, after practice was written about. */
export interface SkillUpgrade {
  id: ID;
  nodeId: ID;
  from: SkillStatus;
  to: SkillStatus;
  at: ISODate;
}

export interface QuestState {
  /** By boss: "milestone", or "target:<id>". */
  armor: Record<string, ArmorRef[]>;
  upgrades: SkillUpgrade[];
  /**
   * Quests you started yourself outside a plan (there is none, or you kept it
   * apart): a target with a date and its steps, in the same shape as the
   * plan's, so everything that reads targets and steps reads these too.
   */
  own?: { targets: NavTarget[]; actions: NavAction[] };
}

/** What the Atlas learned from the person: plain counts, all of them shown and forgettable (see `domain/learning.ts`). */
export interface LearningMemory {
  since: ISODate;
  /** Per kind of suggestion: how often it was taken and set aside. */
  suggestions: Partial<Record<AnalysisSuggestion['type'], { taken: number; dismissed: number }>>;
  /** Element → word → notes linked to the element that used the word. */
  words: Record<ID, Record<string, number>>;
  /** Word → linked notes that used it, whatever they were linked to. */
  wordNotes: Record<string, number>;
  /** Word–element pairs the person asked to forget ("element:word"). */
  forgotten: string[];
  /** Rules the person changed after seeing how predictions went. */
  rules: { supportedEpisodes?: number; since?: ISODate };
  /** Kinds of question put away. */
  declined: Partial<Record<'reread' | 'ask' | 'compare' | 'track' | 'test', number>>;
  /** Searches that found nothing, most recent last. */
  friction: { q: string; where: string; n: number; last: ISODate }[];
  /** What the local AI learned from you (src/ml): readings you corrected, and sentences you linked to an element or took a link back from. */
  ml?: {
    /** [sentence, head index, answer index] */
    corrections: [string, number, number][];
    links: Record<ID, { yes: string[]; no: string[] }>;
  };
}

export interface BeliefLedger {
  /** Per claim: its status, the rule behind it, and what counted against it (exceptions, failed predictions, failed tests or comparisons). */
  claims: Record<ID, { status: ClaimStatus; rule: string; against: [number, number, number] }>;
  /** Per outcome: each other reading and whether it is still open. */
  accounts: Record<ID, Record<string, 'open' | 'set_aside'>>;
}

/** The two graphs: the whole map, and the network of claims. */
export type GraphLayer = 'orbit' | 'network';

/** Anything the side panel can show. */
export type EntityKind = 'node' | 'area' | 'entry' | 'decision' | 'pattern' | 'experiment' | 'path' | 'claim' | 'occurrence' | 'loop';

export interface EntityRef {
  kind: EntityKind;
  id: ID;
}
