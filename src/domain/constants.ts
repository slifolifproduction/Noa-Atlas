import { t } from '../i18n';
import type {
  CaptureKind,
  DomainKey,
  ExperimentOutcome,
  ExperimentStatus,
  MindCategory,
  OutcomeRating,
  PatternKind,
  PatternStatus,
  QuestionStatus,
  RelationType,
  SkillStatus,
} from './types';

/*
 * Colour is never the only carrier of meaning: every domain and category also
 * has an icon and a text label. The hues were chosen so that neighbours in the
 * spatial layout stay distinguishable under protan/deutan simulation
 * (OKLab ΔE ≥ 8) and for full-colour vision (ΔE ≥ 15).
 */

export type Ring = 0 | 1 | 2 | 3;

export interface DomainMeta {
  key: DomainKey;
  label: string;
  color: string;
  /** 0 = self (centre), 1 = intent, 2 = work, 3 = conditions. */
  ring: Ring;
  /** Angle in degrees on its ring; 0 = east, clockwise, -90 = north. */
  angle: number;
  description: string;
}

export const RING_LABELS: Record<Ring, string> = {
  get 0() {
    return t('Self');
  },
  get 1() {
    return t('Intent');
  },
  get 2() {
    return t('Work');
  },
  get 3() {
    return t('Conditions');
  },
};

export const RING_RADII: Record<Ring, number> = { 0: 0, 1: 230, 2: 430, 3: 620 };
/** Orbit rings are true circles; phones use a smaller scale so the whole system fits the width. */
export interface OrbitGeometry {
  x: number;
  y: number;
  /** Uniform scale applied to ring radii and satellite distance. */
  scale: number;
}
export const ORBIT_DESKTOP: OrbitGeometry = { x: 1, y: 1, scale: 1 };
export const ORBIT_PORTRAIT: OrbitGeometry = { x: 1, y: 1, scale: 0.66 };

export const DOMAINS: DomainMeta[] = [
  {
    key: 'identity',
    get label() {
      return t('Identity');
    },
    color: '#ece8df',
    ring: 0,
    angle: 0,
    get description() {
      return t('Who you take yourself to be, and which of those self-descriptions the evidence supports.');
    },
  },
  {
    key: 'values',
    get label() {
      return t('Values');
    },
    color: '#d8b46c',
    ring: 1,
    angle: -55,
    get description() {
      return t('What you protect when things compete.');
    },
  },
  {
    key: 'goals',
    get label() {
      return t('Goals');
    },
    color: '#6cbf9c',
    ring: 1,
    angle: -112,
    get description() {
      return t('Outcomes you are deliberately working toward.');
    },
  },
  {
    key: 'career',
    get label() {
      return t('Career');
    },
    color: '#80a6e2',
    ring: 2,
    angle: -10,
    get description() {
      return t('How you earn, and the trajectory of your work.');
    },
  },
  {
    key: 'projects',
    get label() {
      return t('Projects');
    },
    color: '#c99d76',
    ring: 2,
    angle: -165,
    get description() {
      return t('Active commitments with a defined output.');
    },
  },
  {
    key: 'skills',
    get label() {
      return t('Skills');
    },
    color: '#a99ee6',
    ring: 2,
    angle: 152,
    get description() {
      return t('Capabilities you have, are building, or lack.');
    },
  },
  {
    key: 'finance',
    get label() {
      return t('Finance');
    },
    color: '#9fc27a',
    ring: 3,
    angle: 30,
    get description() {
      return t('Runway, income structure, and financial constraints.');
    },
  },
  {
    key: 'relationships',
    get label() {
      return t('Relationships');
    },
    color: '#e094b0',
    ring: 3,
    angle: 70,
    get description() {
      return t('The people who shape and are shaped by your choices.');
    },
  },
  {
    key: 'environment',
    get label() {
      return t('Environment');
    },
    color: '#72bccb',
    ring: 3,
    angle: 110,
    get description() {
      return t('Where and when work happens; the conditions around it.');
    },
  },
  {
    key: 'habits',
    get label() {
      return t('Habits');
    },
    color: '#e28a84',
    ring: 3,
    angle: 136,
    get description() {
      return t('Recurring behaviours that compound, for better or worse.');
    },
  },
];

export const DOMAIN_META = Object.fromEntries(DOMAINS.map((d) => [d.key, d])) as Record<DomainKey, DomainMeta>;
export const DOMAIN_KEYS = DOMAINS.map((d) => d.key);

export const hubId = (key: DomainKey) => `domain:${key}`;
export const isHubId = (id: string) => id.startsWith('domain:');
export const hubKey = (id: string) => id.slice('domain:'.length) as DomainKey;

export interface CategoryMeta {
  key: MindCategory;
  label: string;
  plural: string;
  color: string;
  /** Cluster anchor angle for the Mind layout. */
  angle: number;
  description: string;
}

