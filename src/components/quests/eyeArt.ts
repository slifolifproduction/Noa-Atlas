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
/**
 * Half the width of the eye, to its sharp corners, and how far each lid stands
 * from the middle when open: the upper lid flat, heavy and lower than the
 * lower one, so it glares from under it.
 */
export const EW = 380;
export const UP = 196;
export const LO = 226;
/** The rings: its ticks, its strength, its armor, the text that turns. */
export const R_TICKS = 398;
export const R_HP = 416;
export const R_ARMOR = 458;
export const R_TEXT = 482;

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
const cubic = (segs: Seg[]) => segs.map(([a, b, c]) => `C${f(a[0])} ${f(a[1])} ${f(b[0])} ${f(b[1])} ${f(c[0])} ${f(c[1])}`).join('');

/**
 * The upper lid, left corner to right: it leaves each corner low and sharp,
 * rises steeply, and runs flat and heavy across the top.
 */
function upperSegs(o: number): Seg[] {
  const u = UP * Math.max(0.012, o);
  return [
    [
      [-EW * 0.74, -u * 0.1],
      [-EW * 0.6, -u],
      [-EW * 0.3, -u],
    ],
    [
      [-EW * 0.1, -u],
      [EW * 0.1, -u],
      [EW * 0.3, -u],
    ],
    [
      [EW * 0.6, -u],
      [EW * 0.74, -u * 0.1],
      [EW, 0],
    ],
  ];
}
/** The lower lid, right corner back to left: sharp at the corners, round beneath. */
function lowerSegs(o: number): Seg[] {
  const d = LO * Math.max(0.012, o);
  return [
    [
      [EW * 0.7, d * 0.14],
      [EW * 0.46, d],
      [0, d],
    ],
    [
      [-EW * 0.46, d],
      [-EW * 0.7, d * 0.14],
      [-EW, 0],
    ],
  ];
}

/** The eye's outline, open by `o` (0 closed, 1 open), as a closed shape for its lids. */
export const lids = (o: number) => `M${-EW} 0${cubic(upperSegs(o))}${cubic(lowerSegs(o))}Z`;
/** The upper lid alone, for the heavy shadow it casts. */
export const upperLid = (o: number) => `M${-EW} 0${cubic(upperSegs(o))}`;
/** Its corners run on into thin wings that lift a little: the look of something that hunts. */
export const WINGS = `M${-EW - 10} -2L${-EW - 118} -28M${-EW - 118} -34L${-EW - 118} -22M${EW + 10} -2L${EW + 118} -28M${EW + 118} -34L${EW + 118} -22`;

/* ---- Where the eye can go -------------------------------------------------- */

const bez = (p0: P, [a, b, c]: Seg, t: number): P => {
  const m = 1 - t;
  return [
    m * m * m * p0[0] + 3 * m * m * t * a[0] + 3 * m * t * t * b[0] + t * t * t * c[0],
    m * m * m * p0[1] + 3 * m * m * t * a[1] + 3 * m * t * t * b[1] + t * t * t * c[1],
  ];
};
function sample(start: P, segs: Seg[], each: number) {
  const out: P[] = [];
  let p0 = start;
  for (const s of segs) {
    for (let i = 0; i < each; i++) out.push(bez(p0, s, i / each));
    p0 = s[2];
  }
  out.push(p0);
  return out;
}
/**
 * Spines along the upper lid, set outward like the ticks of an instrument:
 * longer over the middle, none at the corners.
 */
export function lashes(o: number) {
  const pts = sample([-EW, 0], upperSegs(o), 16);
  let d = '';
  for (let i = 2; i < pts.length - 2; i++) {
    const [p, q] = [pts[i - 1], pts[i + 1]];
    const [tx, ty] = [q[0] - p[0], q[1] - p[1]];
    const len = Math.hypot(tx, ty) || 1;
    const [nx, ny] = [ty / len, -tx / len];
    const reach = (i % 2 ? 9 : 16) * Math.sin((Math.PI * i) / (pts.length - 1));
    const [x, y] = pts[i];
    d += `M${f(x + nx * 4)} ${f(y + ny * 4)}L${f(x + nx * (4 + reach))} ${f(y + ny * (4 + reach))}`;
  }
  return d;
}

/** The eye's outer edge at its widest (the spines over the upper lid, the lower lid, a little past open), to keep it clear of text. */
export const OUTLINE: P[] = (() => [
  ...sample([-EW, 0], upperSegs(1.08), 10).map(([x, y]): P => [x, y - (y < -20 ? 22 : 0)]),
  ...sample([EW, 0], lowerSegs(1.08), 10),
  // The wings.
  ...[-1, 1].flatMap((side): P[] => [0.25, 0.5, 0.75, 1].map((t): P => [side * (EW + 10 + 108 * t), -2 - 26 * t])),
])();

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
      if (Math.abs(u) < EW && Math.abs(v) < 230 * (1 - (u / EW) ** 2)) return false;
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
  const kMax = wide ? Math.min(2.4, (w * 0.95) / (2 * (EW + 34))) : Math.min(1.6, (w * 1.3) / (2 * EW));
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

