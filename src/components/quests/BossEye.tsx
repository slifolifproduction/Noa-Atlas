import { useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type Ref, type RefObject } from 'react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import type { BossPart, BossState } from '../../domain/quests';
import { cn } from '../../lib/cn';
import { clockParts } from '../../lib/dates';
import {
  arc,
  CONTOUR,
  drawStars,
  type Ripple,
  DIAL,
  EW,
  FIBRES,
  fitEye,
  grainTile,
  HOUR,
  lids,
  makeStars,
  MINUTE,
  DEPTHS,
  paintDepth,
  PITCH,
  R_ARMOR,
  RC,
  RI,
  spokes,
  paintTear,
  SUB,
  TAU,
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
 * .quest-emerge), its lids opening as it comes (OPENS), and it lands with
 * its weight (ARRIVES): a shock from its pupil, a ripple through space, a
 * punch of the camera, a shake, and the space round it drained of light for a
 * moment. Space is struck as it tears too: a ripple runs out along the tear's
 * line and the stage shakes hard. Sealed, the tear stands open only this much
 * (SCAR).
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
const DEPTH = { tear: -0.3, haze: 1 };
/**
 * The other dimension's depths (see DEPTHS: its deepest ring, what drifts in its haze, its middle ring,
 * its nearest ring): how deep each lies, spread wide so each is seen to move on its own, and how far in
 * each rushes from as the tear opens, the nearest the most.
 */
