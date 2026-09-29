import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import type { AreaKey, CaptureKind, ElementKind } from '../domain/types';

/**
 * The atlas's own marks, drawn like the symbols on an astronomical chart:
 * hairline geometry on a 24-unit grid, no fills except a single point where a
 * mark needs a centre. Areas of life, kinds of thought, patterns and kinds of
 * note all come from this one family, so a thing looks the same on the map,
 * in the panel and in search.
 *
 * Each mark is a drop-in for a Lucide icon (same props), so the rest of the
 * interface can use them interchangeably with the plain UI icons.
 */
function mark(name: string, body: ReactNode): LucideIcon {
  const Mark = forwardRef<SVGSVGElement, LucideProps>(function Mark(
    { size = 24, color = 'currentColor', strokeWidth = 1.5, absoluteStrokeWidth, className, children: _children, ...rest },
    ref,
  ) {
    const width = absoluteStrokeWidth ? (Number(strokeWidth) * 24) / Number(size) : strokeWidth;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        color={color}
        stroke="currentColor"
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        {...rest}
      >
        {body}
      </svg>
    );
  });
  Mark.displayName = `Mark(${name})`;
  return Mark as unknown as LucideIcon;
}

const dot = (cx: number, cy: number, r = 1.4) => <circle cx={cx} cy={cy} r={r} fill="currentColor" stroke="none" />;
const faint = { opacity: 0.55 };

/* ---------------------------------------------------------------- areas of life */

const Identity = mark(
  'identity',
  <>
    <circle cx="12" cy="12" r="7.5" />
    {dot(12, 12, 1.6)}
  </>,
);
const CutStone = (name: string) =>
  mark(
    name,
    <>
      <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
      <path d="M3.5 12h17" {...faint} />
    </>,
  );
const Target = (name: string) =>
  mark(
    name,
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.2" />
      {dot(12, 12, 1.2)}
    </>,
  );
const Career = mark(
  'career',
  <>
    <path d="M3.5 18.5 9.5 12.5 13 15.5 20 7" />
    <path d="M15.5 7H20v4.5" />
  </>,
);
const Frame = (name: string) =>
  mark(
    name,
    <>
      <rect x="4.5" y="4.5" width="15" height="15" />
      <path d="M4.5 13.5h15" />
      <path d="M8 17h3" {...faint} />
    </>,
  );
const Skills = mark(
  'skills',
  <>
    <path d="M12 4 20.5 19H3.5Z" />
    <path d="M7.4 13h9.2" {...faint} />
  </>,
);
const Finance = mark(
  'finance',
  <>
    <ellipse cx="12" cy="7.5" rx="7" ry="3" />
    <path d="M5 7.5v9c0 1.66 3.13 3 7 3s7-1.34 7-3v-9" />
    <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" {...faint} />
  </>,
);
const Relationships = mark(
  'relationships',
  <>
    <circle cx="9" cy="12" r="5.5" />
    <circle cx="15" cy="12" r="5.5" />
  </>,
);
const Environment = mark(
  'environment',
  <>
    <path d="M3 16.5h18" />
    <path d="M6.5 16.5a5.5 5.5 0 0 1 11 0" />
    <path d="M12 5.5v2.5M5.2 8.7l1.6 1.6M18.8 8.7l-1.6 1.6" {...faint} />
  </>,
);
const Cycle = (name: string) =>
  mark(
    name,
    <>
      <path d="M19 12a7 7 0 1 1-3.5-6.06" />
      <path d="M12.5 5.94h3L14 3.34" />
    </>,
  );
// Health and energy: a pulse across a level line.
const Pulse = mark(
  'health',
  <>
    <path d="M3.5 12.5h4l2-5 3.5 10 2.2-5H20.5" />
  </>,
);
// Growth: a stem putting out two leaves.
const Sprout = mark(
  'growth',
  <>
    <path d="M12 20.5V10" />
    <path d="M12 13.5c0-3.3-2.4-5.5-6.5-5.5 0 3.3 2.4 5.5 6.5 5.5Z" />
    <path d="M12 10.5c0-3.6 2.3-6 6.5-6 0 3.6-2.3 6-6.5 6Z" {...faint} />
  </>,
);

