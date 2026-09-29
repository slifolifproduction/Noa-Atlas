import { t } from '../i18n';
import type {
  AreaKey,
  CaptureKind,
  ClaimStatus,
  Effect,
  ElementKind,
  EvidenceKind,
  ExperimentOutcome,
  ExperimentStatus,
  Knowledge,
  LayerKey,
  LinkType,
  Mode,
  OccurrenceKind,
  OutcomeRating,
  PatternKind,
  QuestionStatus,
  Regularity,
  SkillStatus,
  View,
} from './types';

/*
 * Colour is never the only carrier of meaning: every area, kind, effect and
 * status also has an icon, a line style or a text label. Area hues were
 * chosen so that neighbouring sectors stay distinguishable under protan and
 * deutan simulation (OKLab ΔE ≥ 8) and for full-colour vision (ΔE ≥ 15).
 */

/* ------------------------------------------------------------------ areas */

export interface AreaMeta {
  key: AreaKey;
  label: string;
  color: string;
  /** Sector angle in degrees; 0 = east, clockwise, -90 = north. The centre (self) has none. */
  angle: number;
  description: string;
}

export const AREAS: AreaMeta[] = [
  {
    key: 'self',
    get label() {
      return t('Self');
    },
    color: '#ece8df',
    angle: 0,
    get description() {
      return t('Who you take yourself to be and what matters to you: the centre everything else is read from.');
    },
  },
  {
    key: 'projects',
    get label() {
      return t('Projects');
    },
    color: '#c99d76',
    angle: -90,
    get description() {
      return t('Your own work: what you make and want to finish.');
    },
  },
  {
    key: 'work',
    get label() {
      return t('Work');
    },
    color: '#80a6e2',
    angle: -38.6,
    get description() {
      return t('How you earn: clients, roles, the trajectory of your work.');
    },
  },
  {
    key: 'money',
    get label() {
      return t('Money');
    },
    color: '#9fc27a',
    angle: 12.9,
    get description() {
      return t('Runway, income and what money makes possible or rules out.');
    },
  },
  {
    key: 'place',
    get label() {
      return t('Surroundings');
    },
    color: '#72bccb',
    angle: 64.3,
    get description() {
      return t('Where and when things happen: home, space, the shape of your days.');
    },
  },
  {
    key: 'people',
    get label() {
      return t('People');
    },
    color: '#e094b0',
    angle: 115.7,
    get description() {
      return t('The people who shape your choices and are shaped by them.');
    },
  },
  {
    key: 'health',
    get label() {
      return t('Health & energy');
    },
    color: '#e28a84',
    angle: 167.1,
    get description() {
      return t('Body, energy, rest: often the quiet cause of what happens elsewhere.');
    },
  },
  {
    key: 'growth',
    get label() {
      return t('Growth');
    },
    color: '#a99ee6',
    angle: 218.6,
    get description() {
      return t('Skills and learning: what you can do, and are learning to do.');
    },
  },
];

export const AREA_META = Object.fromEntries(AREAS.map((a) => [a.key, a])) as Record<AreaKey, AreaMeta>;
export const AREA_KEYS = AREAS.map((a) => a.key);
/** The sectors around the centre. */
export const SECTOR_KEYS = AREA_KEYS.filter((k) => k !== 'self');

export const areaHubId = (key: AreaKey) => `area:${key}`;
export const isAreaHubId = (id: string) => id.startsWith('area:');
export const areaHubKey = (id: string) => id.slice('area:'.length) as AreaKey;
/** The person at the centre of the map. */
export const YOU_ID = 'you';

/* ------------------------------------------------------------------ layers */

export interface LayerMeta {
  key: LayerKey;
  label: string;
  short: string;
  description: string;
}

export const LAYERS: LayerMeta[] = [
  {
    key: 'hold',
    get label() {
      return t('What I hold');
    },
    get short() {
      return t('Hold');
    },
    get description() {
      return t('Values, beliefs, fears, goals and open questions.');
    },
  },
  {
    key: 'do',
    get label() {
      return t('What I do');
    },
    get short() {
      return t('Do');
    },
    get description() {
      return t('Behaviours, commitments, skills and roles.');
    },
  },
  {
    key: 'around',
    get label() {
      return t('What surrounds me');
    },
    get short() {
      return t('Around');
    },
    get description() {
      return t('Conditions that change, people, resources and places.');
    },
  },
];

export const LAYER_META = Object.fromEntries(LAYERS.map((l) => [l.key, l])) as Record<LayerKey, LayerMeta>;