/** Ordered as the clusters sit around the Mind graph. */
export const CATEGORIES: CategoryMeta[] = [
  {
    key: 'value',
    get label() {
      return t('Value');
    },
    get plural() {
      return t('Values');
    },
    color: '#d8b46c',
    angle: -90,
    get description() {
      return t('What you protect when things compete.');
    },
  },
  {
    key: 'question',
    get label() {
      return t('Question');
    },
    get plural() {
      return t('Questions');
    },
    color: '#e094b0',
    angle: -50,
    get description() {
      return t('Open questions you are actively examining.');
    },
  },
  {
    key: 'assumption',
    get label() {
      return t('Assumption');
    },
    get plural() {
      return t('Assumptions');
    },
    color: '#72bccb',
    angle: -10,
    get description() {
      return t('Things taken as true that have not been tested.');
    },
  },
  {
    key: 'fear',
    get label() {
      return t('Fear');
    },
    get plural() {
      return t('Fears');
    },
    color: '#e28a84',
    angle: 30,
    get description() {
      return t('Outcomes you try to avoid, stated plainly.');
    },
  },
  {
    key: 'belief',
    get label() {
      return t('Belief');
    },
    get plural() {
      return t('Beliefs');
    },
    color: '#80a6e2',
    angle: 70,
    get description() {
      return t('Working convictions about how things are.');
    },
  },
  {
    key: 'motivation',
    get label() {
      return t('Motivation');
    },
    get plural() {
      return t('Motivations');
    },
    color: '#9fc27a',
    angle: 110,
    get description() {
      return t('What pulls you toward action.');
    },
  },
  {
    key: 'mental_model',
    get label() {
      return t('Mental model');
    },
    get plural() {
      return t('Mental models');
    },
    color: '#a99ee6',
    angle: 150,
    get description() {
      return t('Frameworks you reason with.');
    },
  },
  {
    key: 'experience',
    get label() {
      return t('Experience');
    },
    get plural() {
      return t('Experiences');
    },
    color: '#c99d76',
    angle: 190,
    get description() {
      return t('Events that shaped your thinking.');
    },
  },
  {
    key: 'decision',
    get label() {
      return t('Decision');
    },
    get plural() {
      return t('Decisions');
    },
    color: '#6cbf9c',
    angle: 230,
    get description() {
      return t('Choices, mirrored from the decision log.');
    },
  },
];

export const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<MindCategory, CategoryMeta>;
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/** Derived pattern nodes in the Mind graph. */
export const PATTERN_COLOR = '#ece8df';

export interface RelationMeta {
  key: RelationType;
  /** Verb phrase used in sentences: "A causes B". */
  verb: string;
  label: string;
  color: string;
  /** SVG stroke-dasharray, or undefined for solid. */
  dash?: string;
  width: number;
  arrow: boolean;
  description: string;
}

export const RELATIONS: RelationMeta[] = [
  {
    key: 'causes',
    get verb() {
      return t('causes');
    },
    get label() {
      return t('Causes');
    },
    color: '#cfd5dc',
    width: 1.6,
    arrow: true,
    get description() {
      return t('A directly produces B.');
    },
  },
  {
    key: 'influences',
    get verb() {
      return t('influences');
    },
    get label() {
      return t('Influences');
    },
    color: '#8b96a2',
    width: 1.25,
    arrow: true,
    get description() {
      return t('A shapes B without fully determining it.');
    },
  },
  {
    key: 'supports',
    get verb() {
      return t('supports');
    },
    get label() {
      return t('Supports');
    },
    color: '#7fbf8f',
    width: 1.4,
    arrow: true,
    get description() {
      return t('A reinforces or enables B.');
    },
  },
  {
    key: 'conflicts',
    get verb() {
      return t('conflicts with');
    },
    get label() {
      return t('Conflicts with');
    },
    color: '#d9a55a',
    dash: '6 4',
    width: 1.4,
    arrow: false,
    get description() {
      return t('A and B pull in opposite directions.');
    },
  },
  {
    key: 'contradicts',
    get verb() {
      return t('contradicts');
    },
    get label() {
      return t('Contradicts');
    },
    color: '#e5827a',
    dash: '2 3',
    width: 1.5,
    arrow: true,
    get description() {
      return t('A is evidence against B.');
    },
  },
  {
    key: 'derived_from',
    get verb() {
      return t('is derived from');
    },
    get label() {
      return t('Derived from');
    },
    color: '#8fb0e0',
    dash: '0.5 4',
    width: 1.8,
    arrow: true,
    get description() {
      return t('A originates in B.');
    },
  },
  {
    key: 'depends_on',
    get verb() {
      return t('depends on');
    },
    get label() {
      return t('Depends on');
    },
    color: '#9aa6b4',
    dash: '10 4',
    width: 1.25,
    arrow: true,
    get description() {
      return t('A requires B.');
    },
  },
  {
    key: 'examines',
    get verb() {
      return t('examines');
    },
    get label() {
      return t('Examines');
    },
    color: '#d894bd',
    dash: '1 3',
    width: 1.25,
    arrow: true,
    get description() {
      return t('A question that interrogates B.');
    },
  },
  {
    key: 'part_of',
    get verb() {
      return t('is part of');
    },
    get label() {
      return t('Part of');
    },
    color: 'rgba(200, 210, 222, 0.16)',
    width: 1,
    arrow: false,
    get description() {
      return t('Structural membership in a domain.');
    },
  },
];

