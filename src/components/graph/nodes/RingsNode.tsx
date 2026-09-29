import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { useSpaceRing } from '../../../graph/space';
import type { RingsNode } from '../../../graph/types';

/** Seconds per revolution of each ring's tracer: inner orbits turn faster, as orbits do. */
const ORBIT_PERIOD = [150, 220, 300];

/**
 * Concentric rings for Orbit, one per layer: what I hold, what I do, what
 * surrounds me. Faint spokes mark where one area of life ends and the next
 * begins; each ring's name sits in the gap on one spoke.
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
        <Ring
          key={r}
          index={i}
          r={r}
          w={w}
          h={h}
          stretch={data.stretch}
          label={data.labels[i]}
          labelAngle={data.spokes[0] ?? -64}
          spokes={i === data.radii.length - 1 ? { angles: data.spokes, inner: data.spokeInner, outer: data.spokeRadius } : undefined}
        />
      ))}
    </div>
  );
});

const rad = (deg: number) => (deg * Math.PI) / 180;

interface RingProps {
  index: number;
  r: number;
  w: number;
  h: number;
  stretch: { x: number; y: number };
  label?: string;
  labelAngle: number;
  spokes?: { angles: number[]; inner: number; outer: number };
}

function Ring({ index, r, w, h, stretch, label, labelAngle, spokes }: RingProps) {
  const ref = useSpaceRing(index);
  const cx = w / 2;
  const cy = h / 2;
  // The name follows the ring, just inside it, centred on a sector boundary.
  const lr = r - 12;
  const a0 = rad(labelAngle - 14);
  const a1 = rad(labelAngle + 14);
  const arc = `M ${r + lr * Math.cos(a0)} ${r + lr * Math.sin(a0)} A ${lr} ${lr} 0 0 1 ${r + lr * Math.cos(a1)} ${r + lr * Math.sin(a1)}`;
  const arcId = `ring-label-${index}`;
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
          {spokes?.angles.map((deg) => (
            <line
              key={deg}
              x1={r + spokes.inner * Math.cos(rad(deg))}
              y1={r + spokes.inner * Math.sin(rad(deg))}
              x2={r + spokes.outer * Math.cos(rad(deg))}
              y2={r + spokes.outer * Math.sin(rad(deg))}
              stroke="rgb(236 232 223 / 0.07)"
              strokeWidth="1"
              strokeDasharray="2 6"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path id={arcId} d={arc} fill="none" stroke="none" />
          <text fill="rgb(142 139 132)" fontFamily="var(--font-mono)" fontSize="13" letterSpacing="2.4">
            <textPath href={`#${arcId}`} startOffset="50%" textAnchor="middle">
              {label?.toUpperCase() ?? ''}
            </textPath>
          </text>
        </svg>
      </div>
    </div>
  );
}
