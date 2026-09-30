import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref, type RefObject } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { BossPart, BossState } from '../../domain/quests';
import { cn } from '../../lib/cn';
import { clockParts } from '../../lib/dates';
import {
  arc,
  DIAL,
  EH,
  EW,
  FIBRES,
  GAZE,
  hand,
  HOUR,
  lids,
  MINUTE,
  paintStars,
  R_ARMOR,
  R_HP,
  R_TEXT,
  R_TICKS,
  RC,
  RI,
  ringText,
  seeded,
  segment,
  spokes,
  SUB,
  TAU,
  ticks,
  WINDOW,
} from './eyeArt';

export interface EyeHandle {
  /** Fire at a part of the boss from an element (a Strike button): a beam, and its spoke flares. */
  strike(from: Element, partId: string): void;
}

interface Plate {
  integrity: number;
  broken: boolean;
  withdrawn?: boolean;
}

/** Where the eye sits and how large: beside the console on a wide screen, high and cropped on a small one. */
function place(w: number, h: number, wide: boolean) {
  if (wide) {
    const room = Math.max(320, w - 410);
    const k = Math.max(0.55, Math.min((room * 0.94) / (2 * EW), (h * 0.74) / (2 * EH)));
    return { cx: room / 2 + 10, cy: h * 0.55, k };
  }
  const k = Math.max(0.45, Math.min((w * 1.2) / (2 * EW), (h * 0.5) / (2 * EH)));
  return { cx: w / 2, cy: h * 0.42, k };
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const backOut = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const pad = (n: number) => String(n).padStart(2, '0');
const NS = 'http://www.w3.org/2000/svg';

/** A few stars that breathe, on top of the painted sky. */
const TWINKLES = (() => {
  const r = seeded(41);
  return Array.from({ length: 9 }, () => ({ left: `${4 + r() * 92}%`, top: `${4 + r() * 90}%`, delay: `${-r() * 6}s`, dur: `${4 + r() * 5}s` }));
})();

/**
 * The boss: the eye of something vast in space, whose pupil is an old clock.
 *
 * The stage is a rig of layers around one centre. Behind, two painted skies
 * and a slow glow; then an orrery of rings that turns (its strength as the
 * ring of segments, a numbered segment per piece of work, dark once done; its
 * armor as plates further out; a line of text going round); then the eye, its
 * iris a field of fibres with a spoke for each piece of work, and at its
 * centre the clock, keeping the real time in your zone, the days left in its
 * window. The far rings move against its gaze, so it has depth.
 *
 * It wakes when you arrive (a slit, then it opens heavily and the hands sweep
 * to the hour), then stares at you: it follows the pointer (on a phone, the
 * tilt or your touch), and with nothing moving it looks straight out of the
 * screen, never away, with the small darts of a living eye. When you go to
 * strike it narrows and the clock swells; it looks at the piece of work you
 * point to; a strike is a beam, and it flinches. Near its date it narrows,
 * burns orange and its light beats. Beaten, it closes and its rings stop; got
 * away, it half closes and looks aside. Still, with reduced motion.
 */
export function BossEye({
  parts,
  state,
  urgent,
  hit,
  look,
  alert = false,
  armor = [],
  wide,
  ring,
  hp,
  maxHp,
  daysLeft,
  label,
  dormant = false,
  ref,
}: {
  parts: BossPart[];
  state: BossState;
  /** Its date is close. */
  urgent: boolean;
  /** Changes each time it is hit. */
  hit: number;
  /** A part to look at (being pointed to in the list). */
  look?: string;
  /** You are about to strike. */
  alert?: boolean;
  /** Its armor plates, as a ring further out: whole, chipped, or broken. */
  armor?: Plate[];
  /** Leave room for the console on the right. */
  wide: boolean;
  /** What the turning ring of text says. */
  ring: string;
  hp: number;
  maxHp: number;
  daysLeft: number;
  label: string;
  /** No boss: a closed eye, asleep. */
  dormant?: boolean;
  ref?: Ref<EyeHandle>;
}) {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const root = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const skyFar = useRef<HTMLDivElement>(null);
  const skyNear = useRef<HTMLDivElement>(null);
  const starsFar = useRef<HTMLCanvasElement>(null);
  const starsNear = useRef<HTMLCanvasElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);
  const eye = useRef<SVGSVGElement>(null);
  const iris = useRef<SVGGElement>(null);
  const flares = useRef<SVGGElement>(null);
  const clock = useRef<SVGGElement>(null);
  const hourHand = useRef<SVGGElement>(null);
  const minuteHand = useRef<SVGGElement>(null);
  const secondHand = useRef<SVGGElement>(null);
  const lidClip = useRef<SVGPathElement>(null);
  const lidLine = useRef<SVGPathElement>(null);
  const lidOuter = useRef<SVGPathElement>(null);
  const lidShade = useRef<SVGPathElement>(null);
  const beams = useRef<SVGSVGElement>(null);
  const shock = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ w: 0, h: 0, cx: 0, cy: 0, k: 1 });
  const layout = useMemo(() => spokes(parts), [parts]);
  const id = `eye${useId().replace(/[^\w]/g, '')}`;
  const n = Math.max(parts.length, 1);
  const rest = dormant || state === 'defeated' ? 0.02 : state === 'escaped' ? 0.42 : urgent ? 0.84 : 1;

  // What the loop reads, so it never restarts when these change.
  const live = useRef({ state, look, alert, urgent, rest, layout, dormant, k: geo.k, hitAt: 0, reduced });
  Object.assign(live.current, { state, look, alert, urgent, rest, layout, dormant, k: geo.k, reduced });

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const p = place(w, h, wide);
      setGeo((g) => (g.w === w && g.h === h && g.cx === p.cx && g.cy === p.cy && g.k === p.k ? g : { w, h, ...p }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [wide]);

  // The sky is painted once per size.
  useEffect(() => {
    if (!geo.w || !starsFar.current || !starsNear.current) return;
    paintStars(starsFar.current, geo.w + 80, geo.h + 80, false);
    paintStars(starsNear.current, geo.w + 80, geo.h + 80, true);
  }, [geo.w, geo.h]);

  // A hit: it flinches, a shock goes out, the whole of it shudders.
  useEffect(() => {
    if (!hit) return;
    live.current.hitAt = performance.now();
    if (reduced) return;
    shock.current?.animate(
      [
        { transform: 'scale(1)', opacity: 0.85 },
        { transform: 'scale(3.8)', opacity: 0 },
      ],
      { duration: 950, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
    body.current?.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: 'translate(-5px,2px)' },
        { transform: 'translate(4px,-3px)' },
        { transform: 'translate(-3px,1px)' },
        { transform: 'translate(1px,-1px)' },
        { transform: 'translate(0,0)' },
      ],
      { duration: 360, easing: 'ease-out' },
    );
  }, [hit, reduced]);

  useImperativeHandle(
    ref,
    () => ({
      strike(from, partId) {
        const box = root.current?.getBoundingClientRect();
        const layer = beams.current;
        const node = eye.current?.querySelector(`[data-part="${CSS.escape(partId)}"] .eye-node`);
        if (!box || !layer || !node || live.current.reduced) return;
        const a = from.getBoundingClientRect();
        const b = node.getBoundingClientRect();
        const [x1, y1] = [a.left + a.width / 2 - box.left, a.top + a.height / 2 - box.top];
        const [x2, y2] = [b.left + b.width / 2 - box.left, b.top + b.height / 2 - box.top];
        const len = Math.hypot(x2 - x1, y2 - y1);
        const make = (tag: string, cls: string, attrs: Record<string, number>) => {
          const el = document.createElementNS(NS, tag);
          el.setAttribute('class', cls);
          for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v.toFixed(1));
          layer.append(el);
          return el as SVGElement;
        };
        const done = (el: Element) => () => el.remove();
        for (const cls of ['quest-beam', 'quest-beam-core']) {
          const line = make('line', cls, { x1, y1, x2, y2 });
          line.style.strokeDasharray = `${len} ${len}`;
          const run = line.animate(
            [
              { strokeDashoffset: len, opacity: 1 },
              { strokeDashoffset: 0, opacity: 1, offset: 0.3 },
              { strokeDashoffset: 0, opacity: 0 },
            ],
            { duration: 640, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' },
          );
          run.finished.then(done(line), done(line));
        }
        const burst = (cx: number, cy: number, r: number, cls: string, delay: number) => {
          const c = make('circle', cls, { cx, cy, r });
          const run = c.animate(
            [
              { transform: 'scale(0)', opacity: 0 },
              { transform: 'scale(0.25)', opacity: 1, offset: 0.2 },
              { transform: 'scale(1)', opacity: 0 },
            ],
            { duration: 720, delay, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' },
          );
          run.finished.then(done(c), done(c));
        };
        burst(x1, y1, 16, 'quest-muzzle', 0);
        burst(x2, y2, 34, 'quest-impact', 170);
        // The spoke itself flares along its length, and fades.
        const s = live.current.layout.find((x) => x.part.id === partId);
        if (s && flares.current) {
          const [c, si] = [Math.cos(s.angle), Math.sin(s.angle)];
          const line = document.createElementNS(NS, 'line');
          line.setAttribute('class', 'eye-flare');
          line.setAttribute('x1', (c * s.from).toFixed(1));
          line.setAttribute('y1', (si * s.from).toFixed(1));
          line.setAttribute('x2', (c * s.to).toFixed(1));
          line.setAttribute('y2', (si * s.to).toFixed(1));
          flares.current.append(line);
          const run = line.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 1100, delay: 150, fill: 'both' });
          run.finished.then(done(line), done(line));
        }
      },
    }),
    [],
  );

  // The loop: lids, gaze, pupil, depth and the hands of the clock. Nothing re-renders React.
  useEffect(() => {
    const el = root.current;
    const lidPaths = [lidClip, lidLine, lidOuter, lidShade];
    let lastLids = -1;
    const setLids = (o: number) => {
      if (Math.abs(o - lastLids) < 0.0004) return;
      lastLids = o;
      const d = lids(o);
      for (const p of lidPaths) p.current?.setAttribute('d', d);
    };
    const last = { h: '', m: '', s: '' };
    const setHands = (h: number, m: number, s: number) => {
      const [hs, ms, ss] = [`rotate(${h.toFixed(2)})`, `rotate(${m.toFixed(2)})`, `rotate(${s.toFixed(2)} 0 ${SUB.y.toFixed(1)})`];
      if (hs !== last.h) hourHand.current?.setAttribute('transform', (last.h = hs));
      if (ms !== last.m) minuteHand.current?.setAttribute('transform', (last.m = ms));
      if (ss !== last.s) secondHand.current?.setAttribute('transform', (last.s = ss));
    };
    const angles = () => {
      const c = clockParts(new Date());
      const [h, m, s] = [Number(c.h), Number(c.m), Number(c.s)];
      return { h: ((h % 12) + m / 60) * 30, m: (m + s / 60) * 6, s: s * 6 };
    };
    const setGaze = (gx: number, gy: number, dil: number) => {
      iris.current?.setAttribute('transform', `translate(${gx.toFixed(1)} ${gy.toFixed(1)})`);
      clock.current?.setAttribute('transform', `translate(${(gx * 1.12).toFixed(1)} ${(gy * 1.12).toFixed(1)}) scale(${dil.toFixed(3)})`);
    };

    if (reduced) {
      const { state: st, rest: r } = live.current;
      setLids(r);
      setGaze(st === 'escaped' ? -GAZE * 0.8 : 0, st === 'escaped' ? GAZE * 0.3 : 0, 1);
      const tick = () => {
        const a = angles();
        setHands(a.h, a.m, a.s);
      };
      tick();
      el?.setAttribute('data-awake', '');
      const timer = window.setInterval(tick, 20000);
      return () => window.clearInterval(timer);
    }

    const pointer = { x: 0, y: 0, at: -1e9 };
    const tilt = { x: 0, y: 0, at: -1e9 };
    const aim = (clientX: number, clientY: number) => {
      const r = eye.current?.getBoundingClientRect();
      if (!r) return;
      const dx = clientX - (r.left + r.width / 2);
      const dy = clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy) || 1;
      const reach = Math.min(1, d / (r.width * 0.55));
      pointer.x = (dx / d) * reach * GAZE;
      pointer.y = (dy / d) * reach * GAZE * 0.62;
      pointer.at = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') aim(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => aim(e.clientX, e.clientY);
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt.x = Math.max(-1, Math.min(1, e.gamma / 30)) * GAZE;
      tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * GAZE * 0.62;
      tilt.at = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('deviceorientation', onTilt);
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (el) io.observe(el);

    const wakeAt = performance.now();
    const awake = window.setTimeout(() => el?.setAttribute('data-awake', ''), 60);
    let open = 0.012;
    let openV = 0;
    let dil = 0.55;
    const gaze = { x: 0, y: 0 };
    const dart = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
    let blinkAt = 0;
    let nextBlink = wakeAt + 7000 + Math.random() * 6000;
    let lastHit = live.current.hitAt;
    let lastSec = -1;
    let a = angles();
    let secFrom = a.s;
    let secTo = a.s;
    let secAt = 0;
    const move = (ref: RefObject<HTMLElement | null>, x: number, y: number) => {
      if (ref.current) ref.current.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    };

    let raf = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (!visible || document.hidden) return;
      const L = live.current;
      const wake = now - wakeAt;
      const active = L.state === 'active' && !L.dormant;
      // Blinks: when hit, and rarely by itself; it has no need to.
      if (L.hitAt !== lastHit) {
        lastHit = L.hitAt;
        blinkAt = now;
      }
      if (active && wake > 3000 && now > nextBlink) {
        blinkAt = now;
        nextBlink = now + 7000 + Math.random() * 7000;
      }
      const since = now - blinkAt;
      const blink = blinkAt && since < 280 ? Math.sin((since / 280) * Math.PI) : 0;
      // Lids: shut while it wakes, then heavily open (a little past, and back); narrowed when you go to strike.
      let goal = wake < 420 ? 0.012 : L.rest * (L.alert && active ? 0.78 : 1);
      goal *= 1 - blink * 0.97;
      if (blink) {
        open += (goal - open) * 0.6;
        openV = 0;
      } else {
        openV = openV * 0.78 + (goal - open) * 0.035;
        open += openV;
      }
      // The clock: small as it wakes, swollen when you go to strike, tight near its date.
      const dGoal = wake < 650 ? 0.55 : (L.urgent ? 0.9 : 1) * (L.alert && active ? 1.13 : 1);
      dil += (dGoal - dil) * 0.07;
      // Where it looks: the part you point to; you (the pointer, the tilt); else straight out at you.
      let [tx, ty] = [0, 0];
      let ease = 0.05;
      const target = L.look ? L.layout.find((s) => s.part.id === L.look) : undefined;
      if (L.dormant || L.state === 'defeated' || wake < 1300) [tx, ty] = [0, 0];
      else if (L.state === 'escaped') [tx, ty] = [-GAZE * 0.8, GAZE * 0.3];
      else if (target) {
        [tx, ty] = [Math.cos(target.angle) * GAZE, Math.sin(target.angle) * GAZE * 0.62];
        ease = 0.08;
      } else if (now - pointer.at < 3200) [tx, ty] = [pointer.x, pointer.y];
      else if (now - tilt.at < 3200) [tx, ty] = [tilt.x, tilt.y];
      gaze.x += (tx - gaze.x) * ease;
      gaze.y += (ty - gaze.y) * ease;
      // Small quick darts, so it is never quite still.
      if (active && now > dart.next) {
        dart.tx = (Math.random() - 0.5) * 10;
        dart.ty = (Math.random() - 0.5) * 6;
        dart.next = now + 380 + Math.random() * 1300;
      }
      dart.x += (dart.tx - dart.x) * 0.35;
      dart.y += (dart.ty - dart.y) * 0.35;
      // A flinch when hit.
      const hs = now - L.hitAt;
      const j = L.hitAt && hs < 340 ? (1 - hs / 340) * 11 : 0;
      const gx = gaze.x + dart.x + (j ? (Math.random() - 0.5) * 2 * j : 0);
      const gy = gaze.y + dart.y + (j ? (Math.random() - 0.5) * 2 * j : 0);
      setLids(open);
      setGaze(gx, gy, dil);
      // Depth: the rings and the sky move against its gaze.
      const k = L.k;
      move(far, -gx * k * 0.12, -gy * k * 0.12);
      move(mid, -gx * k * 0.05, -gy * k * 0.05);
      move(near, -gx * k * 0.025, -gy * k * 0.025);
      move(skyFar, -gx * k * 0.07, -gy * k * 0.07);
      move(skyNear, -gx * k * 0.18, -gy * k * 0.18);
      // The hands: they sweep to the hour as it wakes, then keep the time; the seconds step, with a small recoil.
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        a = angles();
        secFrom = secTo;
        secTo = a.s;
        if (secTo < secFrom) secFrom -= 360;
        secAt = now;
      }
      const sweep = L.dormant || wake < 900 ? 0 : wake < 2200 ? easeInOut((wake - 900) / 1300) : 1;
      const s = secFrom + (secTo - secFrom) * backOut(Math.min(1, (now - secAt) / 260));
      setHands(a.h * sweep, a.m * sweep, s * sweep);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(awake);
      io.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('deviceorientation', onTilt);
    };
  }, [reduced]);

  const box = (hw: number, hh: number) => ({ left: geo.cx - hw * geo.k, top: geo.cy - hh * geo.k, width: 2 * hw * geo.k, height: 2 * hh * geo.k });
  /** A size in pixels, in units. */
  const px = (v: number) => v / geo.k;
  const plate = (i: number, count: number, whole: number): [string | null, string | null] => {
    const span = 360 / count;
    const gap = Math.min(6, span * 0.18);
    const a0 = -90 + i * span + gap / 2;
    const a1 = -90 + (i + 1) * span - gap / 2;
    const m = a0 + (a1 - a0) * whole;
    return [m - a0 > 0.5 ? arc(R_ARMOR, a0, m) : null, a1 - m > 0.5 ? arc(R_ARMOR, m, a1) : null];
  };
  const days = dormant ? '--' : state === 'defeated' ? '00' : pad(Math.max(0, daysLeft));
  const textSize = px(9);
  const lidsNow = lids(dormant || state === 'defeated' ? 0.02 : 0.012);

  return (
    <div
      ref={root}
      className="quest-rig"
      data-state={dormant ? 'dormant' : state}
      data-urgent={urgent && state === 'active' ? '' : undefined}
      role="img"
      aria-label={label}
      style={{ '--cx': `${geo.cx}px`, '--cy': `${geo.cy}px` } as CSSProperties}
    >
      <div ref={skyFar} className="quest-sky">
        <canvas ref={starsFar} />
      </div>
      <div ref={skyNear} className="quest-sky">
        <canvas ref={starsNear} />
      </div>
      {TWINKLES.map((s, i) => (
        <span key={i} className="quest-twinkle" style={{ left: s.left, top: s.top, animationDelay: s.delay, animationDuration: s.dur }} />
      ))}

      <div ref={body} className="quest-body">
        <div className="quest-glow" style={{ left: geo.cx, top: geo.cy, width: 1200 * geo.k, height: 1200 * geo.k }} />

        {/* Far: the great rings of the instrument, turning. */}
        <div ref={far} className="quest-layer quest-ring-layer" style={box(660, 660)}>
          <svg viewBox="-660 -660 1320 1320" className="quest-turn">
            <circle r={600} className="eye-band" />
            <circle r={520} className="eye-ring-faint" />
            <circle r={548} className="eye-ring-dots" />
            <circle r={572} className="eye-ring-faint" />
            <circle r={640} className="eye-ring-faint" />
            <path d={ticks(72, 628, 634)} className="eye-ticks" />
            <path d={arc(520, -40, 58)} className="eye-arc" />
            <path d={arc(640, 150, 206)} className="eye-arc eye-arc-thin" />
            <circle cx={520 * Math.cos((58 * Math.PI) / 180)} cy={520 * Math.sin((58 * Math.PI) / 180)} r={4} className="eye-moon" />
            <circle cx={640 * Math.cos((150 * Math.PI) / 180)} cy={640 * Math.sin((150 * Math.PI) / 180)} r={3} className="eye-moon" />
            {[
              [118, 600, 24],
              [322, 600, 13],
              [205, 520, 9],
              [36, 572, 6],
            ].map(([a, r, s]) => {
              const [x, y] = [r * Math.cos((a * Math.PI) / 180), r * Math.sin((a * Math.PI) / 180)];
              return (
                <g key={a}>
                  <circle cx={x} cy={y} r={s} className="eye-planet" />
                  <circle cx={x} cy={y} r={s * 1.7} className="eye-ring-faint" />
                </g>
              );
            })}
          </svg>
        </div>

        {/* Middle: its strength (a numbered segment per piece of work), its ticks, its armor, its horizon. */}
        <div ref={mid} className="quest-layer quest-ring-layer" style={box(460, 460)}>
          <svg viewBox="-460 -460 920 920">
            <path d={ticks(120, R_TICKS, R_TICKS + 5, (i) => i % 10 === 0)} className="eye-ticks" />
            <path d={ticks(12, R_TICKS - 2, R_TICKS + 12)} className="eye-ticks-major" />
            {parts.map((p, i) => (
              <path key={p.id} d={segment(i, n, R_HP)} className={cn('eye-hp', p.done && 'eye-hp-done', look === p.id && 'is-look')} />
            ))}
            {parts.map((p, i) => {
              const a = -Math.PI / 2 + ((i + 0.5) * TAU) / n;
              return (
                <text
                  key={p.id}
                  x={Math.cos(a) * (R_HP + 24)}
                  y={Math.sin(a) * (R_HP + 24) + px(10.5) * 0.36}
                  fontSize={px(10.5)}
                  textAnchor="middle"
                  className={cn('eye-num', p.done && 'eye-num-done', look === p.id && 'is-look')}
                >
                  {pad(i + 1)}
                </text>
              );
            })}
            {armor.map((p, i) => {
              const [whole, chipped] = plate(i, armor.length, p.broken || p.withdrawn ? 0 : p.integrity);
              return (
                <g key={i} className={p.broken || p.withdrawn ? 'eye-plate eye-plate-broken' : 'eye-plate'}>
                  {whole && <path d={whole} className="eye-plate-whole" />}
                  {chipped && <path d={chipped} className="eye-plate-chipped" />}
                </g>
              );
            })}
            <path
              d={`M${-EW - 16} 0L${-EW - 104} 0M${EW + 16} 0L${EW + 104} 0M${-EW - 104} -5L${-EW - 104} 5M${EW + 104} -5L${EW + 104} 5`}
              className="eye-horizon"
            />
          </svg>
        </div>

        {/* The eye, inside its lids; its pupil is a clock. */}
        <div className="quest-layer" style={box(500, 290)}>
          <svg ref={eye} viewBox="-500 -290 1000 580" className="boss-eye" data-state={dormant ? 'dormant' : state}>
            <defs>
              <clipPath id={`${id}-lids`}>
                <path ref={lidClip} d={lidsNow} />
              </clipPath>
              <radialGradient id={`${id}-sclera`}>
                <stop offset="0" className="eye-sclera-in" />
                <stop offset="0.55" className="eye-sclera-mid" />
                <stop offset="1" className="eye-sclera-out" />
              </radialGradient>
              <radialGradient id={`${id}-dial`}>
                <stop offset="0" stopColor="#0d0f13" />
                <stop offset="1" stopColor="#040506" />
              </radialGradient>
            </defs>
            <g clipPath={`url(#${id}-lids)`}>
              <rect x={-500} y={-290} width={1000} height={580} fill={`url(#${id}-sclera)`} />
              <circle r={300} className="eye-ring-dots" />
              <g ref={iris}>
                <g className="eye-iris">
                  <circle r={RI} className="eye-iris-disc" />
                  <path d={FIBRES.faint} className="eye-fibre" />
                  <path d={FIBRES.bright} className="eye-fibre-bright" />
                  <circle r={RI - 14} className="eye-ring-dash" />
                  <circle r={RI * 0.74} className="eye-ring-dots" />
                  <circle r={RC + 26} className="eye-ring" />
                  {layout.map((s) => {
                    const [c, si] = [Math.cos(s.angle), Math.sin(s.angle)];
                    return (
                      <g key={s.part.id} className={cn('eye-spoke', s.part.done && 'eye-spoke-done', look === s.part.id && 'is-look')} data-part={s.part.id}>
                        <line x1={c * s.from} y1={si * s.from} x2={c * s.to} y2={si * s.to} />
                        {s.beads.map((b, j) => (
                          <circle key={j} cx={c * b} cy={si * b} r={2} className="eye-bead" />
                        ))}
                        {s.body > 0 && <circle cx={c * s.bodyAt} cy={si * s.bodyAt} r={s.body} className="eye-body" />}
                        <circle cx={c * s.to} cy={si * s.to} r={s.part.kind === 'target' ? 6.5 : 4.5} className="eye-node" />
                      </g>
                    );
                  })}
                  <g ref={flares} />
                </g>
              </g>

              <g ref={clock} className="eye-clock">
                <circle r={RC + 22} className="clk-halo" />
                <circle r={RC + 10} className="clk-case" />
                <path d={DIAL.knurl} className="clk-knurl" />
                <circle r={RC} fill={`url(#${id}-dial)`} className="clk-face" />
                <path d={DIAL.rose} className="clk-rose" />
                <circle r={RC * 0.5} className="clk-chapter" />
                <circle r={RC - 7} className="clk-track" />
                <circle r={RC - 12} className="clk-track" />
                <path d={DIAL.minutes} className="clk-minutes" />
                <path d={DIAL.hours} className="clk-hours" />
                <path d={DIAL.heavy} className="clk-num-heavy" />
                <path d={DIAL.hair} className="clk-num-hair" />
                <text y={-RC * 0.38} fontSize={6.2} textAnchor="middle" className="clk-mark">
                  {dormant ? '' : `HP ${pad(hp)}/${pad(maxHp)}`}
                </text>
                <rect x={WINDOW.x} y={-WINDOW.h / 2} width={WINDOW.w} height={WINDOW.h} className="clk-window" />
                <text x={WINDOW.x + WINDOW.w / 2} y={3.7} fontSize={10.5} textAnchor="middle" className="clk-window-text">
                  {days}
                </text>
                <circle cy={SUB.y} r={SUB.r} className="clk-sub" />
                <path d={DIAL.subTicks} transform={`translate(0 ${SUB.y.toFixed(1)})`} className="clk-minutes" />
                <g ref={secondHand}>
                  <line x1={0} y1={SUB.y + 5} x2={0} y2={SUB.y - 16} className="clk-sec" />
                  <circle cy={SUB.y} r={1.8} className="clk-sec-cap" />
                </g>
                <g ref={hourHand}>
                  <path d={hand(HOUR.length, HOUR.moon, HOUR.moonR, HOUR.w)} className="clk-hand" />
                  <circle cy={-HOUR.moon} r={HOUR.moonR} className="clk-moon" />
                </g>
                <g ref={minuteHand}>
                  <path d={hand(MINUTE.length, MINUTE.moon, MINUTE.moonR, MINUTE.w)} className="clk-hand" />
                  <circle cy={-MINUTE.moon} r={MINUTE.moonR} className="clk-moon" />
                </g>
                <circle r={4.4} className="clk-cap" />
                <circle r={1.7} className="clk-pin" />
                <path d={arc(RC * 0.84, 198, 252)} className="clk-glass" />
              </g>
              <path ref={lidShade} d={lidsNow} className="eye-lid-shade" />
            </g>
            <g transform="scale(1.07 1.14)">
              <path ref={lidOuter} d={lidsNow} className="eye-lid-contour" />
            </g>
            <path ref={lidLine} d={lidsNow} className="eye-lid" />
          </svg>
        </div>

        {/* Near: brackets around the iris, a needle, and a line of text going round the other way. */}
        <div ref={near} className="quest-layer quest-ring-layer" style={box(490, 490)}>
          <svg viewBox="-490 -490 980 980" className="quest-turn-back">
            <defs>
              <path id={`${id}-ring`} d={`M0 ${-R_TEXT}A${R_TEXT} ${R_TEXT} 0 1 1 0 ${R_TEXT}A${R_TEXT} ${R_TEXT} 0 1 1 0 ${-R_TEXT}`} />
            </defs>
            {geo.w > 0 && (
              <text fontSize={textSize} className="eye-ring-text">
                <textPath href={`#${id}-ring`} textLength={TAU * R_TEXT * 0.995} lengthAdjust="spacing">
                  {ringText(ring, R_TEXT, textSize)}
                </textPath>
              </text>
            )}
            <path d={arc(264, 196, 244)} className="eye-bracket" />
            <path d={arc(264, 16, 64)} className="eye-bracket" />
            <path d={arc(280, 100, 132)} className="eye-bracket-dash" />
            <path d={arc(280, 280, 312)} className="eye-bracket-dash" />
            <line x1={410} y1={0} x2={446} y2={0} className="eye-needle" />
            <circle cx={410} cy={0} r={3} className="eye-moon" />
          </svg>
        </div>

        <div ref={shock} className="quest-shock" style={{ left: geo.cx, top: geo.cy, width: 2 * (RC + 16) * geo.k, height: 2 * (RC + 16) * geo.k }} />
      </div>
      <svg ref={beams} className="quest-beams" />
    </div>
  );
}
