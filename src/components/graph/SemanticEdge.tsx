import { BaseEdge, EdgeLabelRenderer, useInternalNode, type EdgeProps, type InternalNode } from '@xyflow/react';
import { memo, useEffect, useRef } from 'react';
import { RELATION_META } from '../../domain/constants';
import type { RelationType } from '../../domain/types';
import { hash01, HOP_MS, pulseTravel, useMotion, useWave } from '../../graph/motion';
import { useSpaceEdge } from '../../graph/space';
import { CIRCLE_NODE_TYPES, type SemanticEdge, type SemanticEdgeData } from '../../graph/types';

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
  // In a 3D graph the engine moves the line and its overlay (pulses, label) with its endpoints.
  const space = useSpaceEdge(id, source, target);
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
  const emphasised = data.active || data.hover || selected;
  const label = emphasised && data.relation !== 'part_of';
  return (
    <>
      <g ref={space.svg}>
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
      </g>
      <EdgeLabelRenderer>
        <div ref={space.html} className="edge-space">
          <EdgeFlow id={id} curve={{ x0: start.x, y0: start.y, cx, cy, x1: end.x, y1: end.y }} length={len} data={data} source={source} target={target} />
          {label && (
            <div
              className="nodrag nopan pointer-events-none absolute w-max rounded-[4px] border border-line bg-canvas/90 px-1.5 py-px font-mono text-[10px] tracking-wide text-ink-2"
              style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
            >
              {meta.verb}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
});

/* ------------------------------------------------------------ flow */

/**
 * How influence travels along each relationship. Forward = source → target.
 * Dependencies and derivations flow from what is relied on / originated.
 * Conflicts send a pulse in from both ends that fades where they meet.
 */
const FLOW: Partial<Record<RelationType, 'forward' | 'reverse' | 'meet'>> = {
  causes: 'forward',
  influences: 'forward',
  supports: 'forward',
  contradicts: 'forward',
  derived_from: 'reverse',
  depends_on: 'reverse',
  conflicts: 'meet',
  part_of: 'forward',
};

const PULSE_COLOR = '#e4ebf2';

interface Curve {
  x0: number;
  y0: number;
  cx: number;
  cy: number;
  x1: number;
  y1: number;
}

/** Point on the edge's quadratic curve at parameter t. */
function at(c: Curve, t: number) {
  const u = 1 - t;
  return { x: u * u * c.x0 + 2 * u * t * c.cx + t * t * c.x1, y: u * u * c.y0 + 2 * u * t * c.cy + t * t * c.y1 };
}

interface DotProps {
  curve: Curve;
  cycle: number;
  seconds: number;
  delay: number;
  reverse?: boolean;
  half?: boolean;
  color: string;
  r: number;
  peak: number;
  once?: boolean;
}

const STEPS = 14;

/**
 * One light pulse following the edge's actual curve. It lives in React Flow's
 * HTML overlay rather than the shared edges <svg> (which would repaint every
 * edge each frame), and moves by transform/opacity keyframes sampled from the
 * curve, so the browser's compositor animates it with no React renders and no
 * repaints.
 */
function Dot({ curve, cycle, seconds, delay, reverse, half, color, r, peak, once }: DotProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { x0, y0, cx, cy, x1, y1 } = curve;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    const c = { x0, y0, cx, cy, x1, y1 };
    const travel = Math.min(1, (half ? seconds * 0.5 : seconds) / cycle);
    const [from, to] = half ? (reverse ? [1, 0.5] : [0, 0.5]) : reverse ? [1, 0] : [0, 1];
    const frames: Keyframe[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const k = i / STEPS;
      const p = at(c, from + (to - from) * k);
      const fade = k < 0.2 ? k / 0.2 : k > 0.75 ? Math.max(0, (1 - k) / 0.25) : 1;
      frames.push({ transform: `translate(${(p.x - r).toFixed(1)}px, ${(p.y - r).toFixed(1)}px)`, opacity: peak * fade, offset: travel * k });
    }
    if (travel < 1) frames.push({ ...frames[frames.length - 1], opacity: 0, offset: 1 });
    const anim = el.animate(frames, { duration: cycle * 1000, iterations: once ? 1 : Infinity, delay: once ? 0 : -delay * 1000, fill: 'both' });
    return () => anim.cancel();
  }, [x0, y0, cx, cy, x1, y1, cycle, seconds, delay, reverse, half, peak, once, r]);
  return (
    <div
      ref={ref}
      className="atlas-dot"
      style={{ width: r * 2, height: r * 2, background: color, boxShadow: `0 0 ${r * 3}px ${r * 0.6}px ${color}33` }}
      aria-hidden
    />
  );
}

function EdgeFlow({
  id,
  curve,
  length,
  data,
  source,
  target,
}: {
  id: string;
  curve: Curve;
  length: number;
  data: SemanticEdgeData;
  source: string;
  target: string;
}) {
  const motion = useMotion();
  const living = motion.living && !motion.reduced && data.flow === true;
  // Only the links a signal actually travels along light up.
  const wave = useWave(living, (w) => (w.origin === source && w.reached.includes(target)) || (w.origin === target && w.reached.includes(source)));
  if (!living) return null;
  const mode = FLOW[data.relation];
  if (!mode) return null;

  // Around a busy node, only a sample of connected edges pulses; hover always shows its own links.
  const engaged = data.hover || (data.active && hash01(`${id}:active`) < motion.activeShare);
  const phase = hash01(id);
  // Idle: only primary relationships carry a slow, occasional pulse. Structure and
  // cross-domain links stay quiet until the user engages with an endpoint.
  const idle = !engaged && !data.dim && !data.secondary && data.relation !== 'part_of' && hash01(`${id}:idle`) < motion.idleShare;
  const seconds = pulseTravel(length);
  const cycle = seconds + (engaged ? 1.2 + phase * 0.8 : 7 + phase * 6);
  const delay = phase * cycle;
  const color = engaged ? PULSE_COLOR : RELATION_META[data.relation].color;
  const peak = engaged ? 0.95 : 0.6;
  const r = data.relation === 'part_of' ? 1.3 : 1.7;
  const showWave = wave && !data.dim;
  if (!engaged && !idle && !showWave) return null;

  return (
    <>
      {(engaged || idle) &&
        (mode === 'meet' ? (
          <>
            <Dot key={`a${engaged}`} curve={curve} cycle={cycle} seconds={seconds} delay={delay} half color={color} r={r} peak={peak} />
            <Dot key={`b${engaged}`} curve={curve} cycle={cycle} seconds={seconds} delay={delay} half reverse color={color} r={r} peak={peak} />
          </>
        ) : (
          <Dot key={`p${engaged}`} curve={curve} cycle={cycle} seconds={seconds} delay={delay} reverse={mode === 'reverse'} color={color} r={r} peak={peak} />
        ))}
      {showWave && (
        <Dot
          key={wave.at}
          once
          curve={curve}
          cycle={HOP_MS / 1000}
          seconds={HOP_MS / 1000}
          delay={0}
          reverse={wave.origin === target}
          color={PULSE_COLOR}
          r={2.1}
          peak={Math.min(1, 0.95 * wave.strength + 0.2)}
        />
      )}
    </>
  );
}

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