/** Orbit geometry: the person at the centre, then one ring per layer, then the area markers. */
export const CORE_RADIUS = 132;
export const LAYER_RADII: Record<LayerKey, number> = { hold: 270, do: 460, around: 640 };
export const AREA_MARKER_RADIUS = 800;

export interface OrbitGeometry {
  x: number;
  y: number;
  /** Uniform scale applied to all radii. */
  scale: number;
}
export const ORBIT_DESKTOP: OrbitGeometry = { x: 1, y: 1, scale: 1 };
export const ORBIT_PORTRAIT: OrbitGeometry = { x: 1, y: 1, scale: 0.62 };

/* ------------------------------------------------------------------ element kinds */

export interface KindMeta {
  key: ElementKind;
  layer: LayerKey;
  label: string;
  plural: string;
  description: string;
}

const kind = (key: ElementKind, layer: LayerKey, label: () => string, plural: () => string, description: () => string): KindMeta => ({
  key,
  layer,
  get label() {
    return label();
  },
  get plural() {
    return plural();
  },
  get description() {
    return description();
  },
});

export const KINDS: KindMeta[] = [
  kind(
    'value',
    'hold',
    () => t('Value'),
    () => t('Values'),
    () => t('What you protect when things compete.'),
  ),
  kind(
    'belief',
    'hold',
    () => t('Belief'),
    () => t('Beliefs'),
    () => t('A conviction about yourself, the world, or how things work. It shapes choices whether or not it is true.'),
  ),
  kind(
    'fear',
    'hold',
    () => t('Fear'),
    () => t('Fears'),
    () => t('Something you try to avoid, stated plainly.'),
  ),
  kind(
    'goal',
    'hold',
    () => t('Goal'),
    () => t('Goals'),
    () => t('A future state you are working toward.'),
  ),
  kind(
    'question',
    'hold',
    () => t('Question'),
    () => t('Questions'),
    () => t('Something you are still finding out.'),
  ),
  kind(
    'behaviour',
    'do',
    () => t('Behaviour'),
    () => t('Behaviours'),
    () => t('A recurring way of acting. Each time it happens is one instance of it.'),
  ),
  kind(
    'commitment',
    'do',
    () => t('Commitment'),
    () => t('Commitments'),
    () => t('A project or promise with a start and, ideally, an end.'),
  ),
  kind(
    'skill',
    'do',
    () => t('Skill'),
    () => t('Skills'),
    () => t('Something you can do, or are learning to do.'),
  ),
  kind(
    'role',
    'do',
    () => t('Role'),
    () => t('Roles'),
    () => t('A position you act from: freelancer, parent, lead.'),
  ),
  kind(
    'state',
    'around',
    () => t('State'),
    () => t('States'),
    () => t('A condition that goes up and down: energy, load, runway, progress.'),
  ),
  kind(
    'person',
    'around',
    () => t('Person'),
    () => t('People'),
    () => t('Someone who shapes your choices or is shaped by them.'),
  ),
  kind(
    'resource',
    'around',
    () => t('Resource'),
    () => t('Resources'),
    () => t('Something you can draw on: money, a network, tools, time.'),
  ),
  kind(
    'place',
    'around',
    () => t('Place'),
    () => t('Places'),
    () => t('Where things happen, and when.'),
  ),
];

export const KIND_META = Object.fromEntries(KINDS.map((k) => [k.key, k])) as Record<ElementKind, KindMeta>;
export const layerOf = (k: ElementKind): LayerKey => KIND_META[k].layer;
export const KINDS_BY_LAYER: Record<LayerKey, ElementKind[]> = {
  hold: KINDS.filter((k) => k.layer === 'hold').map((k) => k.key),
  do: KINDS.filter((k) => k.layer === 'do').map((k) => k.key),
  around: KINDS.filter((k) => k.layer === 'around').map((k) => k.key),
};

/* ------------------------------------------------------------------ links */

export interface LinkMeta {
  key: LinkType;
  verb: string;
  label: string;
  description: string;
  color: string;
  dash?: string;
  arrow: boolean;
}

