import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { FIGURE_RINGS, useSpaceFigure } from '../../../graph/space';
import type { FigureNode } from '../../../graph/types';

/** A star's dot, by its brightness (smaller magnitude, brighter star). */
const dot = (mag: number) => Math.max(2.4, Math.min(6.5, 7 - 0.9 * mag));

/**
 * A constellation shape behind the Map: the figure's lines joining the stars
 * each area sits on, the figure's other stars, and around each area its orbit
 * (what I hold, what I do, what surrounds me, nearest to farthest). Its stars
 * lie at different depths, as the round map's rings do: the space engine draws
 * it afresh through its camera each frame (every point at its own depth, each
 * orbit's rings at theirs), so its lines stay on its stars as the view turns;
 * flat, it is drawn as laid out. The box is centred on the person, like the
 * rings it replaces.
 */
export const FigureNodeView = memo(function FigureNodeView({ data }: NodeProps<FigureNode>) {
  const ref = useSpaceFigure(data.figure);
  const { points, mags, lines, orbits } = data.figure;
  const reach = Math.max(...orbits.map((o) => o.r));
  const halfW = Math.max(...points.map((p) => Math.abs(p.x))) + reach + 40;
  const halfH = Math.max(...points.map((p) => Math.abs(p.y))) + reach + 80;
  const w = halfW * 2;
  const h = halfH * 2;
  const seat = (x: number, y: number) => orbits.some((o) => Math.abs(o.at.x - x) < 0.5 && Math.abs(o.at.y - y) < 0.5);
  const bottom = Math.max(...points.map((p) => p.y)) + reach + 44;
  return (
    <div className="pointer-events-none relative" style={{ width: w, height: h }} aria-hidden>
      <svg ref={ref} width={w} height={h} viewBox={`${-halfW} ${-halfH} ${w} ${h}`} className="absolute inset-0 overflow-visible">
        {orbits.map((o, i) => (
          <g key={i}>
            {FIGURE_RINGS.map((share, k) => (
              <ellipse
                key={k}
                data-orbit={i}
                data-ring={k}
                cx={o.at.x}
                cy={o.at.y}
                rx={o.r * share}
                ry={o.r * share}
                fill="none"
                stroke={`rgb(236 232 223 / ${[0.09, 0.06, 0.05][k]})`}
                strokeWidth="1"
                strokeDasharray={[undefined, '2 6', '1 5'][k]}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </g>
        ))}
        {lines.map((l, i) => {
          const d = l.map((k, j) => `${j ? 'L' : 'M'} ${points[k].x.toFixed(1)} ${points[k].y.toFixed(1)}`).join(' ');
          return (
            <g key={i}>
              <path d={d} data-line={i} fill="none" stroke="rgb(232 208 156 / 0.07)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
              <path
                d={d}
                data-line={i}
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
          mags[i] === null || seat(p.x, p.y) ? null : <circle key={i} data-dot={i} cx={p.x} cy={p.y} r={dot(mags[i]!)} fill="rgb(240 226 196 / 0.7)" />,
        )}
        <text x={0} y={bottom} textAnchor="middle" className="font-mono" fontSize="24" letterSpacing="10" fill="rgb(232 208 156 / 0.4)" data-part="figure-name">
          {data.name.toUpperCase()}
        </text>
      </svg>
    </div>
  );
});
