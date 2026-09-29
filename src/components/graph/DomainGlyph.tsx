import type { DomainKey } from '../../domain/types';

/**
 * One family of marks for the ten areas of life, drawn like the symbols on an
 * astronomical chart: hairline geometry on a 24-unit grid, no fills except a
 * single point where a mark needs a centre.
 */
const GLYPHS: Record<DomainKey, React.ReactNode> = {
  // The self: a body and its centre (the old sun sign).
  identity: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  // What you protect: a cut stone.
  values: (
    <>
      <path d="M12 3.5 20.5 12 12 20.5 3.5 12Z" />
      <path d="M3.5 12h17" opacity="0.55" />
    </>
  ),
  // Aims: a target.
  goals: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  // Trajectory: a rising path.
  career: (
    <>
      <path d="M3.5 18.5 9.5 12.5 13 15.5 20 7" />
      <path d="M15.5 7H20v4.5" />
    </>
  ),
  // Work in hand: a frame, filled up to a line.
  projects: (
    <>
      <rect x="4.5" y="4.5" width="15" height="15" />
      <path d="M4.5 13.5h15" />
      <path d="M8 17h3" opacity="0.55" />
    </>
  ),
  // Capability: an ascent.
  skills: (
    <>
      <path d="M12 4 20.5 19H3.5Z" />
      <path d="M7.4 13h9.2" opacity="0.55" />
    </>
  ),
  // Reserves: stacked coins.
  finance: (
    <>
      <ellipse cx="12" cy="7.5" rx="7" ry="3" />
      <path d="M5 7.5v9c0 1.66 3.13 3 7 3s7-1.34 7-3v-9" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" opacity="0.55" />
    </>
  ),
  // People: two orbits that overlap.
  relationships: (
    <>
      <circle cx="9" cy="12" r="5.5" />
      <circle cx="15" cy="12" r="5.5" />
    </>
  ),
  // Surroundings: a sun on the horizon.
  environment: (
    <>
      <path d="M3 16.5h18" />
      <path d="M6.5 16.5a5.5 5.5 0 0 1 11 0" />
      <path d="M12 5.5v2.5M5.2 8.7l1.6 1.6M18.8 8.7l-1.6 1.6" opacity="0.55" />
    </>
  ),
  // Repetition: a cycle.
  habits: (
    <>
      <path d="M19 12a7 7 0 1 1-3.5-6.06" />
      <path d="M12.5 5.94h3L14 3.34" />
    </>
  ),
};

export function DomainGlyph({ domain, size = 24, color, strokeWidth = 1.3 }: { domain: DomainKey; size?: number; color?: string; strokeWidth?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color }}
      aria-hidden
    >
      {GLYPHS[domain]}
    </svg>
  );
}