export const LINKS: LinkMeta[] = [
  {
    key: 'aims_at',
    get verb() {
      return t('aims at');
    },
    get label() {
      return t('Aims at');
    },
    get description() {
      return t('Declared: A is meant to move B forward. Whether it does is a separate claim.');
    },
    color: '#7fbf8f',
    dash: '8 5',
    arrow: true,
  },
  {
    key: 'motivates',
    get verb() {
      return t('motivates');
    },
    get label() {
      return t('Motivates');
    },
    get description() {
      return t('Declared: A is a reason you give for B.');
    },
    color: '#d8b46c',
    dash: '8 5',
    arrow: true,
  },
  {
    key: 'conflicts',
    get verb() {
      return t('is in tension with');
    },
    get label() {
      return t('In tension');
    },
    get description() {
      return t('A and B pull in opposite directions or compete for the same time or money.');
    },
    color: '#d9a55a',
    dash: '3 4',
    arrow: false,
  },
  {
    key: 'aligns',
    get verb() {
      return t('aligns with');
    },
    get label() {
      return t('Aligns');
    },
    get description() {
      return t('A and B point the same way.');
    },
    color: '#8fb0e0',
    dash: '3 4',
    arrow: false,
  },
  {
    key: 'about',
    get verb() {
      return t('is about');
    },
    get label() {
      return t('About');
    },
    get description() {
      return t('A question or belief that concerns B.');
    },
    color: '#d894bd',
    dash: '1 3',
    arrow: true,
  },
  {
    key: 'part_of',
    get verb() {
      return t('is part of');
    },
    get label() {
      return t('Part of');
    },
    get description() {
      return t('A belongs inside B.');
    },
    color: 'rgba(200, 210, 222, 0.28)',
    dash: '1 4',
    arrow: false,
  },
];

export const LINK_META = Object.fromEntries(LINKS.map((l) => [l.key, l])) as Record<LinkType, LinkMeta>;

/* ------------------------------------------------------------------ effects (claims) */

export interface EffectMeta {
  key: Effect;
  /** +1: moves B the same way; -1: the opposite way. Used to read loops. */
  polarity: 1 | -1;
  label: string;
  /** Short arrow glyph for compact places. */
  glyph: string;
  color: string;
  description: string;
}

export const EFFECTS: EffectMeta[] = [
  {
    key: 'raises',
    polarity: 1,
    get label() {
      return t('Raises');
    },
    glyph: '↑',
    color: '#e0b27a',
    get description() {
      return t('More A tends to mean more B (or makes B more likely).');
    },
  },
  {
    key: 'lowers',
    polarity: -1,
    get label() {
      return t('Lowers');
    },
    glyph: '↓',
    color: '#8fb0e0',
    get description() {
      return t('More A tends to mean less B (or makes B less likely).');
    },
  },
  {
    key: 'triggers',
    polarity: 1,
    get label() {
      return t('Triggers');
    },
    glyph: '⚡',
    color: '#ece8df',
    get description() {
      return t('A sets B off, usually soon after.');
    },
  },
  {
    key: 'enables',
    polarity: 1,
    get label() {
      return t('Enables');
    },
    glyph: '◇',
    color: '#7fbf8f',
    get description() {
      return t('A makes B possible; without A, B is unlikely.');
    },
  },
  {
    key: 'constrains',
    polarity: -1,
    get label() {
      return t('Limits');
    },
    glyph: '⊣',
    color: '#e5827a',
    get description() {
      return t('A limits B or the options around it.');
    },
  },
  {
    key: 'sustains',
    polarity: 1,
    get label() {
      return t('Sustains');
    },
    glyph: '↻',
    color: '#c7a8e8',
    get description() {
      return t('A keeps B going once it has started.');
    },
  },
];

export const EFFECT_META = Object.fromEntries(EFFECTS.map((e) => [e.key, e])) as Record<Effect, EffectMeta>;

/**
 * How a claim reads in a sentence, hedged by its status: the language scales
 * with the evidence ("may raise" → "appears to raise" → "raises").
 */
export function effectPhrase(effect: Effect, status: ClaimStatus): string {
  const level = status === 'tested' ? 'tested' : status === 'supported' ? 'supported' : status === 'weakened' || status === 'retired' ? 'weak' : 'tentative';
  const phrases: Record<Effect, Record<typeof level, () => string>> = {
    raises: {
      tentative: () => t('may raise'),
      supported: () => t('appears to raise'),
      tested: () => t('raises'),
      weak: () => t('no longer seems to raise'),
    },
    lowers: {
      tentative: () => t('may lower'),
      supported: () => t('appears to lower'),
      tested: () => t('lowers'),
      weak: () => t('no longer seems to lower'),
    },
    triggers: {
      tentative: () => t('may trigger'),
      supported: () => t('appears to trigger'),
      tested: () => t('triggers'),
      weak: () => t('no longer seems to trigger'),
    },
    enables: {
      tentative: () => t('may make possible'),
      supported: () => t('appears to make possible'),
      tested: () => t('makes possible'),
      weak: () => t('no longer seems to make possible'),
    },
    constrains: {
      tentative: () => t('may limit'),
      supported: () => t('appears to limit'),
      tested: () => t('limits'),
      weak: () => t('no longer seems to limit'),
    },
    sustains: {
      tentative: () => t('may sustain'),
      supported: () => t('appears to sustain'),
      tested: () => t('sustains'),
      weak: () => t('no longer seems to sustain'),
    },
  };
  return phrases[effect][level]();
}

