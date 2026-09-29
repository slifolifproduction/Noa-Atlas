import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { useSpaceRing } from '../../../graph/space';
import type { RingsNode } from '../../../graph/types';

/** Seconds per revolution of each ring's tracer: inner orbits turn faster, as orbits do. */
const ORBIT_PERIOD = [150, 220, 300];

/**
 * Concentric context rings for Orbit: self → intent → work → conditions.
 * Each ring is its own plane so the space engine can set it at its depth. Its
 * scale of degree marks stays still (cheap to composite); a small tracer body
 * travels the orbit instead (a circle turned on the compositor, then stretched
 * to the orbit's ellipse).
 */
export const RingsNodeView = memo(function RingsNodeView({ data }: NodeProps<RingsNode>) {
  const outer = Math.max(...data.radii);
  const w = outer * 2 * data.stretch.x + 40;
  const h = outer * 2 * data.stretch.y + 40;
  return (
    <div className="relative" style={{ width: w, height: h }}>
      {data.radii.map((r, i) => (
        <Ring key={r} index={i} r={r} w={w} h={h} stretch={data.stretch} label={data.labels[i]} />
      ))}
    </div>
  );
});

function Ring({ index, r, w, h, stretch, label }: { index: number; r: number; w: number; h: number; stretch: { x: number; y: number }; label?: string }) {
  const ref = useSpaceRing(index);
  const cx = w / 2;
  const cy = h / 2;
  const a = (-84 * Math.PI) / 180;
  return (
    <div ref={ref} className="ring-plane pointer-events-none absolute top-0 left-0" style={{ width: w, height: h }} aria-hidden>
      <div className="absolute" style={{ left: cx - r, top: cy - r, width: r * 2, height: r * 2, transform: `scale(${stretch.x}, ${stretch.y})` }}>
        {/* A tracer: one small body travelling the orbit, so the rings read as live. Only the
            4px body is a moving layer (it turns about the ring's centre), so it costs almost nothing. */}
        <div
          className="ring-orbit absolute rounded-full bg-ink/55"
          style={{ left: r - 2, top: -2, width: 4, height: 4, transformOrigin: `2px ${r + 2}px`, animationDuration: `${ORBIT_PERIOD[index] ?? 300}s` }}
        />
        <svg width={r * 2} height={r * 2} className="absolute inset-0 overflow-visible">
          <circle cx={r} cy={r} r={r} fill="none" stroke="rgb(236 232 223 / 0.07)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <circle
            cx={r}
            cy={r}
            r={r - 2}
            fill="none"
            stroke="rgb(236 232 223 / 0.09)"
            strokeWidth="4"
            strokeDasharray={`1 ${(2 * Math.PI * (r - 2)) / 180 - 1}`}
          />
          <circle
            cx={r}
            cy={r}
            r={r - 5}
            fill="none"
            stroke="rgb(236 232 223 / 0.2)"
            strokeWidth="10"
            strokeDasharray={`1 ${(2 * Math.PI * (r - 5)) / 12 - 1}`}
          />
        </svg>
      </div>
      <svg width={w} height={h} className="absolute top-0 left-0 overflow-visible">
        <text
          x={cx + r * stretch.x * Math.cos(a) + 10}
          y={cy + r * stretch.y * Math.sin(a) - 8}
          fill="rgb(142 139 132)"
          fontFamily="var(--font-mono)"
          fontSize="14"
          letterSpacing="2.4"
        >
          {`R${index + 1} — ${label?.toUpperCase() ?? ''}`}
        </text>
      </svg>
    </div>
  );
}