export const RELATION_META = Object.fromEntries(RELATIONS.map((r) => [r.key, r])) as Record<RelationType, RelationMeta>;
/** Relations a user can draw between nodes. */
export const SEMANTIC_RELATIONS = RELATIONS.filter((r) => r.key !== 'part_of');

export const CAPTURE_KINDS: { key: CaptureKind; label: string; hint: string }[] = [
  {
    key: 'journal',
    get label() {
      return t('Journal');
    },
    get hint() {
      return t('What happened, what you noticed.');
    },
  },
  {
    key: 'decision',
    get label() {
      return t('Decision');
    },
    get hint() {
      return t('A choice, the options, and what you expect.');
    },
  },
  {
    key: 'reflection',
    get label() {
      return t('Reflection');
    },
    get hint() {
      return t('Looking back at something with distance.');
    },
  },
  {
    key: 'experience',
    get label() {
      return t('Experience');
    },
    get hint() {
      return t('An event that shaped your thinking.');
    },
  },
  {
    key: 'problem',
    get label() {
      return t('Problem');
    },
    get hint() {
      return t('Something that is not working.');
    },
  },
  {
    key: 'observation',
    get label() {
      return t('Observation');
    },
    get hint() {
      return t('A neutral note about your behaviour.');
    },
  },
  {
    key: 'goal',
    get label() {
      return t('Goal');
    },
    get hint() {
      return t('An outcome you are working toward.');
    },
  },
  {
    key: 'project',
    get label() {
      return t('Project');
    },
    get hint() {
      return t('A commitment with a defined output.');
    },
  },
  {
    key: 'habit',
    get label() {
      return t('Habit');
    },
    get hint() {
      return t('A recurring behaviour to track.');
    },
  },
];

export const CAPTURE_KIND_LABEL = Object.defineProperties(
  {},
  Object.fromEntries(CAPTURE_KINDS.map((k) => [k.key, { get: () => k.label, enumerable: true }])),
) as Record<CaptureKind, string>;

/** Entry kinds that can optionally also create a node on a map. */
export const CAPTURE_NODE_TARGET: Partial<Record<CaptureKind, { domain?: DomainKey; category?: MindCategory }>> = {
  goal: { domain: 'goals' },
  project: { domain: 'projects' },
  habit: { domain: 'habits' },
  experience: { category: 'experience' },
  decision: { category: 'decision' },
};

export const MOOD_LABELS: Record<string, string> = {
  get '-2'() {
    return t('Very low');
  },
  get '-1'() {
    return t('Low');
  },
  get '0'() {
    return t('Neutral');
  },
  get '1'() {
    return t('Good');
  },
  get '2'() {
    return t('Very good');
  },
};

export const ENERGY_LABELS: Record<string, string> = {
  get '1'() {
    return t('Depleted');
  },
  get '2'() {
    return t('Low');
  },
  get '3'() {
    return t('Steady');
  },
  get '4'() {
    return t('Good');
  },
  get '5'() {
    return t('High');
  },
};

export const EMOTION_OPTIONS = ['calm', 'excited', 'anxious', 'frustrated', 'proud', 'scattered', 'relieved', 'uncertain', 'tired', 'focused'];

/**
 * Decision drivers. The analysis layer groups them into a time horizon to look
 * for decision patterns; the grouping is shown to the user, not hidden.
 */
export const DRIVERS = [
  'Income',
  'Opportunity',
  'Visibility',
  'Security',
  'Relationships',
  'Learning',
  'Wellbeing',
  'Focus',
  'Craft',
  'Autonomy',
  'Long-term growth',
] as const;

export const DRIVER_HORIZON: Record<string, 'immediate' | 'long_term' | 'neutral'> = {
  Income: 'immediate',
  Opportunity: 'immediate',
  Visibility: 'immediate',
  Security: 'neutral',
  Relationships: 'neutral',
  Learning: 'neutral',
  Wellbeing: 'neutral',
  Focus: 'long_term',
  Craft: 'long_term',
  Autonomy: 'long_term',
  'Long-term growth': 'long_term',
};

