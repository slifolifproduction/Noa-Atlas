import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { FIGURE_PLANE, useSpaceRing } from '../../../graph/space';
import type { FigureNode } from '../../../graph/types';

/** A star's dot, by its brightness (smaller magnitude, brighter star). */
const dot = (mag: number) => Math.max(2.4, Math.min(6.5, 7 - 0.9 * mag));

/**
 * A constellation shape behind the Map: the figure's lines joining the stars
 * each area sits on, the figure's other stars, and around each area its orbit
 * (what I hold, what I do, what surrounds me, nearest to farthest). One plane
 * at the depth of the area markers, so the lines stay on them as the view
 * turns. The box is centred on the person, like the rings it replaces.
 */
export const FigureNodeView = memo(function FigureNodeView({ data }: NodeProps<FigureNode>) {
  const ref = useSpaceRing(FIGURE_PLANE);
  const { points, mags, lines, orbits } = data.figure;
  const reach = Math.max(...orbits.map((o) => o.r));
  const halfW = Math.max(...points.map((p) => Math.abs(p.x))) + reach + 40;
  const halfH = Math.max(...points.map((p) => Math.abs(p.y))) + reach + 80;
  const w = halfW * 2;
  const h = halfH * 2;
  const seat = (x: number, y: number) => orbits.some((o) => Math.abs(o.at.x - x) < 0.5 && Math.abs(o.at.y - y) < 0.5);
  const bottom = Math.max(...points.map((p) => p.y)) + reach + 44;
  return (
    <div ref={ref} className="ring-plane pointer-events-none relative" style={{ width: w, height: h }} aria-hidden>
      <svg width={w} height={h} viewBox={`${-halfW} ${-halfH} ${w} ${h}`} className="absolute inset-0 overflow-visible">
        {orbits.map((o, i) => (
          <g key={i}>
            <circle cx={o.at.x} cy={o.at.y} r={o.r} fill="none" stroke="rgb(236 232 223 / 0.09)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle
              cx={o.at.x}
              cy={o.at.y}
              r={o.r * 0.76}
              fill="none"
              stroke="rgb(236 232 223 / 0.06)"
              strokeWidth="1"
              strokeDasharray="2 6"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={o.at.x}
              cy={o.at.y}
              r={o.r * 0.5}
              fill="none"
              stroke="rgb(236 232 223 / 0.05)"
              strokeWidth="1"
              strokeDasharray="1 5"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        ))}
        {lines.map((l, i) => {
          const d = l.map((k, j) => `${j ? 'L' : 'M'} ${points[k].x.toFixed(1)} ${points[k].y.toFixed(1)}`).join(' ');
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="rgb(232 208 156 / 0.07)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d={d}
                data-part="figure-line"
                fill="none"
                stroke="rgb(232 208 156 / 0.42)"
                strokeWidth="1.25"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
        {points.map((p, i) =>
          mags[i] === null || seat(p.x, p.y) ? null : <circle key={i} cx={p.x} cy={p.y} r={dot(mags[i]!)} fill="rgb(240 226 196 / 0.7)" />,
        )}
        <text x={0} y={bottom} textAnchor="middle" className="font-mono" fontSize="24" letterSpacing="10" fill="rgb(232 208 156 / 0.4)" data-part="figure-name">
          {data.name.toUpperCase()}
        </text>
      </svg>
    </div>
  );
});
