import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { useSpaceRing } from '../../../graph/space';
import type { RingsNode } from '../../../graph/types';

/** Seconds per revolution of each ring's dashes: inner orbits turn faster, as orbits do. */
const ORBIT_PERIOD = [150, 220, 300];

/**
 * Concentric context rings for Orbit: self → intent → work → conditions.
 * Each ring is its own plane so the space engine can set it at its depth, and
 * its dashes flow slowly around it (a circle turned on the compositor, then
 * stretched to the orbit's ellipse).
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
        <svg
          width={r * 2}
          height={r * 2}
          className="ring-orbit absolute inset-0 overflow-visible"
          style={{ animationDuration: `${ORBIT_PERIOD[index] ?? 300}s` }}
        >
          <circle cx={r} cy={r} r={r} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="1" strokeDasharray="2 7" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <svg width={w} height={h} className="absolute top-0 left-0 overflow-visible">
        <text
          x={cx + r * stretch.x * Math.cos(a) + 10}
          y={cy + r * stretch.y * Math.sin(a) - 8}
          fill="rgb(131 141 152 / 0.8)"
          fontFamily="var(--font-mono)"
          fontSize="11"
          letterSpacing="1.4"
        >
          {label?.toUpperCase()}
        </text>
      </svg>
    </div>
  );
}
