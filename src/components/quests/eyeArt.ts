import type { BossPart } from '../../domain/quests';

/*
 * The geometry of the eye, in one coordinate space centred on the pupil
 * (units, scaled to the stage by the rig). Pure functions and fixed paths,
 * so the component only moves things.
 */

export const TAU = Math.PI * 2;
/** The clock that is its pupil. */
export const RC = 92;
/** The iris. */
export const RI = 232;
/** Half the width of the eye, and half its height when wide open. */
export const EW = 350;
export const EH = 236;
/** The rings: its ticks, its strength, its armor, the text that turns. */
export const R_TICKS = 372;
export const R_HP = 392;
export const R_ARMOR = 436;
export const R_TEXT = 462;
/** The outer contour drawn round the lids, as a scale of them. */
export const CONTOUR = { x: 1.07, y: 1.14 };
/** The horizon it sits on: short lines running on from its corners. */
export const HORIZON = { from: EW + 16, to: EW + 104 };

const f = (n: number) => n.toFixed(1);

/** A small seeded random, so the sky and the iris are the same every time. */
export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type P = [number, number];
type Seg = [P, P, P];

/** The two lids as curves: the upper from the left corner, the lower back from the right. */
function lidSegs(o: number): { upper: Seg; lower: Seg } {
  const c = (-EH * Math.max(0.012, o)) / 0.75;
  return {
    upper: [
      [-EW * 0.45, c],
      [EW * 0.45, c],
      [EW, 0],
    ],
    lower: [
      [EW * 0.45, -c],
      [-EW * 0.45, -c],
      [-EW, 0],
    ],
  };
}

/** The eye's outline, open by `o` (0 closed, 1 wide open). */
export function lids(o: number) {
  const { upper: u, lower: l } = lidSegs(o);
  const seg = ([a, b, c]: Seg) => `C${f(a[0])} ${f(a[1])} ${f(b[0])} ${f(b[1])} ${f(c[0])} ${f(c[1])}`;
  return `M${-EW} 0${seg(u)}${seg(l)}Z`;
}

/* ---- Where the eye can go -------------------------------------------------- */

const bez = (p0: P, [a, b, c]: Seg, t: number): P => {
  const m = 1 - t;
  return [
    m * m * m * p0[0] + 3 * m * m * t * a[0] + 3 * m * t * t * b[0] + t * t * t * c[0],
    m * m * m * p0[1] + 3 * m * m * t * a[1] + 3 * m * t * t * b[1] + t * t * t * c[1],
  ];
};
function sample(start: P, seg: Seg, n: number) {
  return Array.from({ length: n + 1 }, (_, i) => bez(start, seg, i / n));
}

/** The eye's outer edge at its widest (its contour, a little past open, and its horizon), to keep it clear of text. */
export const OUTLINE: P[] = (() => {
  const { upper, lower } = lidSegs(1.08);
  const contour = [...sample([-EW, 0], upper, 16), ...sample([EW, 0], lower, 16)].map(([x, y]): P => [x * CONTOUR.x, y * CONTOUR.y]);
  const horizon = [-1, 1].flatMap((side): P[] => [0, 0.5, 1].map((t): P => [side * (HORIZON.from + (HORIZON.to - HORIZON.from) * t), t === 1 ? 5 : 0]));
  return [...contour, ...horizon];
})();

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Whether the eye at (cx, cy), scale k, stays clear of every box and inside the bounds. */
function clear(cx: number, cy: number, k: number, boxes: Box[], x0: number, x1: number, y0: number, y1: number, m: number) {
  for (const [u, v] of OUTLINE) {
    const X = cx + u * k;
    const Y = cy + v * k;
    if (X < x0 || X > x1 || Y < y0 || Y > y1) return false;
    for (const b of boxes) if (X > b.x - m && X < b.x + b.w + m && Y > b.y - m && Y < b.y + b.h + m) return false;
  }
  // A box that sits inside the eye touches no edge: test its corners against the shape.
  for (const b of boxes) {
    for (const [X, Y] of [
      [b.x, b.y],
      [b.x + b.w, b.y],
      [b.x, b.y + b.h],
      [b.x + b.w, b.y + b.h],
      [b.x + b.w / 2, b.y + b.h / 2],
    ]) {
      const u = (X - cx) / k;
      const v = (Y - cy) / k;
      if (Math.abs(u) < EW * CONTOUR.x && Math.abs(v) < EH * CONTOUR.y * (1 - (u / (EW * CONTOUR.x)) ** 2)) return false;
    }
  }
  return true;
}