/* ------------------------------------------------------------------ claim status */

export interface StatusMeta {
  key: ClaimStatus;
  /** Position on the ladder, for ordering. */
  rank: number;
  label: string;
  description: string;
  /** Line style on the maps: tentative claims are dashed. */
  dash?: string;
  opacity: number;
}

export const CLAIM_STATUSES: StatusMeta[] = [
  {
    key: 'proposed',
    rank: 0,
    get label() {
      return t('Proposed');
    },
    get description() {
      return t('Stated, with no evidence yet.');
    },
    dash: '2 5',
    opacity: 0.55,
  },
  {
    key: 'plausible',
    rank: 1,
    get label() {
      return t('Plausible');
    },
    get description() {
      return t('At least one instance and a described mechanism.');
    },
    dash: '7 5',
    opacity: 0.75,
  },
  {
    key: 'supported',
    rank: 2,
    get label() {
      return t('Supported');
    },
    get description() {
      return t('Repeated across episodes, with at least one contrast case.');
    },
    opacity: 0.9,
  },
  {
    key: 'tested',
    rank: 3,
    get label() {
      return t('Tested');
    },
    get description() {
      return t('A deliberate change produced the predicted difference.');
    },
    opacity: 1,
  },
  {
    key: 'weakened',
    rank: -1,
    get label() {
      return t('Weakened');
    },
    get description() {
      return t('Counter-evidence or a failed test outweighs the support.');
    },
    dash: '1 4',
    opacity: 0.45,
  },
  {
    key: 'retired',
    rank: -2,
    get label() {
      return t('No longer holds');
    },
    get description() {
      return t('It held for a while, then stopped.');
    },
    dash: '1 6',
    opacity: 0.3,
  },
];

export const STATUS_META = Object.fromEntries(CLAIM_STATUSES.map((s) => [s.key, s])) as Record<ClaimStatus, StatusMeta>;
/** The ladder a claim climbs, in order. */
export const STATUS_LADDER: ClaimStatus[] = ['proposed', 'plausible', 'supported', 'tested'];

export const EVIDENCE_KIND_LABEL: Record<EvidenceKind, string> = {
  get instance() {
    return t('Instance');
  },
  get contrast() {
    return t('Contrast');
  },
  get counter_case() {
    return t('Counter-case');
  },
  get mechanism() {
    return t('Mechanism');
  },
  get intervention() {
    return t('Test result');
  },
};

export const EVIDENCE_KIND_HINT: Record<EvidenceKind, string> = {
  get instance() {
    return t('A time A came before B.');
  },
  get contrast() {
    return t('Without A (or with less of it), B did not happen.');
  },
  get counter_case() {
    return t('A without B, or B without A.');
  },
  get mechanism() {
    return t('A passage describing how A leads to B.');
  },
  get intervention() {
    return t('A was changed on purpose and B changed as predicted (or did not).');
  },
};

export const VIEW_LABEL: Record<View, string> = {
  get agree() {
    return t('Matches my experience');
  },
  get unsure() {
    return t('Not sure');
  },
  get disagree() {
    return t('Does not match');
  },
};

/* ------------------------------------------------------------------ knowledge, modes */

export const KNOWLEDGE_LABEL: Record<Knowledge, string> = {
  get recorded() {
    return t('Recorded');
  },
  get declared() {
    return t('Declared by you');
  },
  get observed() {
    return t('Observed');
  },
  get claimed() {
    return t('Claimed');
  },
  get tested() {
    return t('Tested');
  },
  get imagined() {
    return t('Imagined');
  },
  get suggested() {
    return t('Suggested by analysis');
  },
};

export const KNOWLEDGE_HINT: Record<Knowledge, string> = {
  get recorded() {
    return t('In your own words, in a note or decision.');
  },
  get declared() {
    return t('True because you say so; needs no evidence.');
  },
  get observed() {
    return t('Computed from your records: counts, order, dates.');
  },
  get claimed() {
    return t('An explanation. Its status comes from the evidence.');
  },
  get tested() {
    return t('Checked by a deliberate change.');
  },
  get imagined() {
    return t('A possibility. Never evidence for anything.');
  },
  get suggested() {
    return t('Proposed by the analysis. Not on your map until you adopt it.');
  },
};

