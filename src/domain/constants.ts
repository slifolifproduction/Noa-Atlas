import type {
  CaptureKind,
  DomainKey,
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
  0: 'Self',
  1: 'Intent',
  2: 'Work',
  3: 'Conditions',
};

export const RING_RADII: Record<Ring, number> = { 0: 0, 1: 230, 2: 430, 3: 620 };
/** Orbit rings are ellipses: wide on desktop, tall and compact on phones. */
export interface OrbitGeometry {
  x: number;
  y: number;
  /** Uniform scale applied to ring radii and satellite distance. */
  scale: number;
}
export const ORBIT_DESKTOP: OrbitGeometry = { x: 1.2, y: 0.9, scale: 1 };
export const ORBIT_PORTRAIT: OrbitGeometry = { x: 0.75, y: 1.5, scale: 0.585 };
export const RING_STRETCH = ORBIT_DESKTOP;

export const DOMAINS: DomainMeta[] = [
  {
    key: 'identity',
    label: 'Identity',
    color: '#e6e0d0',
    ring: 0,
    angle: 0,
    description: 'Who you take yourself to be, and which of those self-descriptions the evidence supports.',
  },
  { key: 'values', label: 'Values', color: '#d6a531', ring: 1, angle: -55, description: 'What you protect when things compete.' },
  { key: 'goals', label: 'Goals', color: '#2fb383', ring: 1, angle: -112, description: 'Outcomes you are deliberately working toward.' },
  { key: 'career', label: 'Career', color: '#5b9ae8', ring: 2, angle: -10, description: 'How you earn, and the trajectory of your work.' },
  { key: 'projects', label: 'Projects', color: '#e0773f', ring: 2, angle: -165, description: 'Active commitments with a defined output.' },
  { key: 'skills', label: 'Skills', color: '#9a90ee', ring: 2, angle: 152, description: 'Capabilities you have, are building, or lack.' },
  { key: 'finance', label: 'Finance', color: '#6aa84f', ring: 3, angle: 30, description: 'Runway, income structure, and financial constraints.' },
  { key: 'relationships', label: 'Relationships', color: '#de6f98', ring: 3, angle: 70, description: 'The people who shape and are shaped by your choices.' },
  { key: 'environment', label: 'Environment', color: '#4fb8cf', ring: 3, angle: 110, description: 'Where and when work happens; the conditions around it.' },
  { key: 'habits', label: 'Habits', color: '#ea7373', ring: 3, angle: 136, description: 'Recurring behaviours that compound, for better or worse.' },
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
  { key: 'value', label: 'Value', plural: 'Values', color: '#d6a531', angle: -90, description: 'What you protect when things compete.' },
  { key: 'question', label: 'Question', plural: 'Questions', color: '#de6f98', angle: -50, description: 'Open questions you are actively examining.' },
  {
    key: 'assumption',
    label: 'Assumption',
    plural: 'Assumptions',
    color: '#4fb8cf',
    angle: -10,
    description: 'Things taken as true that have not been tested.',
  },
  { key: 'fear', label: 'Fear', plural: 'Fears', color: '#ea7373', angle: 30, description: 'Outcomes you try to avoid, stated plainly.' },
  { key: 'belief', label: 'Belief', plural: 'Beliefs', color: '#5b9ae8', angle: 70, description: 'Working convictions about how things are.' },
  { key: 'motivation', label: 'Motivation', plural: 'Motivations', color: '#6aa84f', angle: 110, description: 'What pulls you toward action.' },
  { key: 'mental_model', label: 'Mental model', plural: 'Mental models', color: '#9a90ee', angle: 150, description: 'Frameworks you reason with.' },
  { key: 'experience', label: 'Experience', plural: 'Experiences', color: '#e0773f', angle: 190, description: 'Events that shaped your thinking.' },
  { key: 'decision', label: 'Decision', plural: 'Decisions', color: '#2fb383', angle: 230, description: 'Choices, mirrored from the decision log.' },
];

export const CATEGORY_META = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<MindCategory, CategoryMeta>;
export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);

/** Derived pattern nodes in the Mind graph. */
export const PATTERN_COLOR = '#e6e0d0';

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
  { key: 'causes', verb: 'causes', label: 'Causes', color: '#cfd5dc', width: 1.6, arrow: true, description: 'A directly produces B.' },
  {
    key: 'influences',
    verb: 'influences',
    label: 'Influences',
    color: '#8b96a2',
    width: 1.25,
    arrow: true,
    description: 'A shapes B without fully determining it.',
  },
  { key: 'supports', verb: 'supports', label: 'Supports', color: '#7fbf8f', width: 1.4, arrow: true, description: 'A reinforces or enables B.' },
  {
    key: 'conflicts',
    verb: 'conflicts with',
    label: 'Conflicts with',
    color: '#e39a52',
    dash: '6 4',
    width: 1.4,
    arrow: false,
    description: 'A and B pull in opposite directions.',
  },
  {
    key: 'contradicts',
    verb: 'contradicts',
    label: 'Contradicts',
    color: '#ec7d74',
    dash: '2 3',
    width: 1.5,
    arrow: true,
    description: 'A is evidence against B.',
  },
  {
    key: 'derived_from',
    verb: 'is derived from',
    label: 'Derived from',
    color: '#8fb0e0',
    dash: '0.5 4',
    width: 1.8,
    arrow: true,
    description: 'A originates in B.',
  },
  { key: 'depends_on', verb: 'depends on', label: 'Depends on', color: '#9aa6b4', dash: '10 4', width: 1.25, arrow: true, description: 'A requires B.' },
  {
    key: 'examines',
    verb: 'examines',
    label: 'Examines',
    color: '#d894bd',
    dash: '1 3',
    width: 1.25,
    arrow: true,
    description: 'A question that interrogates B.',
  },
  {
    key: 'part_of',
    verb: 'is part of',
    label: 'Part of',
    color: 'rgba(200, 210, 222, 0.16)',
    width: 1,
    arrow: false,
    description: 'Structural membership in a domain.',
  },
];