export const AREA_ICONS: Record<AreaKey, LucideIcon> = {
  self: Identity,
  work: Career,
  projects: Frame('projects'),
  money: Finance,
  people: Relationships,
  health: Pulse,
  place: Environment,
  growth: Sprout,
};

/* ---------------------------------------------------------------- kinds of element */

const Decision = mark(
  'decision',
  <>
    <path d="M12 20.5V13M12 13 6.5 5.5M12 13l5.5-7.5" />
    {dot(6.5, 5.5)}
    {dot(17.5, 5.5)}
  </>,
);
const Experience = mark(
  'experience',
  <>
    <path d="M7 20.5V3.5" />
    <path d="M7 4.5h10l-2.4 3.3L17 11H7" />
  </>,
);
// A level on a dial: a state that is read over time.
const Gauge = (name: string) =>
  mark(
    name,
    <>
      <path d="M4 16.5a8 8 0 0 1 16 0" />
      <path d="M12 16.5 15.8 11" />
      {dot(12, 16.5, 1.3)}
    </>,
  );

/** One mark per kind of element, shared by the map, the panel and search. */
export const KIND_ICONS: Record<ElementKind, LucideIcon> = {
  value: CutStone('value'),
  // A working conviction: an anchor, reduced to its lines.
  belief: mark(
    'belief',
    <>
      <circle cx="12" cy="5.5" r="2" />
      <path d="M12 7.5v12.5M8.5 10.5h7M5 13.5a7 7 0 0 0 14 0" />
    </>,
  ),
  // What you guard against: a shield.
  fear: mark(
    'fear',
    <>
      <path d="M12 3.5 19 6.5v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5Z" />
      <path d="M12 8.5v4.5" {...faint} />
    </>,
  ),
  goal: Target('goal'),
  // Still open: a question set in its circle.
  question: mark(
    'question',
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8v.4" />
      {dot(12, 16.8, 1.1)}
    </>,
  ),
  behaviour: Cycle('behaviour'),
  commitment: Frame('commitment'),
  skill: Skills,
  // A role: a badge on its clip.
  role: mark(
    'role',
    <>
      <rect x="5" y="7.5" width="14" height="12" rx="1" />
      <path d="M9.5 7.5V4.5h5v3" />
      <circle cx="12" cy="12.5" r="2" />
      <path d="M8.5 17h7" {...faint} />
    </>,
  ),
  state: Gauge('state'),
  person: mark(
    'person',
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </>,
  ),
  // Something to draw on: a crate.
  resource: mark(
    'resource',
    <>
      <path d="M4 8 12 4l8 4v8l-8 4-8-4Z" />
      <path d="M4 8l8 4 8-4M12 12v8" {...faint} />
    </>,
  ),
  place: mark(
    'place',
    <>
      <path d="M12 20.5s-6-5.6-6-10.5a6 6 0 0 1 12 0c0 4.9-6 10.5-6 10.5Z" />
      <circle cx="12" cy="10" r="2" />
    </>,
  ),
};

/** An assumption: a circle not yet closed. */
export const AssumptionIcon = mark('assumption', <circle cx="12" cy="12" r="7.5" strokeDasharray="2.4 2.6" />);

/** A claim: one thing acting on another. */
export const ClaimIcon = mark(
  'claim',
  <>
    <circle cx="5.5" cy="12" r="2.2" />
    <path d="M8 12h10.5" />
    <path d="M15.5 8.8 18.8 12l-3.3 3.2" />
  </>,
);

/** A loop: effects that come back around. */
export const LoopIcon = mark(
  'loop',
  <>
    <path d="M17.5 9.5A6.5 6.5 0 1 0 18 14" />
    <path d="M18.5 5.8v4h-4" />
    {dot(12, 12, 1.2)}
  </>,
);