const DIM_DEPTH = [0.95, 0.7, 0.45, 0.15];
const RUSH = [0.9, 0.84, 0.76, 0.66];

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
 * living eye. Its pupil reacts all the time, as a machine's would: an
 * aperture that opens and closes in stops, each reached on a servo (quick, a
 * little past, and back), the iris giving way to it like the leaves of a lens
 * and the ring at its rim turning like a focus ring. It tightens on you as you
 * come near its centre and when you move quickly, opens when nobody is
 * watching, shuts to a point when hit, lands wide-eyed, and is never quite
 * still (a slow rhythm of its own, quick near its date; a twitch at each
 * dart); the whole iris leans in on what it looks at and recoils when hit.
 * When you go to strike it narrows and the pupil opens wide; it looks
 * at the spoke of the piece of work you point to, where that spoke is now; a
 * strike is a beam, and it flinches and blinks, a shock going out from its
 * pupil and the stage shaking. Near
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
  empty = false,
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
  /** A boss beaten or gone: a closed eye, asleep behind a sealed scar. */
  dormant?: boolean;
  /**
   * No boss yet, ever: only space and its stars, with nothing of the tear or the eye. The first boss breaks space
   * open as it arrives.
   */
  empty?: boolean;
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
  const tearSplit = useRef<(HTMLCanvasElement | null)[]>([]);
  const burst = useRef<HTMLDivElement>(null);
  const crack = useRef<HTMLDivElement>(null);
  const eye = useRef<SVGSVGElement>(null);
  const disc = useRef<SVGGElement>(null);
  const spin = useRef<SVGGElement>(null);
  // The iris as a lens: its fibres, its rings and its spokes, set out between the pupil's edge and its own.
  const fibres = useRef<SVGGElement>(null);
  const ringInner = useRef<SVGCircleElement>(null);
  const ringDots = useRef<SVGCircleElement>(null);
  const ringFocus = useRef<SVGCircleElement>(null);
  const spokeSet = useRef<SVGGElement>(null);
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
  // The other dimension: its depths, each carried by the camera at its own depth, and their paintings.
  const dimLayers = useRef<(HTMLDivElement | null)[]>([]);
  const dimCanvas = useRef<(HTMLCanvasElement | null)[]>([]);
  const flash = useRef<HTMLDivElement>(null);
  const beams = useRef<SVGSVGElement>(null);
  const shock = useRef<HTMLDivElement>(null);
  const drain = useRef<HTMLDivElement>(null);
  const [geo, setGeo] = useState({ w: 0, h: 0, cx: 0, cy: 0, k: 1 });
  const layout = useMemo(() => spokes(parts), [parts]);
  const id = `eye${useId().replace(/[^\w]/g, '')}`;
  // An empty stage is still: nothing in it to wake.
  dormant ||= empty;
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
    // The weight of what hits the stage: how hard it is shaking (0 to 1, dying away), a punch of the
    // camera still to be given (a push in, sprung back), and the ripples running out through space.
    trauma: 0,
    punch: 0,
    // When the light last split, as space broke.
    chromaAt: 0,
    ripples: [] as (Omit<Ripple, 'age'> & { at: number })[],
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
    paintTear(
      tearEdge.current,
      tearHalo.current,
      {
        w: geo.w + 2 * over,
        h: geo.h + 2 * over,
        cx: geo.cx + over,
        cy: geo.cy + over,
        k: geo.k,
        seed,
        urgent: hot,
      },
      tearSplit.current,
    );
  }, [geo, seed, hot, over]);
  // The other dimension is painted once per scale and boss, a canvas for each of its depths (they turn and breathe in CSS).
  useEffect(() => {
    if (!geo.w) return;
    dimCanvas.current.forEach((c, i) => c && paintDepth(c, i, { k: geo.k, seed }));
  }, [geo.w, geo.k, seed]);
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
  /** Something heavy hits the stage: it shakes (`trauma`, 0 to 1) and the camera is punched in (`punch`). */
  const quake = (trauma: number, punch = 0) => {
    const L = live.current;
    L.trauma = Math.min(1, L.trauma + trauma);
    L.punch += punch;
  };

  // A hit: it flinches and blinks, a shock goes out from its pupil, the whole of it shakes.
  useEffect(() => {
    if (!hit) return;
    live.current.hitAt = performance.now();
    if (reduced) return;
    shockwave();
    quake(0.45, 0.0005);
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
    // together; the pupil only opens and closes about the same centre, and the light on the white follows.
    // `ap` is the pupil's aperture (a scale of the clock) and `lens` the iris's (a scale of the whole disc).
    let lastIris = -1;
    const carry = (yaw: number, pitch: number, ap: number, lens = 1) => {
      const t = turn(yaw, pitch);
      disc.current?.setAttribute('transform', t.matrix(lens));
      pupil.current?.setAttribute('transform', `scale(${ap.toFixed(3)})`);
      // The iris gives way to the pupil like the leaves of a lens: what lies near the pupil goes with it,
      // what lies near the rim stays; the focus ring at its rim turns as the aperture changes.
      if (Math.abs(ap - lastIris) > 0.0008) {
        lastIris = ap;
        const P = RC * ap;
        const at = (r: number) => (P + ((RI - P) * (r - RC)) / (RI - RC)) / r;
        const scale = (n: Element | null, v: number, rest = '') => n?.setAttribute('transform', `${rest}scale(${v.toFixed(4)})`);
        scale(ringInner.current, at(RC + 30));
        scale(ringDots.current, at(RI * 0.74));
        scale(ringFocus.current, at(RI - 14), `rotate(${((ap - 1) * 80).toFixed(2)}) `);
        scale(fibres.current, Math.max(0.82, Math.min(1.02, at(160))));
        scale(spokeSet.current, Math.max(0.8, Math.min(1.03, at(150))));
      }
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

    // Where you point: its angle for the gaze, how near the eye's centre (0) or far (1), and how fast it moves.
    const pointer = { x: 0, y: 0, at: -1e9, near: 1, speed: 0, lx: 0, ly: 0, lt: 0 };
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
      pointer.near = reach;
      const t = performance.now();
      if (t - pointer.lt < 120) pointer.speed = Math.max(pointer.speed, Math.hypot(clientX - pointer.lx, clientY - pointer.ly) / Math.max(8, t - pointer.lt));
      [pointer.lx, pointer.ly, pointer.lt] = [clientX, clientY, t];
      pointer.at = t;
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
    // The pupil's aperture and the iris's lens, each on a servo: quick, a little past, and back.
    const ap = { x: 0.55, v: 0 };
    // The camera's punch, on a spring that rings once: in, a little back past rest, and still.
    const punch = { x: 0, v: 0 };
    let shaking = false;
    const lens = { x: 1, v: 0 };
    const servo = (s: { x: number; v: number }, goal: number, k: number, c: number, dt: number) => {
      for (let left = dt; left > 0; left -= 16) {
        const h = Math.min(16, left);
        s.v += (k * (goal - s.x) - c * s.v) * h;
        s.x += s.v * h;
      }
    };
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
      // dimension, with a burst and a ripple and a shake. Once open it stays; beaten, it seals to a scar.
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
          // It is the seam the tear opens along: gone as the tear opens, not after.
          crack.current.style.opacity = wake < CRACKED ? flicker : ((1 - clamp01((wake - CRACKED) / 140)) ** 2).toFixed(3);
        }
        if (!broke && wake >= CRACKED) {
          broke = true;
          burst.current?.animate(
            [
              { transform: 'scale(0.35, 0.25)', opacity: 0.85 },
              { transform: 'scale(0.9, 0.55)', opacity: 0.35, offset: 0.3 },
              { transform: 'scale(1.6, 0.9)', opacity: 0 },
            ],
            { duration: 900, easing: 'cubic-bezier(.2,.7,.2,1)' },
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
          // Space itself is struck: a ripple runs out from the tear along its line, the stage shakes hard.
          live.current.ripples.push({ at: now, amp: 26, speed: 1.5, life: 1100, flat: 0.42 });
          quake(0.85, 0.0009);
          // And its light splits, once, as through a lens: red and blue swell apart from the tear's edge and
          // close again, smoothly, never a glitch; the stars split too (see drawStars).
          live.current.chromaAt = now;
          tearSplit.current.forEach((el, i) => {
            const [x, y] = i ? [5, 2] : [-5, -2];
            el?.animate(
              [
                { opacity: 0, translate: '0 0', easing: 'cubic-bezier(.2,.8,.3,1)' },
                { opacity: 0.85, translate: `${x}px ${y}px`, offset: 0.22, easing: 'cubic-bezier(.4,0,.2,1)' },
                { opacity: 0, translate: '0 0' },
              ],
              { duration: 560 },
            );
          });
        }
        if (wake >= TORN) torn = true;
      } else if (Math.abs(tearGoal - gap) > 0.0005) {
        gap += (tearGoal - gap) * (1 - Math.exp(-dt / 450));
        setTear(1, gap);
      }
      // It lands: a shock from its pupil, the stage struck, the tear flares behind it.
      if (!arrived && wake >= ARRIVES) {
        arrived = true;
        el?.setAttribute('data-arrived', '');
        shockwave(4.4);
        // It lands with its weight: a ripple out from the eye, a punch of the camera, a shake, and the
        // space round it drained of light for a moment, as if the eye drew it in.
        live.current.ripples.push({ at: now, amp: 16, speed: 1.1, life: 900, flat: 0.85 });
        quake(0.6, 0.00165);
        const drained = [{ opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 0 }];
        drain.current?.animate(drained, { duration: 3200, easing: 'ease-out' });
        sky.current?.animate([{ opacity: 1 }, { opacity: 0.3, offset: 0.08 }, { opacity: 1 }], { duration: 3200, easing: 'ease-out' });
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
      // Small quick darts, so it is never quite still; at each the aperture twitches, as a lens hunts focus.
      if (active && now > dart.next) {
        dart.tx = (Math.random() - 0.5) * 0.05;
        dart.ty = (Math.random() - 0.5) * 0.03;
        dart.next = now + 380 + Math.random() * 1300;
        if (wake > ARRIVES) ap.v += (Math.random() - 0.5) * 0.0016;
      }
      dart.x += (dart.tx - dart.x) * 0.35;
      dart.y += (dart.ty - dart.y) * 0.35;
      // A flinch when hit.
      const hs = now - L.hitAt;
      const j = L.hitAt && hs < 340 ? (1 - hs / 340) * 0.06 : 0;
      const gx = gaze.x + dart.x + (j ? (Math.random() - 0.5) * 2 * j : 0);
      const gy = gaze.y + dart.y + (j ? (Math.random() - 0.5) * 2 * j : 0);
      // The pupil reacts, all the time, as a machine's would: in stops, each reached on a servo.
      pointer.speed *= Math.exp(-dt / 220);
      const watched = now - pointer.at < 3200;
      const tilted = !watched && now - tilt.at < 3200;
      const near = watched ? pointer.near : tilted ? Math.min(1, Math.hypot(tilt.x / YAW, tilt.y / PITCH)) : 1;
      let apGoal = 0.55;
      let lensGoal = 1;
      if (!L.dormant && wake >= opensAt + 250) {
        // Closer to its centre, the tighter it focuses on you; unwatched, it opens to see.
        apGoal = watched || tilted ? 0.8 + 0.2 * near : 1.07;
        if (target) apGoal = 0.84; // a part you point to: it looks closely
        if (L.alert && active) apGoal = 1.18; // you are about to strike: it opens wide
        if (L.urgent && active) apGoal *= 0.92;
        if (L.state === 'escaped') apGoal = 0.78;
        // Never quite still: a slow rhythm of its own, quick and shallow near its date, like its beat.
        apGoal += L.urgent ? 0.03 * Math.sin((now / 1600) * TAU) : 0.022 * Math.sin((now / 4300) * TAU) + 0.012 * Math.sin((now / 7100) * TAU + 1.3);
        // A quick movement makes it tighten.
        apGoal -= Math.min(0.1, pointer.speed * 0.035);
        // Hit, it shuts to a point and comes back; landing, it opens wide on you and settles.
        if (L.hitAt && hs < 1600) apGoal -= 0.4 * Math.exp(-hs / 300);
        if (wake >= ARRIVES) apGoal += 0.24 * Math.exp(-(wake - ARRIVES) / 520);
        apGoal = Math.round(Math.max(0.55, Math.min(1.3, apGoal)) / 0.025) * 0.025;
        // The lens leans in on what it looks at (you up close, a part, a strike coming) and recoils when hit.
        const focus = target ? 1 : L.alert && active ? 0.8 : watched || tilted ? 1 - near : 0;
        lensGoal = 1 + 0.045 * focus;
        if (L.hitAt && hs < 1600) lensGoal -= 0.07 * Math.exp(-hs / 260);
        if (wake >= ARRIVES) lensGoal += 0.05 * Math.exp(-(wake - ARRIVES) / 600);
      }
      servo(ap, apGoal, 0.0009, 0.04, dt);
      servo(lens, lensGoal, 0.00035, 0.028, dt);
      setLids(open);
      carry(gx, gy, Math.max(0.45, ap.x), lens.x);
      // A shock stays centred on the pupil while it runs, wherever the eye turns.
      if (now < L.shockUntil && shock.current) shock.current.style.translate = `calc(-50% + ${L.px.toFixed(1)}px) calc(-50% + ${L.py.toFixed(1)}px)`;
      // The camera, eased; each layer carried by its depth. The tear and its window move as one, and what is
      // inside the window is carried relative to it.
      // The shake: weighty (a slow sway under a quicker tremor, and a little roll), dying away as its
      // trauma does, and the camera's punch; the whole stage takes them, the text over it does not.
      L.trauma = Math.max(0, L.trauma - dt / 850);
      if (L.punch) {
        punch.v += L.punch;
        L.punch = 0;
      }
      for (let left = dt; left > 0; left -= 16) {
        const h = Math.min(16, left);
        punch.v += (-0.0009 * punch.x - 0.021 * punch.v) * h;
        punch.x += punch.v * h;
      }
      const tr = L.trauma * L.trauma;
      if (tr > 0.0004 || Math.abs(punch.x) > 0.0003 || Math.abs(punch.v) > 0.00001) {
        const ts = now / 1000;
        const sx = 18 * tr * (0.65 * Math.sin(ts * 37 + 1.1) + 0.35 * Math.sin(ts * 71 + 4.2));
        const sy = 14 * tr * (0.65 * Math.sin(ts * 43 + 2.7) + 0.35 * Math.sin(ts * 67 + 0.3));
        const roll = 0.5 * tr * Math.sin(ts * 29 + 5.1);
        const tf = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) rotate(${roll.toFixed(3)}deg) scale(${(1 + punch.x).toFixed(4)})`;
        if (body.current) body.current.style.transform = tf;
        if (sky.current) sky.current.style.transform = tf;
        shaking = true;
      } else if (shaking) {
        shaking = false;
        punch.x = punch.v = 0;
        if (body.current) body.current.style.transform = '';
        if (sky.current) sky.current.style.transform = '';
      }
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
      L.ripples = L.ripples.filter((w) => now - w.at < w.life * 4);
      const ripples = L.ripples.map(({ at, ...w }) => ({ ...w, age: now - at }));
      // The split light: up quickly, then closing smoothly.
      const ca = L.chromaAt ? now - L.chromaAt : Infinity;
      const chroma = ca < 110 ? Math.sin(((ca / 110) * Math.PI) / 2) : Math.exp(-(ca - 110) / 160);
      if (sc) drawStars(sc, field.current.stars, { w: L.w, h: L.h, q: field.current.q, vx: L.cx, vy: L.cy, ox, oy, dt, t: now, ripples, chroma });
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
      data-state={empty ? 'empty' : dormant ? 'dormant' : state}
      data-urgent={urgent && state === 'active' ? '' : undefined}
      role="img"
      aria-label={label}
      style={{ '--cx': `${geo.cx}px`, '--cy': `${geo.cy}px` } as CSSProperties}
    >
      <canvas ref={sky} className="quest-stars" style={{ transformOrigin: `${geo.cx}px ${geo.cy}px` }} />

      <div ref={body} className="quest-body" style={{ transformOrigin: `${geo.cx}px ${geo.cy}px`, display: empty ? 'none' : undefined }}>
        {/* The eye's dimension, seen only through the tear. Not space: a haze with light at its end, lines
            drifting in it, and a tunnel of torn membrane round the eye, ring behind ring, turning; then the eye. */}
        <div ref={portal} className="quest-portal" style={{ clipPath: `url(#${id}-window)` }}>
          <div ref={dim} className="quest-dim" style={{ inset: -over }}>
            <div className="quest-dim-light" style={{ background: dimLight, transformOrigin: `${geo.cx + over}px ${geo.cy + over}px` }} />
          </div>
          {DEPTHS.map(({ reach, turn, wander, breathe }, i) => (
            <div
              key={i}
              ref={(el) => {
                dimLayers.current[i] = el;
              }}
              className="quest-dim-layer"
              style={{ transformOrigin: `${geo.cx}px ${geo.cy}px` }}
            >
              <canvas
                ref={(el) => {
                  dimCanvas.current[i] = el;
                }}
                className="quest-membrane"
                style={{
                  left: geo.cx - reach * geo.k,
                  top: geo.cy - reach * geo.k,
                  width: 2 * reach * geo.k,
                  height: 2 * reach * geo.k,
                  animation: `${turn ? `quest-turn ${Math.abs(turn)}s linear infinite ${turn < 0 ? 'reverse' : 'normal'}` : `quest-wander ${wander}s ease-in-out infinite`}, quest-breathe ${breathe}s ease-in-out infinite`,
                }}
              />
            </div>
          ))}
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
                      <g ref={fibres}>
                        <path d={FIBRES.faint} className="eye-fibre" />
                        <path d={FIBRES.bright} className="eye-fibre-bright" />
                      </g>
                      <circle ref={ringFocus} r={RI - 14} className="eye-ring-dash" />
                      <circle ref={ringDots} r={RI * 0.74} className="eye-ring-dots" />
                      <circle ref={ringInner} r={RC + 30} className="eye-ring" />
                      <g ref={spokeSet}>
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
            {[0, 1].map((i) => (
              <canvas
                key={i}
                ref={(el) => {
                  tearSplit.current[i] = el;
                }}
                className="quest-tear-canvas quest-tear-split"
              />
            ))}
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
      {/* As it lands, the space round it is drained of light for a moment, and only the eye holds it. */}
      <div
        ref={drain}
        className="quest-drain"
        style={{
          background: `radial-gradient(ellipse ${Math.round(EW * 1.25 * geo.k)}px ${Math.round(EW * 0.9 * geo.k)}px at ${geo.cx}px ${geo.cy}px, transparent 70%, rgb(2 3 4 / 0.5) 100%, rgb(2 3 4 / 0.85) 160%)`,
        }}
      />
      {grain && <div className="quest-grain" style={{ backgroundImage: `url(${grain})` }} />}
      <svg ref={beams} className="quest-beams" />
    </div>
  );
}
