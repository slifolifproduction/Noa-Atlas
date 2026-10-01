import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref, type RefObject } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { BossPart, BossState } from '../../domain/quests';
import { cn } from '../../lib/cn';
import { clockParts } from '../../lib/dates';
import {
  arc,
  CONTOUR,
  drawStars,
  DIAL,
  EW,
  FIBRES,
  fitEye,
  grainTile,
  HOUR,
  lids,
  makeStars,
  membraneReach,
  NEAR,
  NEAR_TURN,
  MINUTE,
  paintDimension,
  paintMembrane,
  PITCH,
  R_ARMOR,
  RC,
  RI,
  spokes,
  paintTear,
  SUB,
  TEAR_W,
  tearWindow,
  turn,
  YAW,
  type Box,
  type Star,
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
const NS = 'http://www.w3.org/2000/svg';

/**
 * Its arrival, in ms from when it appears. Space cracks along a line that
 * runs out from the middle (to CRACKED); that line is only the trigger: it
 * bursts and fades as space tears open on another dimension (to TORN), which
 * rushes at us. Out of that dimension's depth the eye comes forward,
 * out of focus and dim, growing and pulling into focus (from EMERGES, see
 * .quest-emerge), its lids opening as it comes (OPENS), and it lands, a
 * shock going out from its pupil and the stage shuddering (ARRIVES). Sealed,
 * the tear stands open only this much (SCAR).
 */
const CRACKED = 480;
const TORN = 1300;
const EMERGES = 700;
const OPENS = 1950;
const ARRIVES = 2250;
const SCAR = 0.035;

/**
 * The camera. It follows where you point on the stage (or how you tilt a
 * phone), eased, never the eye's own darts or flinches, and it is focused on
 * the eye: what lies behind the eye is carried against it, the further the
 * more, and the tear, nearer than the eye, moves with it. Its reach is PULL
 * of the stage's smaller side, so the picture moves alike at any size or
 * zoom; DEPTH is each layer's share of it (negative: nearer than the eye).
 * The stars take theirs from their own distance.
 */
const PULL = 0.04;
const DEPTH = { tear: -0.3, haze: 0.6, back: 0.5, ring: 0.25 };
/** The other dimension's two layers (its still depths, its nearest ring): their depth, and how far in they rush from as the tear opens. */
const DIM_DEPTH = [DEPTH.back, DEPTH.ring];
const RUSH = [0.84, 0.7];

/**
 * The boss: the eye of something vast, looking into our space through a tear
 * from another dimension. Its pupil is an old clock.
 *
 * The stage is a rig of layers around one centre, shot like a film: the lens
 * is focused on the eye, and the camera follows where you point (see PULL).
 * Behind it, a sky of stars at many depths drifting slowly out towards you,
 * and the tear, a long lens torn open level across space on the eye's own line;
 * it stays, closes to a scar when the boss is beaten, and burns orange near
 * its date. Through it, and only through it (its window, a clip in the same
 * shape), the eye's own dimension, which is not space: a haze with light at
 * its end, lines between points drifting in it, and a tunnel of torn
 * membrane, ring behind ring, each turning its way. At the end of the
 * tunnel, the eye with its glow, and nothing of it outside its lids: no ring
 * floats loose round it. The tear's lips and burning edges are painted over
 * it all, and grain in front. The eye is placed as large as it can be without
 * touching the text over it (`avoid`).
 *
 * The eye is a ball that turns: its iris (a field of fibres with a spoke for
 * each piece of work, and its rings, all inside its edge), its armor as
 * plates round the iris's edge, and its pupil are one disc on the ball, so
 * they always move together; turning carries the disc across and
 * foreshortens it, the pupil only dilates about the iris's centre, and the
 * light on the white follows. The pupil is a clock drawn as one of the
 * atlas's instruments, keeping the real time in your zone.
 *
 * It comes out of the tear (EMERGES..ARRIVES), then stares at you: it follows
 * the pointer (on a phone, the tilt or your touch), and with nothing moving it
 * looks straight out of the screen, never away, with the small darts of a
 * living eye. When you go to strike it narrows and the pupil swells; it looks
 * at the spoke of the piece of work you point to, where that spoke is now; a
 * strike is a beam, and it flinches and blinks, a shock going out from its
 * pupil and the stage shuddering. Near
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
  /** Its armor plates, round the edge of its iris: whole, chipped, or broken. */
  armor?: Plate[];
  /** A wide screen: the eye stays whole on the stage. */
  wide: boolean;
  /** Boxes of text on the stage (in its pixels) the eye must not touch. */
  avoid?: Box[];
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
  const sky = useRef<HTMLCanvasElement>(null);
  const field = useRef<{ stars: Star[]; q: number }>({ stars: [], q: 1 });
  const dim = useRef<HTMLDivElement>(null);
  const emerge = useRef<HTMLDivElement>(null);
  const tearFront = useRef<HTMLDivElement>(null);
  const portal = useRef<HTMLDivElement>(null);
  const frontShape = useRef<HTMLDivElement>(null);
  const windowPath = useRef<SVGPathElement>(null);
  const tearEdge = useRef<HTMLCanvasElement>(null);
  const tearHalo = useRef<HTMLCanvasElement>(null);
  const burst = useRef<HTMLDivElement>(null);
  const crack = useRef<HTMLDivElement>(null);
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
  // The other dimension: its two layers (its still depths, its nearest ring), and their paintings.
  const dimLayers = useRef<(HTMLDivElement | null)[]>([]);
  const dimBack = useRef<HTMLCanvasElement>(null);
  const dimNear = useRef<HTMLCanvasElement>(null);
  const flash = useRef<HTMLDivElement>(null);
  const beams = useRef<SVGSVGElement>(null);
  const shock = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ w: 0, h: 0, cx: 0, cy: 0, k: 1 });
  const layout = useMemo(() => spokes(parts), [parts]);
  const id = `eye${useId().replace(/[^\w]/g, '')}`;
  const rest = dormant || state === 'defeated' ? 0.02 : state === 'escaped' ? 0.42 : urgent ? 0.84 : 1;
  const avoidKey = avoid.map((b) => `${Math.round(b.x)},${Math.round(b.y)},${Math.round(b.w)},${Math.round(b.h)}`).join(';');

  // What the loop reads, so it never restarts when these change.
  const live = useRef({
    state,
    look,
    alert,
    urgent,
    rest,
    layout,
    dormant,
    k: geo.k,
    w: geo.w,
    h: geo.h,
    cx: geo.cx,
    cy: geo.cy,
    hitAt: 0,
    reduced,
    // Where its pupil is on the stage, and until when a shock from it is running (it follows the pupil).
    px: 0,
    py: 0,
    shockUntil: 0,
  });
  Object.assign(live.current, { state, look, alert, urgent, rest, layout, dormant, k: geo.k, w: geo.w, h: geo.h, cx: geo.cx, cy: geo.cy, reduced });
  // The camera's reach on this stage, and how far past the stage the layers it carries are painted, so no edge shows.
  const pull = Math.min(geo.w, geo.h) * PULL;
  const over = Math.ceil(pull * (DEPTH.haze - DEPTH.tear)) + 12;

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

  // The sky's stars are made once per size and drawn by the loop (here once, for a still sky).
  useEffect(() => {
    const c = sky.current;
    if (!geo.w || !c) return;
    const q = Math.min(window.devicePixelRatio || 1, 1.5);
    c.width = Math.round(geo.w * q);
    c.height = Math.round(geo.h * q);
    field.current = { stars: makeStars(geo.w, geo.h), q };
    const ctx = c.getContext('2d');
    const { cx, cy } = live.current;
    if (ctx) drawStars(ctx, field.current.stars, { w: geo.w, h: geo.h, q, vx: cx, vy: cy, ox: 0, oy: 0, dt: 0, t: 0 });
  }, [geo.w, geo.h]);

  // The tear is painted once per size, boss and mood (its edge burns orange near the date).
  const hot = urgent && state === 'active';
  useEffect(() => {
    if (!geo.w || !tearEdge.current || !tearHalo.current) return;
    paintTear(tearEdge.current, tearHalo.current, {
      w: geo.w + 2 * over,
      h: geo.h + 2 * over,
      cx: geo.cx + over,
      cy: geo.cy + over,
      k: geo.k,
      seed,
      urgent: hot,
    });
  }, [geo, seed, hot, over]);
  // The other dimension is painted once per size and boss: its still depths, and its nearest ring (it turns in CSS).
  useEffect(() => {
    if (!geo.w || !dimNear.current) return;
    paintMembrane(dimNear.current, { k: geo.k, seed });
  }, [geo.w, geo.k, seed]);
  useEffect(() => {
    if (!geo.w || !dimBack.current) return;
    paintDimension(dimBack.current, { w: geo.w + 2 * over, h: geo.h + 2 * over, cx: geo.cx + over, cy: geo.cy + over, k: geo.k, seed });
  }, [geo, seed, over]);
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

  /** A shock going out from the pupil; the loop keeps it on the pupil as the eye turns. */
  const shockwave = (scale = 3.8) => {
    const el = shock.current;
    if (!el) return;
    const L = live.current;
    L.shockUntil = performance.now() + 1000;
    el.style.translate = `calc(-50% + ${L.px.toFixed(1)}px) calc(-50% + ${L.py.toFixed(1)}px)`;
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

  // A hit: it flinches and blinks, a shock goes out from its pupil, the whole of it shudders.
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
    const cam = { x: 0, y: 0, tx: 0, ty: 0 };
    const reach = (v: number) => Math.max(-1, Math.min(1, v));
    const frame = (clientX: number, clientY: number) => {
      const r = el?.getBoundingClientRect();
      if (!r?.width) return;
      cam.tx = reach((clientX - r.left - r.width / 2) / (r.width / 2));
      cam.ty = reach((clientY - r.top - r.height / 2) / (r.height / 2));
    };
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
      if (e.pointerType === 'touch') return;
      aim(e.clientX, e.clientY);
      frame(e.clientX, e.clientY);
    };
    const onDown = (e: PointerEvent) => {
      aim(e.clientX, e.clientY);
      if (e.pointerType !== 'touch') frame(e.clientX, e.clientY);
    };
    // Out of the window, the camera comes back to rest.
    const onOut = (e: MouseEvent) => {
      if (!e.relatedTarget) cam.tx = cam.ty = 0;
    };
    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      cam.tx = reach(e.gamma / 30);
      cam.ty = reach((e.beta - 45) / 30);
      tilt.x = Math.max(-1, Math.min(1, e.gamma / 30)) * YAW;
      tilt.y = Math.max(-1, Math.min(1, (e.beta - 45) / 30)) * PITCH;
      tilt.at = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('deviceorientation', onTilt);
    document.addEventListener('mouseout', onOut);
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
        // The crack itself: a line of white light running out, gone once the tear is open.
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
          // The dimension beyond rushes at us as it opens, its nearest rings the most.
          dimLayers.current.forEach((el, i) =>
            el?.animate([{ scale: String(RUSH[i]) }, { scale: '1' }], { duration: 2400, easing: 'cubic-bezier(.16,.8,.2,1)' }),
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
      carry(gx, gy, dil);
      // A shock stays centred on the pupil while it runs, wherever the eye turns.
      if (now < L.shockUntil && shock.current) shock.current.style.translate = `calc(-50% + ${L.px.toFixed(1)}px) calc(-50% + ${L.py.toFixed(1)}px)`;
      // The camera, eased; each layer carried by its depth. The tear and its window move as one, and what is
      // inside the window is carried relative to it.
      const ce = 1 - Math.exp(-dt / 380);
      cam.x += (cam.tx - cam.x) * ce;
      cam.y += (cam.ty - cam.y) * ce;
      const P = Math.min(L.w, L.h) * PULL;
      const [ox, oy] = [-cam.x * P, -cam.y * P];
      const put = (r: RefObject<HTMLElement | null> | HTMLElement | null, f: number) => {
        const node = r && 'current' in r ? r.current : r;
        if (node) node.style.transform = `translate3d(${(ox * f).toFixed(1)}px,${(oy * f).toFixed(1)}px,0)`;
      };
      put(tearFront, DEPTH.tear);
      put(portal, DEPTH.tear);
      put(dim, DEPTH.haze - DEPTH.tear);
      DIM_DEPTH.forEach((d, i) => put(dimLayers.current[i], d - DEPTH.tear));
      put(emerge, -DEPTH.tear);
      const sc = sky.current?.getContext('2d');
      if (sc) drawStars(sc, field.current.stars, { w: L.w, h: L.h, q: field.current.q, vx: L.cx, vy: L.cy, ox, oy, dt, t: now });
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
      document.removeEventListener('mouseout', onOut);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  const box = (hw: number, hh: number) => ({ left: geo.cx - hw * geo.k, top: geo.cy - hh * geo.k, width: 2 * hw * geo.k, height: 2 * hh * geo.k });
  const plate = (i: number, count: number, whole: number): [string | null, string | null] => {
    const span = 360 / count;
    const gap = Math.min(6, span * 0.18);
    const a0 = -90 + i * span + gap / 2;
    const a1 = -90 + (i + 1) * span - gap / 2;
    const m = a0 + (a1 - a0) * whole;
    return [m - a0 > 0.5 ? arc(R_ARMOR, a0, m) : null, a1 - m > 0.5 ? arc(R_ARMOR, m, a1) : null];
  };
  const lidsNow = lids(dormant || state === 'defeated' ? 0.02 : 0.012);
  const nearReach = membraneReach(NEAR) * geo.k;
  // The light at the end of the tunnel, where the eye is: a pale haze with a faint warm core, burning near its date.
  const [lx, ly, lc] = [Math.round(1000 * geo.k), Math.round(560 * geo.k), Math.round(240 * geo.k)];
  const dimLight = [
    `radial-gradient(circle ${lc}px at ${geo.cx + over}px ${geo.cy + over}px, ${hot ? 'rgb(255 110 50 / 0.34)' : 'rgb(255 172 124 / 0.16)'}, transparent)`,
    `radial-gradient(ellipse ${lx}px ${ly}px at ${geo.cx + over}px ${geo.cy + over}px, ${
      hot
        ? 'rgb(172 136 118), rgb(138 90 66) 22%, rgb(92 58 44) 42%, rgb(48 32 27) 66%, rgb(19 16 15)'
        : 'rgb(134 136 140), rgb(104 107 112) 22%, rgb(72 75 80) 42%, rgb(40 42 47) 66%, rgb(17 18 21)'
    })`,
  ].join(', ');
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
      <canvas ref={sky} className="quest-stars" />

      <div ref={body} className="quest-body">
        {/* The eye's dimension, seen only through the tear. Not space: a haze with light at its end, lines
            drifting in it, and a tunnel of torn membrane round the eye, ring behind ring, turning; then the eye. */}
        <div ref={portal} className="quest-portal" style={{ clipPath: `url(#${id}-window)` }}>
          <div ref={dim} className="quest-dim" style={{ inset: -over }}>
            <div className="quest-dim-light" style={{ background: dimLight, transformOrigin: `${geo.cx + over}px ${geo.cy + over}px` }} />
          </div>
          <div
            ref={(el) => {
              dimLayers.current[0] = el;
            }}
            className="quest-dim-layer"
            style={{ transformOrigin: `${geo.cx}px ${geo.cy}px` }}
          >
            <canvas ref={dimBack} className="quest-tear-canvas" style={{ left: -over, top: -over, width: geo.w + 2 * over, height: geo.h + 2 * over }} />
          </div>
          <div
            ref={(el) => {
              dimLayers.current[1] = el;
            }}
            className="quest-dim-layer"
            style={{ transformOrigin: `${geo.cx}px ${geo.cy}px` }}
          >
            <canvas
              ref={dimNear}
              className="quest-membrane"
              style={{
                left: geo.cx - nearReach,
                top: geo.cy - nearReach,
                width: 2 * nearReach,
                height: 2 * nearReach,
                animationDuration: `${NEAR_TURN}s`,
              }}
            />
          </div>
          <div ref={emerge} className="quest-emerge">
            <div className="quest-glow" style={{ left: geo.cx, top: geo.cy, width: 1200 * geo.k, height: 1200 * geo.k }} />

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
                    {/* Its armor: plates round the edge of the iris, whole, chipped or broken. */}
                    {armor.map((p, i) => {
                      const [whole, chipped] = plate(i, armor.length, p.broken || p.withdrawn ? 0 : p.integrity);
                      return (
                        <g key={i} className={p.broken || p.withdrawn ? 'eye-plate eye-plate-broken' : 'eye-plate'}>
                          {whole && <path d={whole} className="eye-plate-whole" />}
                          {chipped && <path d={chipped} className="eye-plate-chipped" />}
                        </g>
                      );
                    })}

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

            {/* A shock going out from its pupil as it lands, and when it is hit. */}
            <div ref={shock} className="quest-shock" style={{ left: geo.cx, top: geo.cy, width: 2 * (RC + 16) * geo.k, height: 2 * (RC + 16) * geo.k }} />
          </div>
        </div>

        {/* In front: the tear's torn edge and the cracks at its ends, and its halo, burning and breathing. */}
        <div ref={tearFront} className="quest-tear-move">
          <div ref={frontShape} className="quest-tear-shape" style={{ inset: -over, transformOrigin: `${geo.cx + over}px ${geo.cy + over}px` }}>
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
      </div>
      {grain && <div className="quest-grain" style={{ backgroundImage: `url(${grain})` }} />}
      <svg ref={beams} className="quest-beams" />
    </div>
  );
}
