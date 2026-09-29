import { useSpaceFollower } from '../../graph/space';
import type { AtlasFlowNode } from '../../graph/types';

const BRACKET = 9;

/**
 * Target lock on the selected node: a slowly turning segmented ring around
 * circular nodes, corner brackets around cards. Rendered in the viewport
 * portal, so it lives in graph space and follows pans, zooms and drags.
 */
export function Reticle({ node }: { node: AtlasFlowNode }) {
  // Positioned with left/top so the space engine's translate/scale act about its centre.
  const spaceRef = useSpaceFollower(node.id);
  const w = node.measured?.width ?? 0;
  const h = node.measured?.height ?? 0;
  if (!w || !h) return null;
  const circle = node.type === 'hub' || node.type === 'item';

  if (circle) {
    const d = Math.max(w, h) + (node.type === 'hub' ? 26 : 18);
    const r = d / 2 - 1;
    const c = 2 * Math.PI * r;
    return (
      <div ref={spaceRef} className="pointer-events-none absolute" style={{ left: node.position.x - d / 2, top: node.position.y - d / 2 }}>
        <div className="atlas-lock" style={{ width: d, height: d }}>
          <svg width={d} height={d} className="atlas-reticle-spin overflow-visible" aria-hidden>
            <circle
              cx={d / 2}
              cy={d / 2}
              r={r}
              fill="none"
              stroke="var(--color-accent)"
              strokeOpacity="0.55"
              strokeWidth="1.25"
              strokeDasharray={`${c * 0.16} ${c * 0.09}`}
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          <svg width={d} height={d} className="absolute inset-0 overflow-visible" aria-hidden>
            {[0, 90, 180, 270].map((a) => (
              <line
                key={a}
                x1={d / 2}
                y1={-3}
                x2={d / 2}
                y2={-8}
                transform={`rotate(${a} ${d / 2} ${d / 2})`}
                stroke="var(--color-accent)"
                strokeOpacity="0.7"
                strokeWidth="1.25"
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        </div>
      </div>
    );
  }

  const pad = 7;
  const bw = w + pad * 2;
  const bh = h + pad * 2;
  const corners = [
    `M 0 ${BRACKET} V 0 H ${BRACKET}`,
    `M ${bw - BRACKET} 0 H ${bw} V ${BRACKET}`,
    `M ${bw} ${bh - BRACKET} V ${bh} H ${bw - BRACKET}`,
    `M ${BRACKET} ${bh} H 0 V ${bh - BRACKET}`,
  ];
  return (
    <div ref={spaceRef} className="pointer-events-none absolute" style={{ left: node.position.x - bw / 2, top: node.position.y - bh / 2 }}>
      <div className="atlas-lock" style={{ width: bw, height: bh }}>
        <svg width={bw} height={bh} className="overflow-visible" aria-hidden>
          {corners.map((d) => (
            <path key={d} d={d} fill="none" stroke="var(--color-accent)" strokeOpacity="0.75" strokeWidth="1.25" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>
    </div>
  );
}
