import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import type { RingsNode } from '../../../graph/types';

/** Concentric context rings for Orbit: self → intent → work → conditions. */
export const RingsNodeView = memo(function RingsNodeView({ data }: NodeProps<RingsNode>) {
  const outer = Math.max(...data.radii);
  const w = outer * 2 * data.stretch.x + 40;
  const h = outer * 2 * data.stretch.y + 40;
  const cx = w / 2;
  const cy = h / 2;
  const a = (-84 * Math.PI) / 180;
  return (
    <svg width={w} height={h} className="pointer-events-none overflow-visible" aria-hidden>
      {data.radii.map((r, i) => (
        <g key={r}>
          <ellipse
            cx={cx}
            cy={cy}
            rx={r * data.stretch.x}
            ry={r * data.stretch.y}
            fill="none"
            stroke="rgb(255 255 255 / 0.06)"
            strokeWidth="1"
            strokeDasharray="2 7"
          />
          <text
            x={cx + r * data.stretch.x * Math.cos(a) + 10}
            y={cy + r * data.stretch.y * Math.sin(a) - 8}
            fill="rgb(131 141 152 / 0.8)"
            fontFamily="var(--font-mono)"
            fontSize="11"
            letterSpacing="1.4"
          >
            {data.labels[i]?.toUpperCase()}
          </text>
        </g>
      ))}
    </svg>
  );
});