export const RELATION_META = Object.fromEntries(RELATIONS.map((r) => [r.key, r])) as Record<RelationType, RelationMeta>;
/** Relations a user can draw between nodes. */
export const SEMANTIC_RELATIONS = RELATIONS.filter((r) => r.key !== 'part_of');

export const CAPTURE_KINDS: { key: CaptureKind; label: string; hint: string }[] = [
  { key: 'journal', label: 'Journal', hint: 'What happened, what you noticed.' },
  { key: 'decision', label: 'Decision', hint: 'A choice, the options, and what you expect.' },
  { key: 'reflection', label: 'Reflection', hint: 'Looking back at something with distance.' },
  { key: 'experience', label: 'Experience', hint: 'An event that shaped your thinking.' },
  { key: 'problem', label: 'Problem', hint: 'Something that is not working.' },
  { key: 'observation', label: 'Observation', hint: 'A neutral note about your behaviour.' },
  { key: 'goal', label: 'Goal', hint: 'An outcome you are working toward.' },
  { key: 'project', label: 'Project', hint: 'A commitment with a defined output.' },
  { key: 'habit', label: 'Habit', hint: 'A recurring behaviour to track.' },
];

export const CAPTURE_KIND_LABEL = Object.fromEntries(CAPTURE_KINDS.map((k) => [k.key, k.label])) as Record<CaptureKind, string>;

/** Entry kinds that can optionally also create a node on a map. */
export const CAPTURE_NODE_TARGET: Partial<Record<CaptureKind, { domain?: DomainKey; category?: MindCategory }>> = {
  goal: { domain: 'goals' },
  project: { domain: 'projects' },
  habit: { domain: 'habits' },
  experience: { category: 'experience' },
  decision: { category: 'decision' },
};

export const MOOD_LABELS: Record<string, string> = {
  '-2': 'Very low',
  '-1': 'Low',
  '0': 'Neutral',
  '1': 'Good',
  '2': 'Very good',
};

export const ENERGY_LABELS: Record<string, string> = {
  '1': 'Depleted',
  '2': 'Low',
  '3': 'Steady',
  '4': 'Good',
  '5': 'High',
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

export const OUTCOME_RATING_LABEL: Record<OutcomeRating, string> = {
  better: 'Better than expected',
  as_expected: 'As expected',
  mixed: 'Mixed',
  worse: 'Worse than expected',
};

export const PATTERN_KIND_LABEL: Record<PatternKind, string> = {
  behavioral: 'Behavioural',
  cognitive: 'Cognitive',
  decision: 'Decision',
};

export const PATTERN_STATUS_LABEL: Record<PatternStatus, string> = {
  emerging: 'Emerging',
  active: 'Active',
  weakening: 'Weakening',
  dismissed: 'Dismissed',
};

export const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  open: 'Open',
  exploring: 'Exploring',
  resolved: 'Resolved',
};

export const EXPERIMENT_STATUS_LABEL: Record<ExperimentStatus, string> = {
  proposed: 'Proposed',
  running: 'Running',
  completed: 'Completed',
  abandoned: 'Abandoned',
};

export const SKILL_STATUS_LABEL: Record<SkillStatus, string> = {
  have: 'Have',
  developing: 'Developing',
  gap: 'Gap',
};

/** The five questions the interface keeps answering, one per primary section. */
export const SECTIONS = [
  { key: 'orbit', num: '01', label: 'Orbit', question: 'Where am I?', blurb: 'Life domains and how they connect.' },
  { key: 'mind', num: '02', label: 'Mind', question: 'How am I thinking?', blurb: 'Beliefs, assumptions and the links between them.' },
  { key: 'patterns', num: '03', label: 'Patterns', question: 'What patterns are emerging?', blurb: 'Recurring behaviour, with the evidence behind it.' },
  { key: 'paths', num: '04', label: 'Paths', question: 'What options exist?', blurb: 'Strategic scenarios, compared without ranking.' },
  { key: 'navigation', num: '05', label: 'Navigation', question: 'What should I test next?', blurb: 'From a chosen direction to the next action.' },
] as const;

export type SectionKey = (typeof SECTIONS)[number]['key'];