/**
 * Where the eye goes on the stage, and how large: the largest it can be
 * without touching the text over it (the boxes, in stage pixels). On a wide
 * screen it stays whole on the stage; on a small one it may run past the
 * sides, as long as nothing it touches is text.
 */
export function fitEye(w: number, h: number, boxes: Box[], wide: boolean) {
  const m = 14;
  const right = Math.min(w, ...boxes.filter((b) => b.x > w / 2).map((b) => b.x));
  const [x0, x1] = wide ? [8, w - 8] : [-Infinity, Infinity];
  const [y0, y1] = [6, h - 6];
  const kMin = 0.3;
  const kMax = wide ? Math.min(2.4, (w * 0.95) / (2 * HORIZON.to)) : Math.min(1.6, (w * 1.3) / (2 * EW));
  const cxs = wide ? Array.from({ length: 19 }, (_, i) => w * (0.14 + (0.72 * i) / 18)) : [w / 2];
  const cys = Array.from({ length: 13 }, (_, i) => h * (0.24 + (0.52 * i) / 12));
  const [px, py] = [wide ? right / 2 : w / 2, h * 0.5];
  let best = { cx: px, cy: py, k: kMin, score: -1 };
  for (const cx of cxs) {
    for (const cy of cys) {
      if (!clear(cx, cy, kMin, boxes, x0, x1, y0, y1, m)) continue;
      let [lo, hi] = [kMin, kMax];
      for (let i = 0; i < 14; i++) {
        const mid = (lo + hi) / 2;
        if (clear(cx, cy, mid, boxes, x0, x1, y0, y1, m)) lo = mid;
        else hi = mid;
      }
      // As large as it can be; among near-equals, nearer the middle of the free stage.
      const score = lo * (1 - 0.1 * (Math.abs(cx - px) / w) - 0.1 * (Math.abs(cy - py) / h));
      if (score > best.score) best = { cx, cy, k: lo, score };
    }
  }
  return { cx: best.cx, cy: best.cy, k: best.k };
}

/* ---- The tear in space it looks through ------------------------------------ */

/** The tear runs far either side of the eye, level with it, and stands open a little wider than it in the middle. */
export const TEAR_W = EW * 2.3;
export const TEAR_H = 300;

/** Smooth noise along a line: a value every unit, eased between. */
function noise(seed: number) {
  const r = seeded(seed);
  const v = Array.from({ length: 97 }, () => r() * 2 - 1);
  return (x: number) => {
    const i = Math.floor(x);
    const t = x - i;
    const [a, b] = [v[((i % 97) + 97) % 97], v[(((i + 1) % 97) + 97) % 97]];
    return a + (b - a) * t * t * (3 - 2 * t);
  };
}

/**
 * The tear, in units round the eye: a long lens of another dimension that
 * tapers to a crack at each end. Its edges are torn at every scale at once
 * (a slow waver, smaller rips, fine fraying), each edge its own; the same for
 * a boss every time. The top edge left to right, then the bottom back.
 */
export function tearOutline(seed: number) {
  const layers = [0, 1].map((side) => [noise(seed + side * 31 + 1), noise(seed + side * 31 + 2), noise(seed + side * 31 + 3)]);
  const step = 5;
  const n = Math.round((2 * TEAR_W) / step);
  const edge = (side: 0 | 1) =>
    Array.from({ length: n + 1 }, (_, i): P => {
      const x = -TEAR_W + i * step;
      const u = x / TEAR_W;
      const prof = Math.max(0, 1 - u * u) ** 1.3;
      const [a, b, c] = layers[side];
      const rough = (12 * a(x / 90) + 4.5 * b(x / 22) + 1.6 * c(x / 5)) * Math.min(1, prof * 3 + 0.25);
      const y = i === 0 || i === n ? 0 : TEAR_H * prof + rough;
      return [x, side ? Math.max(0.5, y) : -Math.max(0.5, y)];
    });
  return [...edge(0), ...edge(1).reverse()];
}