export const MODE_LABEL: Record<Mode, string> = {
  get actual() {
    return t('Happened');
  },
  get expected() {
    return t('Expected');
  },
  get planned() {
    return t('Planned');
  },
  get possible() {
    return t('Possible');
  },
};

export const OCCURRENCE_KIND_LABEL: Record<OccurrenceKind | 'decision' | 'record', string> = {
  get event() {
    return t('Event');
  },
  get action() {
    return t('Action');
  },
  get experience() {
    return t('Experience');
  },
  get reading() {
    return t('Reading');
  },
  get decision() {
    return t('Decision');
  },
  get record() {
    return t('Note');
  },
};

/* ------------------------------------------------------------------ capture */

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

/**
 * Some notes can also place something on the map (an element) or in history
 * (a landmark experience). The note itself always stays the record.
 */
export const CAPTURE_TARGET: Partial<Record<CaptureKind, { element?: ElementKind; occurrence?: 'experience' }>> = {
  goal: { element: 'goal' },
  project: { element: 'commitment' },
  habit: { element: 'behaviour' },
  experience: { occurrence: 'experience' },
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
 * Decision drivers: the reasons the person states. The analysis groups them
 * into a time horizon to look for decision patterns; the grouping is shown.
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

/* ------------------------------------------------------------------ labels */

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

export const REGULARITY_LABEL: Record<Regularity, string> = {
  get emerging() {
    return t('Emerging');
  },
  get recurring() {
    return t('Recurring');
  },
  get fading() {
    return t('Fading');
  },
};

export const REGULARITY_HINT: Record<Regularity, string> = {
  get emerging() {
    return t('Seen in fewer than three episodes so far.');
  },
  get recurring() {
    return t('Seen in three or more separate episodes.');
  },
  get fading() {
    return t('The latest records count against it, or it has not been seen for three months.');
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

/* ------------------------------------------------------------------ places and pages */

/** Every page: its short name, the question it answers, and one plain line about it. */
export const VIEWS = {
  orbit: {
    get label() {
      return t('Orbit');
    },
    get question() {
      return t('What is my life made of?');
    },
    get blurb() {
      return t('Everything that exists in your atlas, from you outward.');
    },
  },
  timeline: {
    get label() {
      return t('Timeline');
    },
    get question() {
      return t('What happened, and when?');
    },
    get blurb() {
      return t('Events, actions, decisions and readings, in order, each traced to its note.');
    },
  },
  journal: {
    get label() {
      return t('Journal');
    },
    get question() {
      return t('What did I write?');
    },
    get blurb() {
      return t('Your notes: the record everything else is read from.');
    },
  },
  decisions: {
    get label() {
      return t('Decisions');
    },
    get question() {
      return t('What did I choose, and what followed?');
    },
    get blurb() {
      return t('Each decision as a branch point: the options seen, the one lived, what followed.');
    },
  },
  network: {
    get label() {
      return t('Connections');
    },
    get question() {
      return t('What affects what?');
    },
    get blurb() {
      return t('Every claim about how one thing changes another, with how well it is supported.');
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
      return t('Regularities in your history, with the claims that may explain them.');
    },
  },
  questions: {
    get label() {
      return t('Questions');
    },
    get question() {
      return t('What am I trying to find out?');
    },
    get blurb() {
      return t('Why something happened, what would happen if something changed, and what only you can decide.');
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
      return t('Your chosen direction as concrete steps, and the tests that check your claims.');
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
      return t('Possible directions, compared side by side, with the claims each relies on.');
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
 * The four places in the top bar, one per layer of the atlas: what exists,
 * what happened, what is understood, and what is planned or possible.
 */
export const GROUPS = [
  {
    key: 'map',
    get label() {
      return t('Map');
    },
    get question() {
      return t('What exists');
    },
    views: ['orbit'],
  },
  {
    key: 'history',
    get label() {
      return t('History');
    },
    get question() {
      return t('What happened');
    },
    views: ['timeline', 'journal', 'decisions'],
  },
  {
    key: 'understanding',
    get label() {
      return t('Understanding');
    },
    get question() {
      return t('How it seems to work');
    },
    views: ['network', 'patterns', 'questions'],
  },
  {
    key: 'plan',
    get label() {
      return t('Plan');
    },
    get question() {
      return t('What could change');
    },
    views: ['navigation', 'paths'],
  },
] as const satisfies readonly { key: string; label: string; question: string; views: readonly ViewKey[] }[];

export type GroupKey = (typeof GROUPS)[number]['key'];
export const groupOf = (view: ViewKey) => GROUPS.find((g) => (g.views as readonly ViewKey[]).includes(view));
