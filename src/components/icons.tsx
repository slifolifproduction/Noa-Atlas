import { forwardRef, type ReactNode } from 'react';
import type { LucideIcon, LucideProps } from 'lucide-react';
import type { CaptureKind, DomainKey, MindCategory } from '../domain/types';

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

export const DOMAIN_ICONS: Record<DomainKey, LucideIcon> = {
  identity: Identity,
  values: CutStone('values'),
  goals: Target('goals'),
  career: Career,
  skills: Skills,
  projects: Frame('projects'),
  finance: Finance,
  relationships: Relationships,
  environment: Environment,
  habits: Cycle('habits'),
};

/* ---------------------------------------------------------------- kinds of thought */

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

export const CATEGORY_ICONS: Record<MindCategory, LucideIcon> = {
  // A working conviction: an anchor, reduced to its lines.
  belief: mark(
    'belief',
    <>
      <circle cx="12" cy="5.5" r="2" />
      <path d="M12 7.5v12.5M8.5 10.5h7M5 13.5a7 7 0 0 0 14 0" />
    </>,
  ),
  // Untested: a circle not yet closed.
  assumption: mark('assumption', <circle cx="12" cy="12" r="7.5" strokeDasharray="2.4 2.6" />),
  // What pulls you: a flame.
  motivation: mark(
    'motivation',
    <path d="M12 20.5c-3.4 0-6-2.4-6-5.7 0-3.3 2.6-5.1 3.6-9.3 2.1 1.5 3.3 3.5 3.3 5.6.9-.8 1.5-2 1.6-3.2 2 1.8 3.5 4.2 3.5 6.9 0 3.3-2.6 5.7-6 5.7Z" />,
  ),
  // What you guard against: a shield.
  fear: mark(
    'fear',
    <>
      <path d="M12 3.5 19 6.5v5.2c0 4.3-2.9 7.3-7 8.8-4.1-1.5-7-4.5-7-8.8V6.5Z" />
      <path d="M12 8.5v4.5" {...faint} />
    </>,
  ),
  value: CutStone('value'),
  // A way of reasoning: a lattice of three ideas.
  mental_model: mark(
    'mental_model',
    <>
      <path d="M12 7.5 7.2 16M12 7.5l4.8 8.5M7.5 17.5h9" {...faint} />
      <circle cx="12" cy="6" r="2.2" />
      <circle cx="6.2" cy="17.5" r="2.2" />
      <circle cx="17.8" cy="17.5" r="2.2" />
    </>,
  ),
  decision: Decision,
  // Still open: a question set in its circle.
  question: mark(
    'question',
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2.9-1.2 1.8v.4" />
      {dot(12, 16.8, 1.1)}
    </>,
  ),
  experience: Experience,
};

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
  notes: Journal,
  patterns: PatternIcon,
  // Plan: a heading on a compass.
  plan: mark(
    'plan',
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M15.2 8.8 13.3 13.3 8.8 15.2l1.9-4.5Z" />
    </>,
  ),
} satisfies Record<string, LucideIcon>;