/** How an experiment's result reads in a sentence ("… result recorded (inconclusive)"). */
export const EXPERIMENT_OUTCOME_LABEL: Record<ExperimentOutcome, string> = {
  get supports() {
    return t('supported');
  },
  get contradicts() {
    return t('contradicted');
  },
  get inconclusive() {
    return t('inconclusive');
  },
};

export const OUTCOME_RATING_LABEL: Record<OutcomeRating, string> = {
  get better() {
    return t('Better than expected');
  },
  get as_expected() {
    return t('As expected');
  },
  get mixed() {
    return t('Mixed');
  },
  get worse() {
    return t('Worse than expected');
  },
};

export const PATTERN_KIND_LABEL: Record<PatternKind, string> = {
  get behavioral() {
    return t('Behavioural');
  },
  get cognitive() {
    return t('Cognitive');
  },
  get decision() {
    return t('Decision');
  },
};

export const PATTERN_STATUS_LABEL: Record<PatternStatus, string> = {
  get emerging() {
    return t('Emerging');
  },
  get active() {
    return t('Active');
  },
  get weakening() {
    return t('Weakening');
  },
  get dismissed() {
    return t('Dismissed');
  },
};

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  get open() {
    return t('Open');
  },
  get exploring() {
    return t('Exploring');
  },
  get resolved() {
    return t('Resolved');
  },
};

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  get proposed() {
    return t('Proposed');
  },
  get running() {
    return t('Running');
  },
  get completed() {
    return t('Completed');
  },
  get abandoned() {
    return t('Abandoned');
  },
};

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  get have() {
    return t('Have');
  },
  get developing() {
    return t('Developing');
  },
  get gap() {
    return t('Gap');
  },
};

/** Every page: its short name, the question it answers, and one plain line about it. */
export const VIEWS = {
  orbit: {
    get label() {
      return t('Orbit');
    },
    get question() {
      return t('Where am I?');
    },
    get blurb() {
      return t('Your areas of life at a glance.');
    },
  },
  mind: {
    get label() {
      return t('Mind');
    },
    get question() {
      return t('How am I thinking?');
    },
    get blurb() {
      return t('Your beliefs, fears and questions, and how they connect.');
    },
  },
  journal: {
    get label() {
      return t('Journal');
    },
    get question() {
      return t('What happened?');
    },
    get blurb() {
      return t('Everything you have written, newest first.');
    },
  },
  decisions: {
    get label() {
      return t('Decisions');
    },
    get question() {
      return t('What did I decide?');
    },
    get blurb() {
      return t('Decisions with what you expected and what actually happened.');
    },
  },
  questions: {
    get label() {
      return t('Questions');
    },
    get question() {
      return t('What am I still asking?');
    },
    get blurb() {
      return t('Questions worth keeping open instead of answering too early.');
    },
  },
  patterns: {
    get label() {
      return t('Patterns');
    },
    get question() {
      return t('What keeps happening?');
    },
    get blurb() {
      return t('Things that repeat in your notes, with the evidence.');
    },
  },
  navigation: {
    get label() {
      return t('My plan');
    },
    get question() {
      return t('What do I do next?');
    },
    get blurb() {
      return t('Your chosen direction as concrete steps.');
    },
  },
  paths: {
    get label() {
      return t('Options');
    },
    get question() {
      return t('What are my options?');
    },
    get blurb() {
      return t('Possible directions, compared side by side.');
    },
  },
  settings: {
    get label() {
      return t('Settings');
    },
    get question() {
      return t('Settings');
    },
    get blurb() {
      return t('Your data, the look of the map, and the analysis.');
    },
  },
} as const;

export type ViewKey = keyof typeof VIEWS;

/**
 * The four places in the top bar. Pages that belong together share one
 * place and switch with tabs, so there is little to learn.
 */
export const GROUPS = [
  {
    key: 'map',
    get label() {
      return t('Map');
    },
    get question() {
      return t('Where am I, and how am I thinking?');
    },
    views: ['orbit', 'mind'],
  },
  {
    key: 'notes',
    get label() {
      return t('Notes');
    },
    get question() {
      return t('What happened, what I decided, what I am still asking.');
    },
    views: ['journal', 'decisions', 'questions'],
  },
  {
    key: 'patterns',
    get label() {
      return t('Patterns');
    },
    get question() {
      return t('What keeps happening?');
    },
    views: ['patterns'],
  },
  {
    key: 'plan',
    get label() {
      return t('Plan');
    },
    get question() {
      return t('What are my options, and what do I do next?');
    },
    views: ['navigation', 'paths'],
  },
] as const satisfies readonly { key: string; label: string; question: string; views: readonly ViewKey[] }[];

export type GroupKey = (typeof GROUPS)[number]['key'];
export const groupOf = (view: ViewKey) => GROUPS.find((g) => (g.views as readonly ViewKey[]).includes(view));
