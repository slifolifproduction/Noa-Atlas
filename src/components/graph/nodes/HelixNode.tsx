import type { NodeProps } from '@xyflow/react';
import { memo, useMemo } from 'react';
import { helixEnds } from '../../../graph/helix';
import { useSpaceHelix } from '../../../graph/space';
import type { HelixNode } from '../../../graph/types';

/**
 * The Causes helix's backbone, drawn as a hologram over its projector: two
 * strands (you, and what surrounds you), a rung for each step of the chain,
 * rings at both ends and a scanning ring that sweeps from cause to effect.
 * The shapes are empty here: the space engine writes them, flat or through
 * the camera each frame (graph/space.ts), so the elements stay on their
 * strands as the helix turns. Only the projector's light is fixed.
 */
export const HelixNodeView = memo(function HelixNodeView({ data }: NodeProps<HelixNode>) {
  const { spec, captions } = data;
  const ref = useSpaceHelix(spec);
  const ends = useMemo(() => helixEnds(spec), [spec]);
  const { R } = spec;
  const beam = `M ${ends.bottom.x - R * 1.3} ${ends.bottom.y} L ${ends.bottom.x + R * 1.3} ${ends.bottom.y} L ${ends.top.x + R * 1.05} ${ends.top.y} L ${ends.top.x - R * 1.05} ${ends.top.y} Z`;
  return (
    <div className="helix-body pointer-events-none relative" style={{ width: spec.width, height: spec.height }} aria-hidden>
      <svg ref={ref} width={spec.width} height={spec.height} className="absolute inset-0 overflow-visible">
        <defs>
          <linearGradient id="helix-beam" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="rgb(var(--holo-b))" stopOpacity="0.09" />
            <stop offset="0.55" stopColor="rgb(var(--holo-b))" stopOpacity="0.025" />
            <stop offset="1" stopColor="rgb(var(--holo-b))" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="helix-emitter">
            <stop offset="0" stopColor="rgb(var(--holo-b))" stopOpacity="0.2" />
            <stop offset="1" stopColor="rgb(var(--holo-b))" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path d={beam} fill="url(#helix-beam)" />
        <ellipse cx={ends.bottom.x} cy={ends.bottom.y} rx={R * 1.7} ry={R * 0.42} fill="url(#helix-emitter)" />
        <path data-part="axis" className="helix-axis" />
        <path data-part="back-0" className="helix-back helix-a" />
        <path data-part="back-1" className="helix-back helix-b" />
        <path data-part="rungs" className="helix-rungs" />
        <path data-part="rings" className="helix-rings" />
        <path data-part="scan" className="helix-scan" />
        <path data-part="glow-0" className="helix-glow helix-a" />
        <path data-part="glow-1" className="helix-glow helix-b" />
        <path data-part="front-0" className="helix-front helix-a" />
        <path data-part="front-1" className="helix-front helix-b" />
        <text data-part="lead" className="helix-caption" textAnchor="middle">
          {captions.lead.toUpperCase()}
        </text>
        <text data-part="follow" className="helix-caption" textAnchor="middle">
          {captions.follow.toUpperCase()}
        </text>
        <text data-part="inner" className="helix-caption helix-a-text" dominantBaseline="middle">
          {captions.inner.toUpperCase()}
        </text>
        <text data-part="around" className="helix-caption helix-b-text" dominantBaseline="middle">
          {captions.around.toUpperCase()}
        </text>
        {captions.empty && (
          <text data-part="empty" className="helix-caption helix-empty" textAnchor="middle" dominantBaseline="middle">
            {captions.empty.toUpperCase()}
          </text>
        )}
      </svg>
    </div>
  );
});