/** A happening on the timeline: a moment with its rays. */
const EventMark = mark(
  'event',
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" {...faint} />
  </>,
);
const ActionMark = mark(
  'action',
  <>
    <path d="M4 12h14" />
    <path d="M14 7.5 18.5 12 14 16.5" />
    {dot(4.5, 12, 1.3)}
  </>,
);
const StepMark = mark(
  'step',
  <>
    <rect x="4.5" y="4.5" width="15" height="15" />
    <path d="M8.5 12.2 11 14.7l4.5-5" />
  </>,
);

/* ---------------------------------------------------------------- patterns and notes */
/* ---------------------------------------------------------------- patterns and notes */

/** A pattern: the hexagon it wears on the Mind map. */
export const PatternIcon = mark(
  'pattern',
  <>
    <path d="M12 3.5 19.4 7.75v8.5L12 20.5 4.6 16.25v-8.5Z" />
    {dot(12, 12, 1.4)}
  </>,
);

/** An experiment: a flask, with a line for the level being tested. */
export const ExperimentIcon = mark(
  'experiment',
  <>
    <path d="M9.5 3.5h5M10.5 3.5v6L5 19.5h14l-5.5-10v-6" />
    <path d="M7.4 15h9.2" {...faint} />
  </>,
);

const Journal = mark(
  'journal',
  <>
    <path d="M6.5 3.5h8l3 3v14h-11Z" />
    <path d="M9 11h6M9 14.5h6" {...faint} />
  </>,
);

export const CAPTURE_ICONS: Record<CaptureKind, LucideIcon> = {
  journal: Journal,
  decision: Decision,
  // Looking back: a phase, half turned toward the light.
  reflection: mark(
    'reflection',
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M12 4.5a7.5 7.5 0 0 1 0 15" {...faint} />
      <path d="M12 4.5v15" />
    </>,
  ),
  experience: Experience,
  problem: mark(
    'problem',
    <>
      <path d="M12 4 20.5 19.5h-17Z" />
      <path d="M12 10v4.5" />
      {dot(12, 17, 1.1)}
    </>,
  ),
  // Noticing: an eye.
  observation: mark(
    'observation',
    <>
      <path d="M2.8 12s3.3-6 9.2-6 9.2 6 9.2 6-3.3 6-9.2 6-9.2-6-9.2-6Z" />
      <circle cx="12" cy="12" r="2.3" />
    </>,
  ),
  goal: Target('goal'),
  project: Frame('project'),
  habit: Cycle('habit'),
};

/** Every kind of item on the timeline. */
export const HISTORY_ICONS = {
  event: EventMark,
  action: ActionMark,
  experience: Experience,
  reading: Gauge('reading'),
  decision: Decision,
  record: Journal,
  test: ExperimentIcon,
  step: StepMark,
} satisfies Record<string, LucideIcon>;

export const DecisionIcon = Decision;
export const JournalIcon = Journal;

/* ---------------------------------------------------------------- the four places */

export const PLACE_ICONS = {
  // Map: a small orbit around a centre.
  map: mark(
    'map',
    <>
      <circle cx="12" cy="12" r="8" {...faint} />
      <circle cx="12" cy="12" r="3.2" />
      {dot(18.9, 8, 1.6)}
    </>,
  ),
  // History: a line of time with moments on it.
  history: mark(
    'history',
    <>
      <path d="M3.5 12h17" />
      {dot(7, 12, 1.6)}
      <circle cx="12.5" cy="12" r="2" />
      {dot(17.5, 12, 1.6)}
      <path d="M7 8v-2M12.5 8V5M17.5 8v-2" {...faint} />
    </>,
  ),
  // Understanding: three ideas and what connects them.
  understanding: mark(
    'understanding',
    <>
      <path d="M12 7.5 7.2 16M12 7.5l4.8 8.5M7.5 17.5h9" {...faint} />
      <circle cx="12" cy="6" r="2.2" />
      <circle cx="6.2" cy="17.5" r="2.2" />
      <circle cx="17.8" cy="17.5" r="2.2" />
    </>,
  ),
  // Plan: a heading on a compass.
  plan: mark(
    'plan',
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8 13.3 13.3 8.8 15.2l1.9-4.5Z" />
    </>,
  ),
  notes: Journal,
  patterns: PatternIcon,
} satisfies Record<string, LucideIcon>;