/* ---- The rift it comes through --------------------------------------------- */

/** How far the rift runs either side of the middle. */
export const RIFT_W = EW * 1.22;
/** Cracks running on from the rift's ends into the space around it. */
export function riftCracks(seed: number) {
  const r = seeded(seed + 7);
  let d = '';
  for (const side of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      let [x, y] = [side * RIFT_W * (0.92 - k * 0.12), (r() - 0.5) * 6];
      d += `M${f(x)} ${f(y)}`;
      const dir = (r() - 0.5) * 0.9;
      for (let j = 0; j < 5; j++) {
        x += side * (14 + r() * 26);
        y += dir * 24 + (r() - 0.5) * 16;
        d += `L${f(x)} ${f(y)}`;
      }
    }
  }
  return d;
}
/** The rift's jagged edges: a pair of offsets for each step along it. */
export function riftJags(seed: number, n = 56): [number, number][] {
  const r = seeded(seed);
  return Array.from({ length: n + 1 }, () => [r(), r()]);
}
/** The rift, grown out to `reveal` of its width and opened by `open` units, its edges trembling by `tremble`. */
export function riftPath(jags: [number, number][], reveal: number, open: number, tremble: number) {
  const RW = RIFT_W;
  const n = jags.length - 1;
  const pts = jags.map(([a, b], i) => {
    const x = (-1 + (2 * i) / n) * RW * reveal;
    const prof = Math.max(0, 1 - (x / RW) ** 2) ** 1.2;
    const edge = i === 0 || i === n ? 0 : 1;
    // Every other step bites deeper: the edge of something torn, not a smooth cut.
    const bite = (i % 2 ? 0.55 : 0.85) + 0.35 * a;
    const bite2 = (i % 2 ? 0.85 : 0.55) + 0.35 * b;
    return [x, -edge * (open * prof * bite + (0.6 + 1.8 * a) * tremble), edge * (open * prof * bite2 + (0.6 + 1.8 * b) * tremble)];
  });
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 1; i <= n; i++) d += `L${f(pts[i][0])} ${f(pts[i][1])}`;
  for (let i = n; i >= 0; i--) d += `L${f(pts[i][0])} ${f(pts[i][2])}`;
  return `${d}Z`;
}
/** Shards of the broken dimension, thrown out from the rift. */
export const SHARDS = (() => {
  const r = seeded(77);
  return Array.from({ length: 14 }, () => {
    const up = r() < 0.5 ? -1 : 1;
    const a = up * (Math.PI / 2) + (r() - 0.5) * 1.6;
    const s = 5 + r() * 9;
    return {
      x: (r() - 0.5) * EW * 1.6,
      vx: Math.cos(a) * (140 + r() * 320),
      vy: Math.sin(a) * (140 + r() * 320),
      spin: (r() - 0.5) * 720,
      d: `M0 ${f(-s)}L${f(s * 0.7)} ${f(s * 0.5)}L${f(-s * 0.6)} ${f(s * 0.3)}Z`,
    };
  });
})();
/** The other side, seen through the rift: streaks of light rushing out. */
export const STREAKS = (() => {
  const r = seeded(91);
  return Array.from({ length: 40 }, () => ({ a: r() * TAU, d0: r() * 420, v: 380 + r() * 700, len: 14 + r() * 40 }));
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

/** The seconds at six o'clock: a moon going round a small orbit. The readout at three. */
const SUB_R = 14;
export const SUB = { y: RC * 0.5, r: SUB_R };
export const READOUT = { x: RC * 0.6, w: 13, h: 8 };
/** The hands: hairlines ending in a node, like the spokes of the iris. */
export const HOUR = { length: 44, node: 4 };
export const MINUTE = { length: 70, node: 2.6 };

const NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const ADVANCE: Record<string, number> = { I: 3, V: 7, X: 7 };

/**
 * An old clock, drawn as one of the atlas's instruments: Roman numerals as
 * single hairlines set round the dial (their tops facing out), a ring of
 * ticks on the rim, dotted rings and a reticle inside. III gives way to a
 * readout, VI to the seconds.
 */
export const DIAL = (() => {
  const h = 9.5;
  const rn = RC - 17;
  let numerals = '';
  NUMERALS.forEach((text, i) => {
    if (i === 3 || i === 6) return;
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
