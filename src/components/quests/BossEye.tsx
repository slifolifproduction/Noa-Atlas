import { useEffect, useId, useMemo, useRef } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { BossPart, BossState } from '../../domain/quests';

/** Where each part of the boss sits on the iris: an angle, a length, and a few bodies along it. */
function spokes(parts: BossPart[]) {
  const n = Math.max(parts.length, 1);
  return parts.map((p, i) => {
    let h = 2166136261;
    for (const c of p.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const r = (k: number) => (((h >>> (k * 5)) & 1023) / 1023) as number;
    const angle = ((-90 + (i * 360) / n + (r(0) - 0.5) * (180 / n)) * Math.PI) / 180;
    return {
      part: p,
      angle,
      length: 118 + r(1) * 64,
      beads: [0.38 + r(2) * 0.2, 0.62 + r(3) * 0.22],
      body: r(4) > 0.55 ? 5 + r(5) * 11 : 0,
      bodyAt: 0.45 + r(6) * 0.4,
    };
  });
}

/** The eye's outline, open by `o` (0 closed, 1 open). */
const lids = (o: number) => {
  const W = 236;
  const c = (-178 * Math.max(0.02, o)) / 0.75;
  return `M${-W} 0C${-W * 0.45} ${c.toFixed(1)} ${W * 0.45} ${c.toFixed(1)} ${W} 0C${W * 0.45} ${(-c).toFixed(1)} ${-W * 0.45} ${(-c).toFixed(1)} ${-W} 0Z`;
};

const TAU = Math.PI * 2;

/**
 * A boss, as the eye of something vast in space: rings of an instrument
 * around it, its strength as the arc of the outer ring (each piece of work
 * a segment, dark once done), and on its iris a spoke for each piece, with
 * the pupil at the centre. It watches you: the pupil follows the pointer (on
 * a phone, how it is tilted), scans around when nothing moves and comes
 * back to you now and then, looks at the piece of work you point to in the
 * list, and blinks when it is hit. Near its date it narrows and burns orange.
 * It closes when beaten; it looks away once it got away. Still, with
 * reduced motion.
 */
export function BossEye({
  parts,
  state,
  urgent,
  hit,
  look,
  armor = [],
  size = 520,
  label,
}: {
  parts: BossPart[];
  state: BossState;
  /** Its date is close. */
  urgent: boolean;
  /** Changes each time it is hit. */
  hit: number;
  /** A part to look at (being pointed to in the list). */
  look?: string;
  /** Its armor plates, as a ring around everything: whole, chipped, or broken. */
  armor?: { integrity: number; broken: boolean; withdrawn?: boolean }[];
  size?: number;
  label: string;
}) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const wrap = useRef<SVGSVGElement>(null);
  const iris = useRef<SVGGElement>(null);
  const pupil = useRef<SVGGElement>(null);
  const clip = useRef<SVGPathElement>(null);
  const outline = useRef<SVGPathElement>(null);
  const layout = useMemo(() => spokes(parts), [parts]);
  const id = `eye${useId().replace(/[^\w]/g, '')}`;
  const n = Math.max(parts.length, 1);
  const open = parts.filter((p) => !p.done).length;

  // What the loop reads, so it never restarts when these change.
  const live = useRef({ state, look, layout, blinkAt: 0 });
  live.current.state = state;
  live.current.look = look;
  live.current.layout = layout;
  useEffect(() => {
    if (hit) live.current.blinkAt = performance.now();
  }, [hit]);

  useEffect(() => {
    const svg = wrap.current;
    if (!svg) return;
    const rest = state === 'defeated' ? 0.03 : state === 'escaped' ? 0.42 : 1;
    const setLids = (o: number) => {
      const d = lids(o);
      clip.current?.setAttribute('d', d);
      outline.current?.setAttribute('d', d);
    };
    const setGaze = (x: number, y: number) => {
      iris.current?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
      pupil.current?.setAttribute('transform', `translate(${(x * 1.18).toFixed(1)} ${(y * 1.18).toFixed(1)})`);
    };
    if (reduced) {
      setLids(rest);
      setGaze(state === 'escaped' ? -30 : 0, 0);
      return;
    }

    const MAX = 40;
    const pointer = { x: 0, y: 0, at: -1e9 };
    const tilt = { x: 0, y: 0, at: -1e9 };
    const onMove = (e: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / (r.width * 0.9));
      pointer.x = (dx / d) * reach * MAX;
      pointer.y = (dy / d) * reach * MAX * 0.7;
      pointer.at = performance.now();
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt.x = Math.max(-1, Math.min(1, e.gamma / 30)) * MAX;
      tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * MAX * 0.7;
      tilt.at = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('deviceorientation', onTilt);

    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(svg);
    const gaze = { x: 0, y: 0 };
    let openness = rest;
    let nextBlink = performance.now() + 3000 + Math.random() * 4000;
    let raf = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (!visible || document.hidden) return;
      const { state: st, look: at, layout: lay, blinkAt } = live.current;
      const t = now / 1000;
      // Where it looks: at the part you point to; at you; else scanning, turning back to you now and then.
      let tx: number;
      let ty: number;
      const target = at ? lay.find((s) => s.part.id === at) : undefined;
      if (st === 'escaped') [tx, ty] = [-MAX * 0.8, MAX * 0.25];
      else if (target) [tx, ty] = [Math.cos(target.angle) * MAX, Math.sin(target.angle) * MAX * 0.7];
      else if (now - pointer.at < 2500) [tx, ty] = [pointer.x, pointer.y];
      else if (now - tilt.at < 2500) [tx, ty] = [tilt.x, tilt.y];
      else if (t % 11 < 3.2) [tx, ty] = [0, 0];
      else [tx, ty] = [Math.sin(t * 0.41) * MAX * 0.85, Math.sin(t * 0.67 + 1) * MAX * 0.45];
      const k = st === 'defeated' ? 0.02 : 0.09;
      gaze.x += (tx - gaze.x) * k;
      gaze.y += (ty - gaze.y) * k;
      // Lids: a blink when hit, and now and then by itself.
      const base = st === 'defeated' ? 0.03 : st === 'escaped' ? 0.42 : 1;
      if (st === 'active' && now > nextBlink) {
        live.current.blinkAt = now;
        nextBlink = now + 4000 + Math.random() * 6000;
      }
      const since = now - live.current.blinkAt;
      const blink = blinkAt && since < 300 ? Math.sin((since / 300) * Math.PI) : 0;
      const goal = base * (1 - blink * 0.94);
      openness += (goal - openness) * (blink ? 0.6 : 0.12);
      setLids(openness);
      setGaze(gaze.x, gaze.y);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [reduced, state]);

  // The outer ring: each piece of work a segment, bright while it is still open.
  const seg = (i: number) => {
    const gap = Math.min(3, 120 / n);
    const a0 = ((-90 + (i * 360) / n + gap / 2) * Math.PI) / 180;
    const a1 = ((-90 + ((i + 1) * 360) / n - gap / 2) * Math.PI) / 180;
    const R = 204;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    return `M${(R * Math.cos(a0)).toFixed(1)} ${(R * Math.sin(a0)).toFixed(1)}A${R} ${R} 0 ${large} 1 ${(R * Math.cos(a1)).toFixed(1)} ${(R * Math.sin(a1)).toFixed(1)}`;
  };
  const ticks = Array.from({ length: 96 }, (_, i) => (i * TAU) / 96);
  // An armor plate: its whole part, then its chipped part, along the outermost ring.
  const plate = (i: number, count: number, whole: number): [string | null, string | null] => {
    const R = 247;
    const span = 360 / count;
    const gap = Math.min(6, span * 0.18);
    const a0 = -90 + i * span + gap / 2;
    const a1 = -90 + (i + 1) * span - gap / 2;
    const mid = a0 + (a1 - a0) * whole;
    const arc = (from: number, to: number) => {
      if (to - from < 0.5) return null;
      const [f, g] = [(from * Math.PI) / 180, (to * Math.PI) / 180];
      return `M${(R * Math.cos(f)).toFixed(1)} ${(R * Math.sin(f)).toFixed(1)}A${R} ${R} 0 ${to - from > 180 ? 1 : 0} 1 ${(R * Math.cos(g)).toFixed(1)} ${(R * Math.sin(g)).toFixed(1)}`;
    };
    return [arc(a0, mid), arc(mid, a1)];
  };
  const pupilR = urgent ? 22 : 30 - Math.round((open / n) * 4);

  return (
    <svg
      ref={wrap}
      viewBox="-260 -260 520 520"
      width={size}
      height={size}
      className="boss-eye block max-w-full"
      data-state={state}
      data-urgent={urgent ? '' : undefined}
      role="img"
      aria-label={label}
    >
      <defs>
        <clipPath id={`${id}-lids`}>
          <path ref={clip} d={lids(state === 'defeated' ? 0.03 : state === 'escaped' ? 0.42 : 1)} />
        </clipPath>
        <radialGradient id={`${id}-glow`}>
          <stop offset="0" className="eye-glow-in" />
          <stop offset="0.7" className="eye-glow-mid" />
          <stop offset="1" className="eye-glow-out" />
        </radialGradient>
      </defs>

      {/* The instrument around it. */}
      <g className="eye-cosmos">
        <circle r={252} className="eye-ring-faint" />
        <circle r={240} className="eye-ring-faint" />
        <circle r={226} className="eye-ring-dots" />
        <g className="eye-ticks">
          {ticks.map((a, i) => (
            <line key={i} x1={Math.cos(a) * 214} y1={Math.sin(a) * 214} x2={Math.cos(a) * (i % 8 ? 218 : 222)} y2={Math.sin(a) * (i % 8 ? 218 : 222)} />
          ))}
        </g>
        <g className="eye-orbit">
          <path d="M-232 0A232 232 0 0 1 0 -232" className="eye-arc" />
          <path d="M232 0A232 232 0 0 1 164 164" className="eye-arc" />
          <circle cx={0} cy={-232} r={3.5} className="eye-moon" />
        </g>
        <g className="eye-orbit eye-orbit-back">
          <path d="M0 246A246 246 0 0 1 -174 174" className="eye-arc eye-arc-thin" />
          <circle cx={-174} cy={174} r={2.5} className="eye-moon" />
        </g>
        {parts.map((p, i) => (
          <path key={p.id} d={seg(i)} className={p.done ? 'eye-hp eye-hp-done' : 'eye-hp'} />
        ))}
        {armor.map((a, i) => {
          const [whole, rest] = plate(i, armor.length, a.broken || a.withdrawn ? 0 : a.integrity);
          return (
            <g key={i} className={a.broken || a.withdrawn ? 'eye-plate eye-plate-broken' : 'eye-plate'}>
              {whole && <path d={whole} className="eye-plate-whole" />}
              {rest && <path d={rest} className="eye-plate-chipped" />}
            </g>
          );
        })}
        {layout.map((s, i) => (
          <text
            key={s.part.id}
            x={Math.cos(-Math.PI / 2 + ((i + 0.5) * TAU) / n) * 188}
            y={Math.sin(-Math.PI / 2 + ((i + 0.5) * TAU) / n) * 188 + 3}
            textAnchor="middle"
            className={s.part.done ? 'eye-num eye-num-done' : 'eye-num'}
          >
            {String(i + 1).padStart(2, '0')}
          </text>
        ))}
      </g>

      {/* The eye itself, inside its lids. */}
      <g clipPath={`url(#${id}-lids)`}>
        <circle r={236} fill={`url(#${id}-glow)`} />
        <circle r={160} className="eye-ring-dots" />
        <g ref={iris}>
          <g className="eye-iris">
            <circle r={128} className="eye-ring" />
            <circle r={112} className="eye-ring-dash" />
            <circle r={84} className="eye-ring-dots" />
            <circle r={58} className="eye-ring" />
            {layout.map((s) => {
              const cx = Math.cos(s.angle);
              const sy = Math.sin(s.angle);
              const L = s.length * 0.72;
              return (
                <g key={s.part.id} className={s.part.done ? 'eye-spoke eye-spoke-done' : 'eye-spoke'} data-part={s.part.id}>
                  <line x1={cx * 40} y1={sy * 40} x2={cx * L} y2={sy * L} />
                  {s.beads.map((b, j) => (
                    <circle key={j} cx={cx * L * b} cy={sy * L * b} r={1.8} className="eye-bead" />
                  ))}
                  {s.body > 0 && <circle cx={cx * L * s.bodyAt} cy={sy * L * s.bodyAt} r={s.body * 0.8} className="eye-body" />}
                  <circle cx={cx * L} cy={sy * L} r={s.part.kind === 'target' ? 5.5 : 3.8} className="eye-node" />
                </g>
              );
            })}
          </g>
        </g>
        <g ref={pupil}>
          <circle r={pupilR + 10} className="eye-pupil-halo" />
          <circle r={pupilR} className="eye-pupil" />
          <circle r={pupilR * 0.42} className="eye-pupil-core" />
          <circle cx={-pupilR * 0.38} cy={-pupilR * 0.4} r={3.2} className="eye-glint" />
        </g>
      </g>
      <path ref={outline} d={lids(state === 'defeated' ? 0.03 : state === 'escaped' ? 0.42 : 1)} className="eye-lid" />
    </svg>
  );
}
