import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo } from 'react';
import { RELATION_META } from '../../domain/constants';
import { CIRCLE_NODE_TYPES, type SemanticEdge } from '../../graph/types';

interface Box {
  cx: number;
  cy: number;
  w: number;
  h: number;
  circle: boolean;
}

function box(node: InternalNode): Box {
  const w = node.measured.width ?? 0;
  const h = node.measured.height ?? 0;
  const p = node.internals.positionAbsolute;
  return { cx: p.x + w / 2, cy: p.y + h / 2, w, h, circle: CIRCLE_NODE_TYPES.has(node.type ?? '') };
}

/** Where the line from a box's centre toward (tx, ty) leaves the box. */
function border(b: Box, tx: number, ty: number, pad = 3) {
  const dx = tx - b.cx;
  const dy = ty - b.cy;
  const len = Math.hypot(dx, dy) || 1;
  if (b.circle) {
    const r = Math.min(b.w, b.h) / 2 + pad;
    return { x: b.cx + (dx / len) * r, y: b.cy + (dy / len) * r };
  }
  const hw = b.w / 2 + pad;
  const hh = b.h / 2 + pad;
  const t = Math.min(dx ? hw / Math.abs(dx) : Infinity, dy ? hh / Math.abs(dy) : Infinity);
  return { x: b.cx + dx * t, y: b.cy + dy * t };
}

/**
 * Floating, gently curved edge. Line style encodes the relationship
 * (solid, dashed, dotted; arrow or not), so meaning never relies on colour.
 */
export const SemanticEdgeView = memo(function SemanticEdgeView({ id, source, target, data, selected }: EdgeProps<SemanticEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const a = box(s);
  const b = box(t);
  const start = border(a, b.cx, b.cy);
  const end = border(b, a.cx, a.cy, RELATION_META[data.relation].arrow ? 5 : 3);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const bend = data.relation === 'part_of' ? 0 : Math.min(36, len * 0.09);
  const cx = (start.x + end.x) / 2 - (dy / len) * bend;
  const cy = (start.y + end.y) / 2 + (dx / len) * bend;
  const path = `M ${start.x},${start.y} Q ${cx},${cy} ${end.x},${end.y}`;
  const lx = (start.x + 2 * cx + end.x) / 4;
  const ly = (start.y + 2 * cy + end.y) / 4;

  const meta = RELATION_META[data.relation];
  const emphasised = data.active || selected;
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={14}
        markerEnd={meta.arrow ? `url(#atlas-arrow-${data.relation})` : undefined}
        style={{
          stroke: meta.color,
          strokeWidth: meta.width * (emphasised ? 1.35 : 1),
          strokeDasharray: meta.dash,
          strokeLinecap: data.relation === 'derived_from' ? 'round' : undefined,
          opacity: data.relation === 'part_of' || emphasised ? 1 : data.secondary ? 0.2 : 0.6,
        }}
      />
      {emphasised && data.relation !== 'part_of' && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-[4px] border border-line bg-canvas/90 px-1.5 py-px font-mono text-[10px] tracking-wide text-ink-2"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            {meta.verb}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

/** Arrowheads, one per relation colour. Rendered once per canvas. */
export function EdgeMarkers() {
  return (
    <svg className="absolute h-0 w-0" aria-hidden>
      <defs>
        {Object.values(RELATION_META)
          .filter((r) => r.arrow)
          .map((r) => (
            <marker
              key={r.key}
              id={`atlas-arrow-${r.key}`}
              viewBox="0 0 10 10"
              refX="8.5"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              markerUnits="userSpaceOnUse"
              orient="auto-start-reverse"
            >
              <path d="M 1 1.5 L 9 5 L 1 8.5" fill="none" stroke={r.color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          ))}
      </defs>
    </svg>
  );
}