/** Cracks running on from the tear's ends into the space around it. */
export function tearCracks(seed: number) {
  const r = seeded(seed + 7);
  const out: P[][] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      let [x, y] = [side * TEAR_W * (0.98 - k * 0.06), (r() - 0.5) * 6];
      const line: P[] = [[x, y]];
      const dir = (r() - 0.5) * 1.1;
      for (let j = 0; j < 6; j++) {
        x += side * (16 + r() * 34);
        y += dir * 20 + (r() - 0.5) * 14;
        line.push([x, y]);
      }
      out.push(line);
    }
  }
  return out;
}

/** Specks of light on the other side, seen through the tear. */
export function tearSpecks(seed: number) {
  const r = seeded(seed + 13);
  return Array.from({ length: 110 }, () => {
    const u = (r() * 2 - 1) * 0.94;
    const h = TEAR_H * Math.max(0, 1 - u * u) ** 1.3 * 0.9;
    return { x: u * TEAR_W, y: (r() * 2 - 1) * h, r: 0.4 + r() ** 3 * 1.8, a: 0.2 + r() * 0.6 };
  });
}

/**
 * The tear's outline on the stage, in its pixels, for the window the eye's
 * dimension is seen through: the same shape the canvases paint.
 */
export function tearWindow(seed: number, cx: number, cy: number, k: number) {
  return (
    tearOutline(seed)
      .map(([x, y], i) => `${i ? 'L' : 'M'}${(cx + x * k).toFixed(1)} ${(cy + y * k).toFixed(1)}`)
      .join('') + 'Z'
  );
}

/**
 * Paint the tear once. Behind the eye's dimension (`base`): the void of the
 * other side with a warm light deep in it, its specks, the depths falling
 * away inside it (echoes of its edge). In front of it: its torn edge and the
 * cracks at its ends (`edge`), and its burning halo (`halo`), apart so it can
 * breathe and flare without being painted again.
 */
