import type { NodeProps } from '@xyflow/react';
import { memo } from 'react';
import { useSpaceHelix } from '../../../graph/space';
import type { HelixNode } from '../../../graph/types';

/**
 * The Causes helix's backbone, drawn as a hologram over its projector: two
 * strands (you, and what surrounds you), a rung for each step of the chain,
 * rings at both ends and a scanning ring that sweeps from cause to effect.
 * The shapes are empty here: the space engine writes them, the projector's
 * light included, flat or through the camera each frame (graph/space.ts), so
 * the elements stay on their strands and the light under them as the helix
 * turns.
 */
export const HelixNodeView = memo(function HelixNodeView(props: NodeProps<HelixNode>) {
  return props.data.spec.kind === 'globe' ? <GlobeBody data={props.data} /> : <HelixBody data={props.data} />;
});

function HelixBody({ data }: { data: HelixNode['data'] }) {
  const { spec, captions } = data;
  const ref = useSpaceHelix(spec);
  const { R } = spec;
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
        <path data-part="beam" fill="url(#helix-beam)" />
        <ellipse data-part="emitter" rx={R * 1.7} ry={R * 0.42} fill="url(#helix-emitter)" />
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
}

/**
 * The globe: a sphere of light turning about the same axis, its graticule
 * split into near and far halves, a faint parallel for each step of the chain
 * (what may lead at the north, what may follow at the south), the areas named
 * on the equator as their meridians come round, and the scanning ring
 * sweeping north to south. Written by the space engine like the helix.
 */
function GlobeBody({ data }: { data: HelixNode['data'] }) {
  const { spec, captions, areas = [] } = data;
  const ref = useSpaceHelix(spec);
  return (
    <div className="helix-body globe-body pointer-events-none relative" style={{ width: spec.width, height: spec.height }} aria-hidden>
      <svg ref={ref} width={spec.width} height={spec.height} className="absolute inset-0 overflow-visible">
        <defs>
          <radialGradient id="globe-shade" cx="0.4" cy="0.34" r="0.72">
            <stop offset="0" stopColor="rgb(var(--holo-b))" stopOpacity="0.1" />
            <stop offset="0.7" stopColor="rgb(var(--holo-b))" stopOpacity="0.03" />
            <stop offset="1" stopColor="rgb(var(--holo-b))" stopOpacity="0.09" />
          </radialGradient>
        </defs>
        <path data-part="limb-glow" className="globe-limb-glow" />
        <path data-part="limb" className="globe-limb" fill="url(#globe-shade)" />
        <path data-part="grid-back" className="globe-grid-back" />
        <path data-part="equator-back" className="globe-grid-back" />
        <path data-part="bands" className="globe-bands" />
        <path data-part="axis" className="helix-axis" />
        <path data-part="grid-front" className="globe-grid" />
        <path data-part="equator-front" className="globe-equator" />
        <path data-part="scan" className="helix-scan" />
        <text data-part="lead" className="helix-caption" textAnchor="middle">
          {captions.lead.toUpperCase()}
        </text>
        <text data-part="follow" className="helix-caption" textAnchor="middle">
          {captions.follow.toUpperCase()}
        </text>
        {areas.map((a, i) => (
          <text key={a.label} data-part={`area-${i}`} className="globe-area" textAnchor="middle" style={{ fill: a.color }}>
            {a.label.toUpperCase()}
          </text>
        ))}
        {captions.empty && (
          <text data-part="empty" className="helix-caption helix-empty" textAnchor="middle" dominantBaseline="middle">
            {captions.empty.toUpperCase()}
          </text>
        )}
      </svg>
    </div>
  );
}
