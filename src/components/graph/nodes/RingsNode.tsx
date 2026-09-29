import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { useSpaceRing, useSpaceScan } from '../../../graph/space';
import type { RingsNode } from '../../../graph/types';

/**
 * Concentric context rings for Orbit: self → intent → work → conditions.
 * Each ring is its own plane so the space engine can set it at its depth; a
 * fourth plane carries the scanner that sweeps the rings.
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
      <Scanner index={data.radii.length} r={outer} w={w} h={h} stretch={data.stretch} />
    </div>
  );
});

function Ring({ index, r, w, h, stretch, label }: { index: number; r: number; w: number; h: number; stretch: { x: number; y: number }; label?: string }) {
  const ref = useSpaceRing(index);
  const cx = w / 2;
  const cy = h / 2;
  const a = (-84 * Math.PI) / 180;
  return (
    <svg ref={ref} width={w} height={h} className="ring-plane pointer-events-none absolute top-0 left-0 overflow-visible" aria-hidden>
      <ellipse cx={cx} cy={cy} rx={r * stretch.x} ry={r * stretch.y} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth="1" strokeDasharray="2 7" />
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
  );
}

/** A slow sweep around the rings; the space engine turns it and pings what it passes. */
function Scanner({ index, r, w, h, stretch }: { index: number; r: number; w: number; h: number; stretch: { x: number; y: number } }) {
  const plane = useSpaceRing(index);
  const rotor = useSpaceScan(stretch);
  return (
    <div ref={plane} className="ring-plane scan-plane pointer-events-none absolute top-0 left-0" style={{ width: w, height: h }} aria-hidden>
      <div className="absolute" style={{ left: w / 2 - r, top: h / 2 - r, width: r * 2, height: r * 2, transform: `scale(${stretch.x}, ${stretch.y})` }}>
        <div ref={rotor} className="scan-rotor absolute inset-0 rounded-full" />
      </div>
    </div>
  );
}
