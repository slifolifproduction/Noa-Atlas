import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref, type RefObject } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { BossPart, BossState } from '../../domain/quests';
import { cn } from '../../lib/cn';
import { clockParts } from '../../lib/dates';
import {
  arc,
  CONTOUR,
  DIAL,
  EW,
  FIBRES,
  fitEye,
  grainTile,
  HORIZON,
  HOUR,
  lids,
  MINUTE,
  paintStars,
  PITCH,
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
  paintTear,
  STREAMS,
  SUB,
  TAU,
  TEAR_W,
  tearWindow,
  ticks,
  turn,
  YAW,
  type Box,
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

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const backOut = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const pad = (n: number) => String(n).padStart(2, '0');
const NS = 'http://www.w3.org/2000/svg';

/**
 * Its arrival, in ms from when it appears. Space cracks along a line that
 * runs out from the middle (to CRACKED), then tears open on another
 * dimension (to TORN). Out of that dimension's depth the eye comes forward,
 * out of focus and dim, growing and pulling into focus (from EMERGES, see
 * .quest-emerge), its lids opening as it comes (OPENS), and it lands with a
 * shock (ARRIVES). Sealed, the tear stands open only this much (SCAR).
 */
const CRACKED = 480;
const TORN = 1300;
const EMERGES = 700;
const OPENS = 1950;
const ARRIVES = 2250;
const SCAR = 0.035;

/** A few stars that breathe, on top of the painted sky. */
const TWINKLES = (() => {
  const r = seeded(41);
  return Array.from({ length: 9 }, () => ({ left: `${4 + r() * 92}%`, top: `${4 + r() * 90}%`, delay: `${-r() * 6}s`, dur: `${4 + r() * 5}s` }));
})();

/**
 * The boss: the eye of something vast, looking into our space through a tear
 * from another dimension. Its pupil is an old clock.
 *
 * The stage is a rig of layers around one centre, shot like a film: the lens
 * is focused on the eye. Behind it, the painted sky (the far stars soft) and
 * the tear, a long lens of another dimension torn open across space, its
 * edges burning faintly, light streaming along its seam and its depths
 * falling away inside; it stays, closes to a scar when the boss is beaten,
 * and burns orange near its date. Then, seen only through the tear (its
 * window, a clip in the same shape), the eye with its glow and an orrery
 * of rings that turns (the far rings soft; its strength as the ring of
 * segments, a numbered segment per piece of work, dark once done; its armor
 * as plates further out; a line of text going round); the tear's burning
 * edges are painted again over it. In front: a thin anamorphic streak
 * through the pupil, and grain. The eye is placed as large as it can be without touching the text
 * over it (`avoid`).
 *
 * The eye is a ball that turns: its iris (a field of fibres with a spoke for
 * each piece of work, and its rings, all inside its edge) and its pupil are
 * one disc on the ball, so they always move together; turning carries the disc across and
 * foreshortens it, the pupil only dilates about the iris's centre, and the
 * light on the white follows. The pupil is a clock drawn as one of the
 * atlas's instruments, keeping the real time in your zone.
 *
 * It comes out of the tear (EMERGES..ARRIVES), then stares at you: it follows
 * the pointer (on a phone, the tilt or your touch), and with nothing moving it
 * looks straight out of the screen, never away, with the small darts of a
 * living eye. When you go to strike it narrows and the pupil swells; it looks
 * at the spoke of the piece of work you point to, where that spoke is now; a
 * strike is a beam, and it flinches, a shock going out from its pupil. Near
 * its date it narrows, burns orange and its light beats. Beaten, it closes,
 * its rings stop and the tear seals to a scar; got away, it half closes and
 * looks aside. Still, with reduced motion.
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
  avoid = [],
  ring,
  label,
  seed = 1,
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
  /** A wide screen: the eye stays whole on the stage. */
  wide: boolean;
  /** Boxes of text on the stage (in its pixels) the eye must not touch. */
  avoid?: Box[];
  /** What the turning ring of text says. */
  ring: string;
  label: string;
  /** Shapes its tear, so each boss looks through its own. */
  seed?: number;
  /** No boss: a closed eye, asleep behind a sealed scar. */
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
  const tearBack = useRef<HTMLDivElement>(null);
  const tearFront = useRef<HTMLDivElement>(null);
  const portal = useRef<HTMLDivElement>(null);
  const backShape = useRef<HTMLDivElement>(null);
  const frontShape = useRef<HTMLDivElement>(null);
  const windowPath = useRef<SVGPathElement>(null);
  const tearBase = useRef<HTMLCanvasElement>(null);
  const tearEdge = useRef<HTMLCanvasElement>(null);
  const tearHalo = useRef<HTMLCanvasElement>(null);
  const burst = useRef<HTMLDivElement>(null);
  const crack = useRef<HTMLDivElement>(null);
  const far = useRef<HTMLDivElement>(null);
  const mid = useRef<HTMLDivElement>(null);
  const near = useRef<HTMLDivElement>(null);
  const eye = useRef<SVGSVGElement>(null);
  const disc = useRef<SVGGElement>(null);
  const spin = useRef<SVGGElement>(null);
  const flares = useRef<SVGGElement>(null);
  const pupil = useRef<SVGGElement>(null);
  const sclera = useRef<SVGRadialGradientElement>(null);
  const hourHand = useRef<SVGGElement>(null);
  const minuteHand = useRef<SVGGElement>(null);
  const secondHand = useRef<SVGGElement>(null);
  const lidClip = useRef<SVGPathElement>(null);
  const lidLine = useRef<SVGPathElement>(null);
  const lidOuter = useRef<SVGPathElement>(null);
  const lidShade = useRef<SVGPathElement>(null);
  const streak = useRef<HTMLDivElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const beams = useRef<SVGSVGElement>(null);
  const shock = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ w: 0, h: 0, cx: 0, cy: 0, k: 1 });
  const layout = useMemo(() => spokes(parts), [parts]);
  const id = `eye${useId().replace(/[^\w]/g, '')}`;
  const n = Math.max(parts.length, 1);
  const rest = dormant || state === 'defeated' ? 0.02 : state === 'escaped' ? 0.42 : urgent ? 0.84 : 1;
  const avoidKey = avoid.map((b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`).join(';');

  // What the loop reads, so it never restarts when these change.
  const live = useRef({ state, look, alert, urgent, rest, layout, dormant, k: geo.k, cx: geo.cx, cy: geo.cy, hitAt: 0, reduced, px: 0, py: 0 });
  Object.assign(live.current, { state, look, alert, urgent, rest, layout, dormant, k: geo.k, cx: geo.cx, cy: geo.cy, reduced });

  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const boxes = avoid;
    const measure = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      if (!w || !h) return;
      const p = fitEye(w, h, boxes, wide);
      setGeo((g) => (g.w === w && g.h === h && g.cx === p.cx && g.cy === p.cy && g.k === p.k ? g : { w, h, ...p }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The boxes are read through their key, so a new array with the same boxes does not re-place it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, avoidKey]);

  // The sky is painted once per size.
  useEffect(() => {
    if (!geo.w || !starsFar.current || !starsNear.current) return;
    paintStars(starsFar.current, geo.w + 80, geo.h + 80, false);
    paintStars(starsNear.current, geo.w + 80, geo.h + 80, true);
  }, [geo.w, geo.h]);

  // The tear is painted once per size, boss and mood (its edge burns orange near the date).
  const hot = urgent && state === 'active';
  useEffect(() => {
    if (!geo.w || !tearBase.current || !tearEdge.current || !tearHalo.current) return;
    paintTear(tearBase.current, tearEdge.current, tearHalo.current, {
      w: geo.w + 80,
      h: geo.h + 80,
      cx: geo.cx + 40,
      cy: geo.cy + 40,
      k: geo.k,
      seed,
      urgent: hot,
    });
  }, [geo, seed, hot]);
  // The window onto the eye's dimension: the tear's own shape, on the stage.
  const windowD = useMemo(() => (geo.w ? tearWindow(seed, geo.cx, geo.cy, geo.k) : ''), [seed, geo.w, geo.cx, geo.cy, geo.k]);

  // The tear: run out along its line by `reveal`, open by `gap`. Its paintings and the window onto
  // the eye's dimension take the same shape, so nothing of that dimension shows outside it.
  const tearAt = useRef({ reveal: 0.002, gap: 0.004, key: '' });
  const setTear = (reveal: number, gap: number) => {
    const { cx, cy } = live.current;
    const t = tearAt.current;
    Object.assign(t, { reveal, gap });
    const key = `${reveal.toFixed(4)} ${gap.toFixed(4)} ${cx.toFixed(1)} ${cy.toFixed(1)}`;
    if (key === t.key) return;
    t.key = key;
    const tf = `scale(${reveal.toFixed(4)}, ${gap.toFixed(4)})`;
    if (backShape.current) backShape.current.style.transform = tf;
    if (frontShape.current) frontShape.current.style.transform = tf;
    windowPath.current?.setAttribute('transform', `translate(${cx.toFixed(1)} ${cy.toFixed(1)}) ${tf} translate(${(-cx).toFixed(1)} ${(-cy).toFixed(1)})`);
  };
  const sealed = dormant || state === 'defeated';
  // The window moves with the eye when the stage changes size, and with reduced motion it seals here.
  useLayoutEffect(() => {
    const t = tearAt.current;
    if (reduced) setTear(1, sealed ? SCAR : 1);
    else setTear(t.reveal, t.gap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geo.cx, geo.cy, sealed, reduced]);

  /** A shock going out from the pupil. */
  const shockwave = (scale = 3.8) => {
    const el = shock.current;
    if (!el) return;
    const { px: x, py: y } = live.current;
    el.style.translate = `calc(-50% + ${x.toFixed(1)}px) calc(-50% + ${y.toFixed(1)}px)`;
    el.animate(
      [
        { transform: 'scale(1)', opacity: 0.85 },
        { transform: `scale(${scale})`, opacity: 0 },
      ],
      { duration: 950, easing: 'cubic-bezier(.2,.7,.2,1)' },
    );
  };
  const shudder = (amp: number) =>
    body.current?.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${-amp}px,${amp * 0.4}px)` },
        { transform: `translate(${amp * 0.8}px,${-amp * 0.6}px)` },
        { transform: `translate(${-amp * 0.6}px,${amp * 0.2}px)` },
        { transform: `translate(${amp * 0.2}px,${-amp * 0.2}px)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 360, easing: 'ease-out' },
    );

  // A hit: it flinches, a shock goes out from its pupil, the whole of it shudders.
  useEffect(() => {
    if (!hit) return;
    live.current.hitAt = performance.now();
    if (reduced) return;
    shockwave();
    shudder(5);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // The loop: its arrival, lids, gaze, pupil, depth and the hands of the clock. Nothing re-renders React.
  useEffect(() => {
    const el = root.current;
    let lastLids = -1;
    const setLids = (o: number) => {
      if (Math.abs(o - lastLids) < 0.0004) return;
      lastLids = o;
      const d = lids(o);
      for (const p of [lidClip, lidLine, lidOuter, lidShade]) p.current?.setAttribute('d', d);
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
    const move = (r: RefObject<HTMLElement | null>, x: number, y: number) => {
      if (r.current) r.current.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)`;
    };
    // The eyeball turns: iris, its rings and the pupil are one disc on it, carried and foreshortened
    // together; the pupil only dilates about the same centre, and the light on the white follows.
    const carry = (yaw: number, pitch: number, dil: number) => {
      const t = turn(yaw, pitch);
      disc.current?.setAttribute('transform', t.matrix());
      pupil.current?.setAttribute('transform', `scale(${dil.toFixed(3)})`);
      sclera.current?.setAttribute('cx', (0.5 + (t.x / 1000) * 0.6).toFixed(4));
      sclera.current?.setAttribute('cy', (0.5 + (t.y / 580) * 0.6).toFixed(4));
      live.current.px = t.x * live.current.k;
      live.current.py = t.y * live.current.k;
      // The lens's streak runs level through the pupil.
      move(streak, 0, live.current.cy + live.current.py);
      return t;
    };

    if (reduced) {
      const { state: st, rest: r } = live.current;
      setLids(r);
      carry(st === 'escaped' ? -YAW * 0.8 : 0, st === 'escaped' ? PITCH * 0.3 : 0, 1);
      const tick = () => {
        const a = angles();
        setHands(a.h, a.m, a.s);
      };
      tick();
      el?.setAttribute('data-awake', '');
      el?.setAttribute('data-arrived', '');
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
      pointer.x = (dx / d) * reach * YAW;
      pointer.y = (dy / d) * reach * PITCH;
      pointer.at = performance.now();
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') aim(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => aim(e.clientX, e.clientY);
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt.x = Math.max(-1, Math.min(1, e.gamma / 30)) * YAW;
      tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * PITCH;
      tilt.at = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('deviceorientation', onTilt);
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    if (el) io.observe(el);

    const wakeAt = performance.now();
    const dormant = live.current.dormant;
    // Out of the depth of the tear it comes (the emergence is CSS, started here); asleep, it is simply there.
    const awake = window.setTimeout(() => el?.setAttribute('data-awake', ''), dormant ? 0 : EMERGES);
    let arrived = dormant;
    let broke = dormant;
    let torn = dormant;
    let gap = dormant ? SCAR : 0.015;
    if (dormant) setTear(1, SCAR);
    let open = 0.012;
    let openV = 0;
    let dil = 0.55;
    // Gaze and darts are angles of the eyeball (yaw, pitch), in radians.
    const gaze = { x: 0, y: 0 };
    const dart = { x: 0, y: 0, tx: 0, ty: 0, next: 0 };
    let turned = 0;
    let lastFrame = wakeAt;
    let blinkAt = 0;
    let nextBlink = wakeAt + 8000 + Math.random() * 6000;
    let lastHit = live.current.hitAt;
    let lastSec = -1;
    let a = angles();
    let secFrom = a.s;
    let secTo = a.s;
    let secAt = 0;

    let raf = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      if (!visible || document.hidden) return;
      const L = live.current;
      const wake = now - wakeAt;
      const active = L.state === 'active' && !L.dormant;
      const dt = Math.min(64, now - lastFrame);
      lastFrame = now;
      // The tear: a crack runs out along its line, flickering; then space tears open on the other
      // dimension, with a burst and a shudder. Once open it stays; beaten, it seals to a scar.
      const tearGoal = L.dormant || L.state === 'defeated' ? SCAR : 1;
      if (!torn) {
        const reveal = easeInOut(clamp01(wake / CRACKED));
        if (wake >= CRACKED) gap = 0.015 + (tearGoal - 0.015) * backOut(clamp01((wake - CRACKED) / (TORN - CRACKED)));
        setTear(Math.max(0.002, reveal), gap);
        const flicker = wake < CRACKED ? (0.55 + Math.random() * 0.45).toFixed(2) : '';
        if (tearFront.current) tearFront.current.style.opacity = flicker;
        // The crack itself: a line of white light running out, fading into the seam as the tear opens.
        if (crack.current) {
          crack.current.style.transform = `scaleX(${reveal.toFixed(4)})`;
          crack.current.style.opacity = wake < CRACKED ? flicker : clamp01(1 - (wake - CRACKED) / 600).toFixed(3);
        }
        if (!broke && wake >= CRACKED) {
          broke = true;
          burst.current?.animate(
            [
              { transform: 'scale(0.2, 0.05)', opacity: 0.9 },
              { transform: 'scale(1.6, 0.9)', opacity: 0 },
            ],
            { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)' },
          );
          flash.current?.animate(
            [
              { opacity: 0, transform: 'scale(0.6)' },
              { opacity: 0.85, transform: 'scale(1)', offset: 0.15 },
              { opacity: 0, transform: 'scale(1.5)' },
            ],
            { duration: 1000, easing: 'ease-out' },
          );
          shudder(7);
        }
        if (wake >= TORN) torn = true;
      } else if (Math.abs(tearGoal - gap) > 0.0005) {
        gap += (tearGoal - gap) * (1 - Math.exp(-dt / 450));
        setTear(1, gap);
      }
      // It lands: a shock from its pupil, the stage shudders, the tear flares behind it.
      if (!arrived && wake >= ARRIVES) {
        arrived = true;
        el?.setAttribute('data-arrived', '');
        shockwave(4.4);
        shudder(4);
      }
      // The iris turns slowly on itself (once in three minutes), until it is beaten.
      if (!L.dormant && L.state !== 'defeated') turned -= dt * 0.002;
      spin.current?.setAttribute('transform', `rotate(${turned.toFixed(2)})`);
      // Blinks: when hit, and rarely by itself; it has no need to.
      if (L.hitAt !== lastHit) {
        lastHit = L.hitAt;
        blinkAt = now;
      }
      if (active && wake > ARRIVES + 3000 && now > nextBlink) {
        blinkAt = now;
        nextBlink = now + 8000 + Math.random() * 7000;
      }
      const since = now - blinkAt;
      const blink = blinkAt && since < 280 ? Math.sin((since / 280) * Math.PI) : 0;
      // Lids: shut while it comes, opening as it arrives (heavily, a little past, and back); narrowed when you go to strike.
      const opensAt = L.dormant ? 0 : OPENS;
      let goal = wake < opensAt ? 0.012 : L.rest * (L.alert && active ? 0.78 : 1);
      goal *= 1 - blink * 0.97;
      if (blink) {
        open += (goal - open) * 0.6;
        openV = 0;
      } else {
        openV = openV * 0.78 + (goal - open) * 0.035;
        open += openV;
      }
      // The pupil: small as it opens, swollen when you go to strike, tight near its date.
      const dGoal = wake < opensAt + 250 ? 0.55 : (L.urgent ? 0.9 : 1) * (L.alert && active ? 1.13 : 1);
      dil += (dGoal - dil) * 0.07;
      // Where it looks: the part you point to; you (the pointer, the tilt); else straight out at you.
      let [tx, ty] = [0, 0];
      let ease = 0.05;
      const target = L.look ? L.layout.find((s) => s.part.id === L.look) : undefined;
      if (L.dormant || L.state === 'defeated' || wake < opensAt + 500) [tx, ty] = [0, 0];
      else if (L.state === 'escaped') [tx, ty] = [-YAW * 0.8, PITCH * 0.3];
      else if (target) {
        // Where that spoke is now, as the iris has turned.
        const at = target.angle + (turned * Math.PI) / 180;
        [tx, ty] = [Math.cos(at) * YAW, Math.sin(at) * PITCH];
        ease = 0.08;
      } else if (now - pointer.at < 3200) [tx, ty] = [pointer.x, pointer.y];
      else if (now - tilt.at < 3200) [tx, ty] = [tilt.x, tilt.y];
      gaze.x += (tx - gaze.x) * ease;
      gaze.y += (ty - gaze.y) * ease;
      // Small quick darts, so it is never quite still.
      if (active && now > dart.next) {
        dart.tx = (Math.random() - 0.5) * 0.05;
        dart.ty = (Math.random() - 0.5) * 0.03;
        dart.next = now + 380 + Math.random() * 1300;
      }
      dart.x += (dart.tx - dart.x) * 0.35;
      dart.y += (dart.ty - dart.y) * 0.35;
      // A flinch when hit.
      const hs = now - L.hitAt;
      const j = L.hitAt && hs < 340 ? (1 - hs / 340) * 0.06 : 0;
      const gx = gaze.x + dart.x + (j ? (Math.random() - 0.5) * 2 * j : 0);
      const gy = gaze.y + dart.y + (j ? (Math.random() - 0.5) * 2 * j : 0);
      setLids(open);
      const t = carry(gx, gy, dil);
      // Depth: what lies behind the eye moves against its gaze, and the motes near the lens with it, more.
      const k = L.k;
      // The tear, and the window in it, move as one.
      move(tearBack, -t.x * k * 0.04, -t.y * k * 0.04);
      move(portal, -t.x * k * 0.04, -t.y * k * 0.04);
      move(tearFront, -t.x * k * 0.04, -t.y * k * 0.04);
      move(far, -t.x * k * 0.06, -t.y * k * 0.06);
      move(mid, -t.x * k * 0.025, -t.y * k * 0.025);
      move(near, -t.x * k * 0.012, -t.y * k * 0.012);
      move(skyFar, -t.x * k * 0.03, -t.y * k * 0.03);
      move(skyNear, -t.x * k * 0.08, -t.y * k * 0.08);
      // The hands: they sweep to the hour as it opens, then keep the time; the seconds step, with a small recoil.
      const sec = Math.floor(Date.now() / 1000);
      if (sec !== lastSec) {
        lastSec = sec;
        a = angles();
        secFrom = secTo;
        secTo = a.s;
        if (secTo < secFrom) secFrom -= 360;
        secAt = now;
      }
      const sweep = L.dormant || wake < opensAt + 100 ? 0 : easeInOut(clamp01((wake - opensAt - 100) / 1300));
      const s = secFrom + (secTo - secFrom) * backOut(clamp01((now - secAt) / 260));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const textSize = px(9);
  const lidsNow = lids(dormant || state === 'defeated' ? 0.02 : 0.012);
  const grain = grainTile();

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
        {/* The tear in space: behind, the void of the other side, its seam and the light along it. */}
        <div ref={tearBack} className="quest-tear-move">
          <div ref={backShape} className="quest-tear-shape" style={{ transformOrigin: `${geo.cx + 40}px ${geo.cy + 40}px` }}>
            <canvas ref={tearBase} className="quest-tear-canvas" />
            {/* Its seam, and light streaming along it. */}
            <div className="quest-seam-line" style={{ left: geo.cx + 40, top: geo.cy + 40 }}>
              <div className="quest-seam" style={{ width: 2 * TEAR_W * 0.9 * geo.k }} />
              <div className="quest-streams">
                {STREAMS.map((s, i) => (
                  <span
                    key={i}
                    className="quest-stream"
                    style={
                      {
                        top: s.y * geo.k,
                        width: s.len * geo.k,
                        '--reach': `${s.reach * TEAR_W * geo.k}px`,
                        '--dir': s.left ? -1 : 1,
                        animationDuration: `${s.dur}s`,
                        animationDelay: `${s.delay}s`,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* The eye's dimension, seen only through the tear: its light, its rings, the eye. */}
        <div ref={portal} className="quest-portal" style={{ clipPath: `url(#${id}-window)` }}>
          <div className="quest-emerge">
            <div className="quest-glow" style={{ left: geo.cx, top: geo.cy, width: 1200 * geo.k, height: 1200 * geo.k }} />

            {/* Far: the great rings of the instrument, turning. */}
            <div ref={far} className="quest-layer quest-ring-layer" style={box(660, 660)}>
              <svg viewBox="-660 -660 1320 1320" className="quest-turn">
                <g>
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
                </g>
              </svg>
            </div>

            {/* Middle: its ticks, its strength (a numbered segment per piece of work), its armor, its horizon. */}
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
                  d={`M${-HORIZON.from} 0L${-HORIZON.to} 0M${HORIZON.from} 0L${HORIZON.to} 0M${-HORIZON.to} -5L${-HORIZON.to} 5M${HORIZON.to} -5L${HORIZON.to} 5`}
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
                  <radialGradient ref={sclera} id={`${id}-sclera`}>
                    <stop offset="0" className="eye-sclera-in" />
                    <stop offset="0.55" className="eye-sclera-mid" />
                    <stop offset="1" className="eye-sclera-out" />
                  </radialGradient>
                </defs>
                <g clipPath={`url(#${id}-lids)`}>
                  {/* The white of it is solid: it is in front of the tear, not a window onto it. */}
                  <rect x={-500} y={-290} width={1000} height={580} className="eye-sclera-base" />
                  <rect x={-500} y={-290} width={1000} height={580} fill={`url(#${id}-sclera)`} />
                  {/* One disc on the eyeball: the iris, the rings round it, and the pupil at its centre. They turn as one. */}
                  <g ref={disc}>
                    <g ref={spin}>
                      <circle r={RI} className="eye-iris-disc" />
                      <path d={FIBRES.faint} className="eye-fibre" />
                      <path d={FIBRES.bright} className="eye-fibre-bright" />
                      <circle r={RI - 14} className="eye-ring-dash" />
                      <circle r={RI * 0.74} className="eye-ring-dots" />
                      <circle r={RC + 30} className="eye-ring" />
                      {layout.map((s) => {
                        const [c, si] = [Math.cos(s.angle), Math.sin(s.angle)];
                        return (
                          <g
                            key={s.part.id}
                            className={cn('eye-spoke', s.part.done && 'eye-spoke-done', look === s.part.id && 'is-look')}
                            data-part={s.part.id}
                          >
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
                    <circle r={RI - 5} className="eye-limbus" />

                    {/* The pupil: an old clock, drawn as an instrument. */}
                    <g ref={pupil}>
                      <circle r={RC + 19} className="clk-orbit" />
                      <circle r={RC + 13} className="clk-rim" />
                      <path d={DIAL.minutes} className="clk-minutes" />
                      <path d={DIAL.hours} className="clk-hours" />
                      <circle r={RC} className="clk-face" />
                      <circle r={RC - 30} className="clk-dots" />
                      <circle r={26} className="clk-inner" />
                      <path d={DIAL.reticle} className="clk-reticle" />
                      <path d={DIAL.numerals} className="clk-numerals" />
                      <circle cy={SUB.y} r={SUB.r} className="clk-sub" />
                      <path d={DIAL.subTicks} transform={`translate(0 ${SUB.y.toFixed(1)})`} className="clk-minutes" />
                      <g ref={secondHand}>
                        <line x1={0} y1={SUB.y} x2={0} y2={SUB.y - SUB.r + 3} className="clk-sweep" />
                        <circle cy={SUB.y - SUB.r} r={2.3} className="clk-sec-moon" />
                      </g>
                      <g ref={hourHand}>
                        <line x1={0} y1={7} x2={0} y2={-(HOUR.length - HOUR.node)} className="clk-hand" />
                        <circle cy={-HOUR.length * 0.5} r={1.6} className="clk-bead" />
                        <circle cy={-HOUR.length} r={HOUR.node} className="clk-hand-node" />
                      </g>
                      <g ref={minuteHand}>
                        <line x1={0} y1={10} x2={0} y2={-MINUTE.length} className="clk-hand clk-hand-minute" />
                        <circle cy={-MINUTE.length * 0.62} r={1.4} className="clk-bead" />
                        <circle cy={-MINUTE.length} r={MINUTE.node} className="clk-hand-tip" />
                      </g>
                      <circle r={5.5} className="clk-core" />
                      <circle r={1.9} className="clk-pin" />
                    </g>
                  </g>
                  <path ref={lidShade} d={lidsNow} className="eye-lid-shade" />
                </g>
                <g transform={`scale(${CONTOUR.x} ${CONTOUR.y})`}>
                  <path ref={lidOuter} d={lidsNow} className="eye-lid-contour" />
                </g>
                <path ref={lidLine} d={lidsNow} className="eye-lid" />
              </svg>
            </div>

            {/* Near: brackets of light, a needle, and a line of text going round the other way. */}
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
                <line x1={410} y1={0} x2={446} y2={0} className="eye-needle" />
                <circle cx={410} cy={0} r={3} className="eye-moon" />
              </svg>
            </div>

            <div ref={shock} className="quest-shock" style={{ left: geo.cx, top: geo.cy, width: 2 * (RC + 16) * geo.k, height: 2 * (RC + 16) * geo.k }} />
          </div>
        </div>

        {/* In front: the tear's torn edge and the cracks at its ends, and its halo, burning and breathing. */}
        <div ref={tearFront} className="quest-tear-move">
          <div ref={frontShape} className="quest-tear-shape" style={{ transformOrigin: `${geo.cx + 40}px ${geo.cy + 40}px` }}>
            <canvas ref={tearHalo} className="quest-tear-canvas quest-tear-glow" />
            <canvas ref={tearEdge} className="quest-tear-canvas" />
          </div>
          <div ref={crack} className="quest-crack" style={{ left: geo.cx, top: geo.cy, width: 2 * TEAR_W * geo.k, marginLeft: -TEAR_W * geo.k }} />
        </div>
        <svg className="quest-window" aria-hidden>
          <defs>
            <clipPath id={`${id}-window`} clipPathUnits="userSpaceOnUse">
              <path ref={windowPath} d={windowD} transform="scale(1 0.004)" />
            </clipPath>
          </defs>
        </svg>
        {/* Light out of the tear as it breaks open, in our own space. */}
        <div ref={burst} className="quest-burst" style={{ left: geo.cx, top: geo.cy, width: 2 * TEAR_W * geo.k, height: 360 * geo.k }} />
        <div ref={flash} className="quest-flash" style={{ left: geo.cx, top: geo.cy, width: 2 * EW * 1.3 * geo.k, height: 2 * EW * 0.8 * geo.k }} />

        {/* The lens: a streak through the pupil, and grain. */}
        <div
          ref={streak}
          className="quest-streak"
          style={
            {
              '--from': `${Math.max(0, geo.cx - EW * CONTOUR.x * geo.k)}px`,
              '--to': `${geo.cx + EW * CONTOUR.x * geo.k}px`,
            } as CSSProperties
          }
        />
      </div>
      {grain && <div className="quest-grain" style={{ backgroundImage: `url(${grain})` }} />}
      <svg ref={beams} className="quest-beams" />
    </div>
  );
}