export function paintTear(
  base: HTMLCanvasElement,
  edge: HTMLCanvasElement,
  halo: HTMLCanvasElement,
  o: { w: number; h: number; cx: number; cy: number; k: number; seed: number; urgent: boolean },
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const outline = tearOutline(o.seed);
  const cracks = tearCracks(o.seed);
  const trace = (ctx: CanvasRenderingContext2D, pts: P[], sx = 1, sy = 1) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * sx, y * sy) : ctx.moveTo(x * sx, y * sy)));
    ctx.closePath();
  };
  const setup = (c: HTMLCanvasElement) => {
    c.width = Math.round(o.w * dpr);
    c.height = Math.round(o.h * dpr);
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, o.w, o.h);
    ctx.translate(o.cx, o.cy);
    ctx.scale(o.k, o.k);
    return ctx;
  };
  const px = 1 / o.k;
  const ctx = setup(base);
  if (ctx) {
    // The void, a little soft: it lies behind the plane in focus.
    soft(ctx, 0.7 * dpr, (ctx) => {
      trace(ctx, outline);
      ctx.fillStyle = '#010203';
      ctx.fill();
      ctx.save();
      trace(ctx, outline);
      ctx.clip();
      const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, TEAR_W * 0.9);
      glow.addColorStop(0, 'rgba(255,236,220,0.13)');
      glow.addColorStop(0.25, 'rgba(255,150,100,0.05)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.save();
      ctx.scale(1, 0.3);
      ctx.fillStyle = glow;
      ctx.fillRect(-TEAR_W, -TEAR_H / 0.3, 2 * TEAR_W, (2 * TEAR_H) / 0.3);
      ctx.restore();
      for (const p of tearSpecks(o.seed)) {
        ctx.fillStyle = `rgba(255,236,220,${p.a.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      }
      // Its depths: echoes of its edge, falling away inside it.
      ctx.lineWidth = px;
      [
        [0.97, 0.7, 0.11],
        [0.93, 0.44, 0.08],
        [0.88, 0.2, 0.06],
      ].forEach(([sx, sy, a]) => {
        trace(ctx, outline, sx, sy);
        ctx.strokeStyle = `rgba(255,232,214,${a})`;
        ctx.stroke();
      });
      ctx.restore();
    });
  }
  const ex = setup(edge);
  if (ex) {
    ex.lineWidth = px;
    ex.strokeStyle = 'rgba(255,226,206,0.45)';
    for (const line of cracks) {
      ex.beginPath();
      line.forEach(([x, y], i) => (i ? ex.lineTo(x, y) : ex.moveTo(x, y)));
      ex.stroke();
    }
    trace(ex, outline);
    ex.strokeStyle = o.urgent ? 'rgba(255,176,130,0.95)' : 'rgba(255,240,228,0.85)';
    ex.lineWidth = 1.2 * px;
    ex.stroke();
  }
  const hx = setup(halo);
  if (hx) {
    trace(hx, outline);
    hx.shadowColor = o.urgent ? 'rgba(255,90,31,0.9)' : 'rgba(255,150,100,0.6)';
    hx.shadowBlur = 14 * dpr;
    hx.strokeStyle = o.urgent ? 'rgba(255,90,31,0.7)' : 'rgba(255,190,150,0.35)';
    hx.lineWidth = 2.2 * px;
    hx.stroke();
  }
}
/** Light streaming along the seam of the tear, out towards its ends. */
export const STREAMS = (() => {
  const r = seeded(91);
  return Array.from({ length: 22 }, () => ({
    y: (r() - 0.5) * 70,
    len: 30 + r() * 90,
    reach: 0.35 + r() * 0.5,
    dur: 3 + r() * 5,
    delay: -r() * 8,
    left: r() < 0.5,
  }));
})();

/** Where each part of the boss sits on the iris: an angle, a reach, and a few bodies along it. */
export function spokes(parts: BossPart[]) {
  const n = Math.max(parts.length, 1);
  return parts.map((p, i) => {
    let h = 2166136261;
    for (const c of p.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    const r = (k: number) => ((h >>> (k * 5)) & 1023) / 1023;
    const angle = ((-90 + (i * 360) / n + (r(0) - 0.5) * (150 / n)) * Math.PI) / 180;
    const from = RC + 16;
    const to = RI * (0.62 + r(1) * 0.32);
    return {
      part: p,
      angle,
      from,
      to,
      beads: [from + (to - from) * (0.3 + r(2) * 0.2), from + (to - from) * (0.62 + r(3) * 0.2)],
      body: r(4) > 0.5 ? 6 + r(5) * 12 : 0,
      bodyAt: from + (to - from) * (0.4 + r(6) * 0.4),
    };
  });
}
export type Spoke = ReturnType<typeof spokes>[number];

/** The iris's fibres: many faint radial threads, a few brighter. */
export const FIBRES = (() => {
  const r = seeded(11);
  let faint = '';
  let bright = '';
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * TAU + (r() - 0.5) * 0.03;
    const r0 = RC + 14 + r() * 12;
    const r1 = r0 + 24 + r() * (RI - r0 - 30);
    const seg = `M${f(Math.cos(a) * r0)} ${f(Math.sin(a) * r0)}L${f(Math.cos(a) * r1)} ${f(Math.sin(a) * r1)}`;
    if (r() < 0.18) bright += seg;
    else faint += seg;
  }
  return { faint, bright };
})();

/** An arc of radius `r` from `a0` to `a1` degrees (0 = right, clockwise). */
export function arc(r: number, a0: number, a1: number) {
  const [p, q] = [(a0 * Math.PI) / 180, (a1 * Math.PI) / 180];
  return `M${f(r * Math.cos(p))} ${f(r * Math.sin(p))}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f(r * Math.cos(q))} ${f(r * Math.sin(q))}`;
}

/** Radial ticks between two radii. */
export function ticks(count: number, r0: number, r1: number, skip?: (i: number) => boolean) {
  let d = '';
  for (let i = 0; i < count; i++) {
    if (skip?.(i)) continue;
    const a = (i / count) * TAU - Math.PI / 2;
    d += `M${f(Math.cos(a) * r0)} ${f(Math.sin(a) * r0)}L${f(Math.cos(a) * r1)} ${f(Math.sin(a) * r1)}`;
  }
  return d;
}

/** A ring of the boss's strength: segment `i` of `n` at radius `r`. */
export function segment(i: number, n: number, r: number) {
  const gap = Math.min(2.6, 110 / n);
  return arc(r, -90 + (i * 360) / n + gap / 2, -90 + ((i + 1) * 360) / n - gap / 2);
}

/* ---- The eyeball ------------------------------------------------------------ */

/**
 * The eye is a ball that turns. Its iris and pupil are one disc on its
 * front, on a plane PLANE units in from its centre; turning it by (yaw,
 * pitch) carries the disc across and foreshortens it, so iris and pupil
 * always move as one.
 */
export const EYEBALL = 470;
export const PLANE = Math.sqrt(EYEBALL ** 2 - RI ** 2);
/** How far it turns, in radians: further sideways than up and down, as eyes do. */
export const YAW = (21 * Math.PI) / 180;
export const PITCH = (13 * Math.PI) / 180;

/** Where the disc lands, and the SVG matrix that carries it there (with `scale` for the pupil's size). */
export function turn(yaw: number, pitch: number) {
  const nx = Math.sin(yaw) * Math.cos(pitch);
  const ny = Math.sin(pitch);
  const nz = Math.cos(yaw) * Math.cos(pitch);
  const r = Math.hypot(nx, ny);
  const [c, s] = r > 1e-6 ? [nx / r, ny / r] : [1, 0];
  // Squash by nz along the direction it turned: R(phi) · S(nz, 1) · R(-phi).
  const a = nz * c * c + s * s;
  const b = (nz - 1) * c * s;
  const d = nz * s * s + c * c;
  const x = PLANE * nx;
  const y = PLANE * ny;
  return {
    x,
    y,
    matrix: (scale = 1) =>
      `matrix(${(a * scale).toFixed(4)} ${(b * scale).toFixed(4)} ${(b * scale).toFixed(4)} ${(d * scale).toFixed(4)} ${x.toFixed(1)} ${y.toFixed(1)})`,
  };
}

/* ---- The clock that is its pupil ------------------------------------------ */

/** The seconds at six o'clock: a moon going round a small orbit. */
const SUB_R = 14;
export const SUB = { y: RC * 0.5, r: SUB_R };
/** The hands: hairlines ending in a node, like the spokes of the iris. */
export const HOUR = { length: 44, node: 4 };
export const MINUTE = { length: 70, node: 2.6 };

const NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const ADVANCE: Record<string, number> = { I: 3, V: 7, X: 7 };

/**
 * An old clock, drawn as one of the atlas's instruments: Roman numerals as
 * single hairlines set round the dial (their tops facing out), a ring of
 * ticks on the rim, dotted rings and a reticle inside. VI gives way to the
 * seconds.
 */
export const DIAL = (() => {
  const h = 9.5;
  const rn = RC - 17;
  let numerals = '';
  NUMERALS.forEach((text, i) => {
    if (i === 6) return;
    const th = (i * 30 * Math.PI) / 180;
    const [cos, sin] = [Math.cos(th), Math.sin(th)];
    const pt = (x: number, y: number) => `${f(cos * x - sin * (y - rn))} ${f(sin * x + cos * (y - rn))}`;
    const line = (x0: number, y0: number, x1: number, y1: number) => `M${pt(x0, y0)}L${pt(x1, y1)}`;
    const width = [...text].reduce((w, c) => w + ADVANCE[c], 0) - 1.6;
    let x = -width / 2;
    const [y0, y1] = [-h / 2, h / 2];
    for (const c of text) {
      if (c === 'I') numerals += line(x + 0.7, y0, x + 0.7, y1);
      else if (c === 'V') numerals += line(x + 0.4, y0, x + 2.9, y1) + line(x + 2.9, y1, x + 5.4, y0);
      else numerals += line(x + 0.4, y0, x + 5.4, y1) + line(x + 5.4, y0, x + 0.4, y1);
      x += ADVANCE[c];
    }
  });
  // A reticle: four short marks on the diagonals, between the inner rings.
  let reticle = '';
  for (const deg of [45, 135, 225, 315]) {
    const a = (deg * Math.PI) / 180;
    reticle += `M${f(Math.cos(a) * 34)} ${f(Math.sin(a) * 34)}L${f(Math.cos(a) * 46)} ${f(Math.sin(a) * 46)}`;
  }
  return {
    numerals,
    reticle,
    minutes: ticks(60, RC + 4, RC + 8, (i) => i % 5 === 0),
    hours: ticks(12, RC + 3, RC + 13),
    subTicks: ticks(12, SUB_R - 3, SUB_R),
  };
})();

/* ---- The sky --------------------------------------------------------------- */

/**
 * Draw with `draw` onto a canvas the size of `ctx`'s, then lay it onto `ctx`
 * blurred by `blur` pixels: one blur for the whole of it. (A filter set on the
 * context itself would blur every stroke on its own, which is ruinous.)
 */
function soft(ctx: CanvasRenderingContext2D, blur: number, draw: (c: CanvasRenderingContext2D) => void) {
  const off = document.createElement('canvas');
  off.width = ctx.canvas.width;
  off.height = ctx.canvas.height;
  const o = off.getContext('2d');
  if (!o) return draw(ctx);
  o.setTransform(ctx.getTransform());
  draw(o);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.filter = `blur(${blur.toFixed(2)}px)`;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

/**
 * Paint a layer of stars once. `near` stars are fewer, larger and brighter,
 * and a handful of them carry a faint cross of light.
 */
export function paintStars(canvas: HTMLCanvasElement, w: number, h: number, near: boolean) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // Depth of field: the far sky lies behind the plane in focus, so it is a little soft.
  if (near) sky(ctx, w, h, true);
  else soft(ctx, 0.8 * dpr, (c) => sky(c, w, h, false));
}
function sky(ctx: CanvasRenderingContext2D, w: number, h: number, near: boolean) {
  const r = seeded(near ? 29 : 5);
  const count = Math.round((w * h) / (near ? 14000 : 1700));
  for (let i = 0; i < count; i++) {
    const x = r() * w;
    const y = r() * h;
    const size = near ? 0.7 + r() ** 2 * 1.2 : 0.25 + r() * 0.6;
    const a = near ? 0.35 + r() * 0.55 : 0.12 + r() * 0.45;
    const cool = r() < 0.3;
    ctx.fillStyle = cool ? `rgba(214,222,236,${a})` : `rgba(236,232,223,${a})`;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TAU);
    ctx.fill();
    if (near && size > 1.55) {
      ctx.strokeStyle = `rgba(236,232,223,${a * 0.28})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(x - size * 6, y);
      ctx.lineTo(x + size * 6, y);
      ctx.moveTo(x, y - size * 6);
      ctx.lineTo(x, y + size * 6);
      ctx.stroke();
    }
  }
}

/** A phrase repeated to go once around a circle of radius `r`, at `size` units per letter. */
export function ringText(phrase: string, r: number, size: number) {
  const perChar = size * 0.82;
  const need = Math.floor((TAU * r) / perChar);
  let s = '';
  while (s.length < need) s += `${phrase}  ·  `;
  return s.slice(0, need);
}

/* ---- The lens ---------------------------------------------------------------- */

let grain: string | undefined;
/** A tile of film grain, made once. */
export function grainTile() {
  if (grain !== undefined) return grain;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    if (!ctx) return (grain = '');
    const img = ctx.createImageData(128, 128);
    const r = seeded(3);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = Math.floor(r() * 255);
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    grain = c.toDataURL('image/png');
  } catch {
    grain = '';
  }
  return grain;
}
