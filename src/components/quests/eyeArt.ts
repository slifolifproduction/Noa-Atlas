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
/** Its armor: plates round the edge of the iris, on the white just outside it. */
export const R_ARMOR = RI + 9;
/** The outer contour drawn round the lids, as a scale of them. */
export const CONTOUR = { x: 1.07, y: 1.14 };
/** Room kept clear past its corners, along its line (where the tear runs on), so no text crowds it. */
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

/** The eye's outer edge at its widest (its contour, a little past open, and the room past its corners), to keep it clear of text. */
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

/** How far the tear reaches above and below the eye's line, in units: its opening, its torn edge and its lips. */
const TEAR_REACH = 324;

/** Whether the eye at (cx, cy), scale k, stays clear of every box and inside the bounds, its whole tear on the stage. */
function clear(cx: number, cy: number, k: number, boxes: Box[], x0: number, x1: number, y0: number, y1: number, m: number) {
  if (cy - TEAR_REACH * k < y0 || cy + TEAR_REACH * k > y1) return false;
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
 * without touching the text over it (the boxes, in stage pixels), with the
 * whole height of its tear on the stage, so it is always seen as a window.
 * On a wide screen it stays whole on the stage; on a small one it may run
 * past the sides, as long as nothing it touches is text. It grows with the
 * stage up to a point (kMax), past which its layers would be too large to
 * draw; a page zoomed far out shows it smaller, like everything else.
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
 * (a slow waver, smaller rips), each edge its own, and broken like glass:
 * straight facets meeting at sharp corners, with a shard standing out here
 * and there. The same for a boss every time. The top edge left to right, then
 * the bottom back.
 */
export function tearOutline(seed: number) {
  const layers = [0, 1].map((side) => [noise(seed + side * 31 + 1), noise(seed + side * 31 + 2), noise(seed + side * 31 + 3)]);
  const step = 5;
  const n = Math.round((2 * TEAR_W) / step);
  const edge = (side: 0 | 1) => {
    const r = seeded(seed * 13 + side * 101 + 3);
    const pts: P[] = [];
    // Facets 10 to 35 units long: only some of the torn edge's points are kept, joined straight.
    for (let i = 0; i <= n; i += i === n ? 1 : Math.min(n - i, 2 + Math.floor(r() * 6))) {
      const x = -TEAR_W + i * step;
      const u = x / TEAR_W;
      const prof = Math.max(0, 1 - u * u) ** 1.3;
      const [a, b, c] = layers[side];
      const reach = Math.min(1, prof * 3 + 0.25);
      const rough = (12 * a(x / 90) + 4.5 * b(x / 22) + 1.6 * c(x / 5)) * reach;
      // A shard: a corner pushed out into space, or in.
      const shard = i > 0 && i < n && r() < 0.16 ? (r() < 0.6 ? 1 : -0.6) * (3 + r() * 6) * reach : 0;
      const y = i === 0 || i === n ? 0 : TEAR_H * prof + rough + shard;
      pts.push([x, side ? Math.max(0.5, y) : -Math.max(0.5, y)]);
      if (i === n) break;
    }
    return pts;
  };
  return [...edge(0), ...edge(1).reverse()];
}

/**
 * Cracks running on from the tear's ends into the space around it: at each
 * end one carrying on along the tear's line, and a shorter one splitting off
 * it. Each is drawn tapering and fading out, so it ends in nothing.
 */
export function tearCracks(seed: number) {
  const r = seeded(seed + 7);
  const out: { pts: P[]; weight: number }[] = [];
  for (const side of [-1, 1]) {
    let [x, y] = [side * TEAR_W, 0];
    const main: P[] = [[x, y]];
    let a = (r() - 0.5) * 0.12;
    for (let d = 0, len = 120 + r() * 70; d < len;) {
      const step = 12 + r() * 16;
      // It wanders, but keeps to the line.
      a = (a + (r() - 0.5) * 0.35) * 0.7;
      x += side * step * Math.cos(a);
      y += step * Math.sin(a);
      d += step;
      main.push([x, y]);
    }
    out.push({ pts: main, weight: 1 });
    const from = main[1 + Math.floor(r() * 2)];
    const turn = (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.25);
    const branch: P[] = [from];
    [x, y] = from;
    for (let d = 0, len = 45 + r() * 35; d < len;) {
      const step = 10 + r() * 12;
      const b = turn + (r() - 0.5) * 0.3;
      x += side * step * Math.cos(b);
      y += step * Math.sin(b);
      d += step;
      branch.push([x, y]);
    }
    out.push({ pts: branch, weight: 0.6 });
  }
  return out;
}

/**
 * Each point of a closed outline moved along its normal, away from the tear's
 * line (`by` > 0) or towards it, by `by(x)` units.
 */
function along(pts: P[], by: (x: number) => number): P[] {
  const n = pts.length;
  return pts.map(([x, y], i) => {
    const [px, py] = pts[(i - 1 + n) % n];
    const [qx, qy] = pts[(i + 1) % n];
    let [nx, ny] = [-(qy - py), qx - px];
    const len = Math.hypot(nx, ny) || 1;
    [nx, ny] = [nx / len, ny / len];
    // Outward is away from the tear's line (up on the top edge, down on the bottom one).
    if (ny * y < 0) [nx, ny] = [-nx, -ny];
    const d = by(x);
    return [x + nx * d, y + ny * d];
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
 * Paint the tear's edge once: its lips (the other side darkening into the
 * edge, falling away under it), its torn edge as the broken edge of glass and
 * the cracks at its ends (`edge`), and its burning halo (`halo`), apart so it
 * can breathe and flare without being painted again.
 */
export function paintTear(
  edge: HTMLCanvasElement,
  halo: HTMLCanvasElement,
  o: { w: number; h: number; cx: number; cy: number; k: number; seed: number; urgent: boolean },
  split: (HTMLCanvasElement | null)[] = [],
) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const outline = tearOutline(o.seed);
  const cracks = tearCracks(o.seed);
  const trace = (ctx: CanvasRenderingContext2D, pts: P[]) => {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
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
  const ex = setup(edge);
  if (ex) {
    soft(ex, 6 * dpr, (c) => {
      c.save();
      trace(c, outline);
      c.clip();
      trace(c, outline);
      c.strokeStyle = 'rgba(3,4,6,0.92)';
      c.lineWidth = 38 * px;
      c.stroke();
      c.restore();
    });
    // The cracks at its ends: tapering and fading as they run out, so they end in nothing.
    ex.lineCap = 'round';
    for (const { pts, weight } of cracks) {
      const total = pts.slice(1).reduce((t, p, i) => t + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);
      let run = weight < 1 ? total * 0.35 : 0;
      const span = weight < 1 ? total * 1.35 : total;
      for (let i = 1; i < pts.length; i++) {
        const f = run / span;
        run += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        ex.beginPath();
        ex.moveTo(pts[i - 1][0], pts[i - 1][1]);
        ex.lineTo(pts[i][0], pts[i][1]);
        ex.lineWidth = Math.max(0.3, 1.8 * weight * (1 - f)) * px;
        ex.strokeStyle = `rgba(255,232,214,${(0.6 * weight * (1 - f) ** 1.6).toFixed(3)})`;
        ex.stroke();
      }
    }
    ex.lineCap = 'butt';
    ex.lineJoin = 'miter';
    // Its torn edge, broken like glass: a core of light, the light split either side of it (red out,
    // blue in, wider towards the ends, as through the edge of a pane), a bevel inside, and glints on
    // its sharpest corners.
    trace(ex, outline);
    ex.strokeStyle = o.urgent ? 'rgba(255,176,130,0.95)' : 'rgba(255,240,228,0.9)';
    ex.lineWidth = 2.2 * px;
    ex.stroke();
    const split = (x: number) => (0.9 + 1.2 * Math.abs(x / TEAR_W)) * px;
    ex.globalCompositeOperation = 'lighter';
    // The split light is soft, as it is through glass: hugging the core, never a line of its own.
    soft(ex, 0.7 * dpr, (c) => {
      for (const [sign, colour] of [
        [1, o.urgent ? 'rgba(255,70,30,0.7)' : 'rgba(255,58,96,0.7)'],
        [-1, o.urgent ? 'rgba(70,190,255,0.4)' : 'rgba(60,200,255,0.62)'],
      ] as const) {
        trace(
          c,
          along(outline, (x) => sign * split(x)),
        );
        c.strokeStyle = colour;
        c.lineWidth = 1.2 * px;
        c.stroke();
      }
    });
    trace(
      ex,
      along(outline, () => -4.5 * px),
    );
    ex.strokeStyle = 'rgba(255,240,228,0.14)';
    ex.lineWidth = 0.8 * px;
    ex.stroke();
    // Glints where the glass breaks at its sharpest: a point of light, and a short streak along the edge.
    const rg = seeded(o.seed * 7 + 19);
    ex.lineCap = 'round';
    outline.forEach(([x, y], i) => {
      const [a, b] = [outline[(i - 1 + outline.length) % outline.length], outline[(i + 1) % outline.length]];
      const turn = Math.abs(Math.atan2(b[1] - y, b[0] - x) - Math.atan2(y - a[1], x - a[0]));
      const sharp = Math.min(turn, Math.PI * 2 - turn);
      if (sharp < 0.5 || rg() > 0.35) return;
      const [tx, ty] = [b[0] - a[0], b[1] - a[1]];
      const tl = Math.hypot(tx, ty) || 1;
      const g = (4 + rg() * 5) * px;
      ex.strokeStyle = 'rgba(255,248,240,0.5)';
      ex.lineWidth = 0.8 * px;
      ex.beginPath();
      ex.moveTo(x - (tx / tl) * g, y - (ty / tl) * g);
      ex.lineTo(x + (tx / tl) * g, y + (ty / tl) * g);
      ex.stroke();
      ex.fillStyle = 'rgba(255,250,244,0.9)';
      ex.beginPath();
      ex.arc(x, y, 1.3 * px, 0, TAU);
      ex.fill();
    });
    ex.lineCap = 'butt';
    ex.globalCompositeOperation = 'source-over';
  }
  const hx = setup(halo);
  if (hx) {
    trace(hx, outline);
    hx.shadowColor = o.urgent ? 'rgba(255,90,31,0.9)' : 'rgba(255,150,100,0.6)';
    hx.shadowBlur = 14 * dpr;
    hx.strokeStyle = o.urgent ? 'rgba(255,90,31,0.7)' : 'rgba(255,190,150,0.35)';
    hx.lineWidth = 3.2 * px;
    hx.stroke();
  }
  // Its light split, red and blue, for the moment space breaks (moved apart and back in CSS): soft, and
  // painted at one pixel to the stage's, as they are only ever seen in passing.
  split.forEach((c, i) => {
    if (!c) return;
    c.width = Math.round(o.w);
    c.height = Math.round(o.h);
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, o.cx, o.cy);
    ctx.scale(o.k, o.k);
    soft(ctx, 1.2, (s) => {
      trace(s, outline);
      s.strokeStyle = i ? 'rgb(60,200,255)' : 'rgb(255,58,96)';
      s.lineWidth = 3 * px;
      s.stroke();
    });
  });
}

/* ---- The dimension beyond the tear ----------------------------------------- */

/**
 * The other side of the tear is not space: it is a tunnel of torn membrane
 * running away from us, ring behind ring, to the light at its end, where the
 * eye is. Each ring is a band of dark membrane full of cells lying along it,
 * thorned on its inside edge and lit along every edge by the light at the end;
 * the deeper ones are smaller, hazier and softer. In units round the eye,
 * deepest first. Each turns on its own (see DEPTHS).
 */
export const MEMBRANES = [
  { r0: 250, r1: 470, cell: 34, blur: 2.4, haze: 0.5, rim: 0.1 },
  { r0: 390, r1: 690, cell: 48, blur: 1.1, haze: 0.24, rim: 0.14 },
  { r0: 560, r1: 960, cell: 62, blur: 0, haze: 0, rim: 0.2 },
] as const;
export type Membrane = (typeof MEMBRANES)[number];
export const NEAR = MEMBRANES[2];
/** How far a membrane reaches from the centre, in units. */
export const membraneReach = (m: Membrane) => m.r1 + 40;

/** Draw one ring of the tunnel round the origin, in units (`c` is already placed and scaled). */
function drawMembrane(c: CanvasRenderingContext2D, m: Membrane, o: { k: number; seed: number; layer: number }) {
  const hair = 1 / o.k;
  const r = seeded(o.seed * 17 + o.layer * 101 + 5);
  const [wave, fray, swell] = [0, 1, 2].map((i) => noise(o.seed + o.layer * 7 + 50 + i));
  const u = (a: number) => (a / TAU) * 97;
  const thorns = Array.from({ length: 9 + o.layer * 4 }, () => ({ at: r() * TAU, w: 0.03 + r() * 0.05, len: 8 + r() ** 2 * m.r0 * 0.12 }));
  const inner = (a: number) => {
    let v = m.r0 + 14 * wave(u(a) * 2) + 4 * fray(u(a) * 9);
    for (const t of thorns) {
      const d = Math.min(Math.abs(a - t.at), TAU - Math.abs(a - t.at));
      if (d < t.w) v -= t.len * (0.5 + 0.5 * Math.cos((Math.PI * d) / t.w)) ** 1.6;
    }
    return v;
  };
  const outer = (a: number) => m.r1 + 18 * swell(u(a) * 2) + 5 * fray(u(a) * 7 + 30);
  const ring = (at: (a: number) => number) => {
    const N = 900;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * TAU;
      const v = at(a);
      if (i) c.lineTo(Math.cos(a) * v, Math.sin(a) * v);
      else c.moveTo(Math.cos(a) * v, Math.sin(a) * v);
    }
    c.closePath();
  };
  // The membrane: dark against the haze, lifted a little towards the light at the end; the deeper, the more of the haze in it.
  const tone = (v: number) => Math.round(v + (58 - v) * m.haze);
  const body = c.createRadialGradient(0, 0, m.r0 * 0.8, 0, 0, m.r1);
  body.addColorStop(0, `rgb(${tone(22)},${tone(23)},${tone(27)})`);
  body.addColorStop(1, `rgb(${tone(6)},${tone(7)},${tone(9)})`);
  c.beginPath();
  ring(outer);
  ring(inner);
  c.fillStyle = body;
  c.fill('evenodd');
  // Its cells, a lattice like the cells of a living thing. Seeds on a jittered hex grid round the ring (a
  // row either side of it too, to close the cells at its edges); each cell is the polygon of the centres of
  // the triangles round its seed, so the cells tile the band, and each is drawn shrunk back from its
  // struts and rounded. A few are left whole.
  const rows = Math.max(2, Math.round((m.r1 - m.r0) / m.cell));
  const band = (m.r1 - m.r0) / rows;
  const N = Math.round((TAU * (m.r0 + m.r1) * 0.5) / m.cell);
  const wrap = (i: number) => ((i % N) + N) % N;
  const seeds: P[][] = Array.from({ length: rows + 2 }, (_, J) =>
    Array.from({ length: N }, (_, i): P => {
      const a = ((i + (J & 1) * 0.5 + (r() - 0.5) * 0.5) / N) * TAU;
      const v = m.r0 + (J - 0.5 + (r() - 0.5) * 0.5) * band;
      return [Math.cos(a) * v, Math.sin(a) * v];
    }),
  );
  const around: P[][][] = seeds.map((row) => row.map(() => []));
  const joints: P[] = [];
  const tri = (...at: [number, number][]) => {
    const pts = at.map(([J, i]) => seeds[J][wrap(i)]);
    const cen: P = [(pts[0][0] + pts[1][0] + pts[2][0]) / 3, (pts[0][1] + pts[1][1] + pts[2][1]) / 3];
    for (const [J, i] of at) around[J][wrap(i)].push(cen);
    joints.push(cen);
  };
  for (let J = 0; J <= rows; J++) {
    for (let i = 0; i < N; i++) {
      if (J & 1) {
        tri([J + 1, i], [J + 1, i + 1], [J, i]);
        tri([J, i], [J, i + 1], [J + 1, i + 1]);
      } else {
        tri([J, i], [J, i + 1], [J + 1, i]);
        tri([J, i + 1], [J + 1, i + 1], [J + 1, i]);
      }
    }
  }
  const holes: P[][] = [];
  for (let J = 1; J <= rows; J++) {
    const edgeRow = J === 1 || J === rows;
    for (let i = 0; i < N; i++) {
      if (r() < 0.04) continue;
      const [sx, sy] = seeds[J][i];
      const strut = band * (0.04 + r() * 0.04) * (edgeRow ? 1.8 : 1);
      const ring = around[J][i]
        .slice()
        .sort((p, q) => Math.atan2(p[1] - sy, p[0] - sx) - Math.atan2(q[1] - sy, q[0] - sx))
        .map(([x, y]): P => {
          const d = Math.hypot(x - sx, y - sy) || 1;
          const f = Math.max(0.1, 1 - strut / d);
          return [sx + (x - sx) * f, sy + (y - sy) * f];
        });
      if (ring.length > 2) holes.push(ring);
    }
  }
  const cells = () => {
    c.beginPath();
    for (const h of holes) {
      const mid = (p: P, q: P): P => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
      const start = mid(h[h.length - 1], h[0]);
      c.moveTo(start[0], start[1]);
      h.forEach((p, n) => {
        const next = mid(p, h[(n + 1) % h.length]);
        c.quadraticCurveTo(p[0], p[1], next[0], next[1]);
      });
      c.closePath();
    }
  };
  c.globalCompositeOperation = 'destination-out';
  cells();
  c.fillStyle = '#000';
  c.fill();
  c.globalCompositeOperation = 'source-over';
  // Long strands reaching in from its inside edge towards the light.
  for (let i = 0; i < 4; i++) {
    const a = r() * TAU;
    const v = inner(a);
    const b = a + (r() - 0.5) * 0.5;
    const w = m.r0 * (0.55 + r() * 0.2);
    const bend = (a + b) / 2 + (r() - 0.5) * 0.35;
    c.beginPath();
    c.moveTo(Math.cos(a) * v, Math.sin(a) * v);
    c.quadraticCurveTo(Math.cos(bend) * (v + w) * 0.5, Math.sin(bend) * (v + w) * 0.5, Math.cos(b) * w, Math.sin(b) * w);
    c.strokeStyle = `rgb(${tone(9)},${tone(10)},${tone(12)})`;
    c.lineWidth = (0.8 + r() * 1.2) * hair;
    c.stroke();
    c.strokeStyle = `rgba(255,240,228,${m.rim * 0.8})`;
    c.lineWidth = 0.7 * hair;
    c.stroke();
  }
  // Lit along every edge by the light at the end.
  c.lineWidth = hair;
  cells();
  c.strokeStyle = `rgba(255,240,228,${m.rim * 0.8})`;
  c.stroke();
  c.beginPath();
  ring(inner);
  c.strokeStyle = `rgba(255,240,228,${Math.min(0.3, m.rim * 1.5)})`;
  c.lineWidth = 1.2 * hair;
  c.stroke();
  c.beginPath();
  ring(outer);
  c.strokeStyle = `rgba(255,240,228,${m.rim * 0.4})`;
  c.lineWidth = hair;
  c.stroke();
  // Points where its struts meet, a few, like the nodes of an instrument.
  for (const [x, y] of joints.filter(() => r() < 0.07)) {
    c.fillStyle = `rgba(255,240,228,${0.3 + m.rim * 2})`;
    c.beginPath();
    c.arc(x, y, 1.3 * hair, 0, TAU);
    c.fill();
  }
}

/**
 * The other dimension's depths, deepest first, each painted once onto its own
 * square canvas centred on the eye, so that each turns and breathes on its own
 * (in CSS) and moves at its own depth: its deepest ring of membrane with the
 * light from the end falling out through it in shafts (soft), what drifts in
 * its haze (fine dust, and points of light joined by lines, like the
 * constellations of the Map), its middle ring, and its nearest ring. `reach`
 * is how far each runs from the centre, in units; the deeper ones lie behind
 * the plane in focus and are painted at less than a pixel to the stage's
 * pixel (`q`): soft, and cheap. Each ring turns once in `turn` seconds (the
 * other way when negative), each against the next; what drifts in the haze
 * does not turn (`turn` 0) but wanders, slowly, once in `wander` seconds; and
 * each breathes (swells a little and settles) once in `breathe` seconds.
 */
export const DEPTHS = [
  { reach: 540, q: 0.5, turn: 420, wander: 0, breathe: 13 },
  { reach: TEAR_W, q: 0.75, turn: 0, wander: 34, breathe: 17 },
  { reach: membraneReach(MEMBRANES[1]), q: 0.75, turn: -230, wander: 0, breathe: 9.5 },
  { reach: membraneReach(NEAR), q: 1.25, turn: 300, wander: 0, breathe: 11 },
] as const;

/** Paint one of the dimension's depths (see DEPTHS) onto its canvas. */
export function paintDepth(canvas: HTMLCanvasElement, depth: number, o: { k: number; seed: number }) {
  const { reach, q: most } = DEPTHS[depth];
  const css = 2 * reach * o.k;
  const q = Math.min(window.devicePixelRatio || 1, most, 2600 / css);
  canvas.width = canvas.height = Math.max(1, Math.round(css * q));
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(o.k * q, 0, 0, o.k * q, canvas.width / 2, canvas.height / 2);
  const blur = (m: Membrane) => m.blur * o.k * q;
  if (depth === 0)
    soft(ctx, blur(MEMBRANES[0]), (c) => {
      shafts(c, o.seed);
      drawMembrane(c, MEMBRANES[0], { k: o.k, seed: o.seed, layer: 0 });
    });
  else if (depth === 1) drift(ctx, o);
  else if (depth === 2) soft(ctx, blur(MEMBRANES[1]), (c) => drawMembrane(c, MEMBRANES[1], { k: o.k, seed: o.seed, layer: 1 }));
  else drawMembrane(ctx, NEAR, { ...o, layer: 2 });
}

/** Light from the end of the tunnel, falling out through it in faint shafts. */
function shafts(c: CanvasRenderingContext2D, seed: number) {
  const rays = seeded(seed + 67);
  for (let i = 0; i < 36; i++) {
    const [a, w, len] = [rays() * TAU, 0.01 + rays() * 0.04, 320 + rays() * 210];
    const g = c.createRadialGradient(0, 0, 0, 0, 0, len);
    g.addColorStop(0, `rgba(236,232,223,${(0.05 + rays() * 0.06).toFixed(3)})`);
    g.addColorStop(1, 'rgba(236,232,223,0)');
    c.beginPath();
    c.moveTo(0, 0);
    c.arc(0, 0, len, a - w, a + w);
    c.closePath();
    c.fillStyle = g;
    c.fill();
  }
}

/**
 * What drifts in its haze: fine dust, and points of light joined by lines,
 * strewn over a disc round the eye, so that as it turns there is always as
 * much of it in the tear.
 */
function drift(c: CanvasRenderingContext2D, o: { k: number; seed: number }) {
  const hair = 1 / o.k;
  const r = seeded(o.seed + 61);
  const R = TEAR_W * 0.98;
  for (let i = 0; i < 480; i++) {
    const [a, d] = [r() * TAU, Math.sqrt(r()) * R];
    c.fillStyle = `rgba(236,232,223,${(0.12 + r() * 0.38).toFixed(2)})`;
    c.beginPath();
    c.arc(Math.cos(a) * d, Math.sin(a) * d, (0.4 + r() ** 3 * 1.3) * hair, 0, TAU);
    c.fill();
  }
  for (let k = 0; k < 26; k++) {
    const [a0, d0] = [r() * TAU, 330 + r() * (R - 400)];
    let [x, y] = [Math.cos(a0) * d0, Math.sin(a0) * d0];
    const pts: P[] = [[x, y]];
    let dir = r() * TAU;
    const n = 4 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      dir += (r() - 0.5) * 1.8;
      const step = 24 + r() * 44;
      x += Math.cos(dir) * step;
      y += Math.sin(dir) * step * 0.7;
      pts.push([x, y]);
    }
    c.beginPath();
    pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py)));
    const [a, b] = [pts[Math.floor(r() * pts.length)], pts[Math.floor(r() * pts.length)]];
    c.moveTo(a[0], a[1]);
    c.lineTo(b[0], b[1]);
    c.strokeStyle = 'rgba(236,232,223,0.2)';
    c.lineWidth = hair;
    c.stroke();
    pts.forEach(([px, py], i) => {
      const bright = i === 0 || r() < 0.15;
      if (bright) {
        const g = c.createRadialGradient(px, py, 0, px, py, 7 * hair);
        g.addColorStop(0, 'rgba(255,244,234,0.5)');
        g.addColorStop(1, 'rgba(255,244,234,0)');
        c.fillStyle = g;
        c.fillRect(px - 7 * hair, py - 7 * hair, 14 * hair, 14 * hair);
      }
      c.fillStyle = `rgba(255,244,234,${bright ? 0.95 : 0.6})`;
      c.beginPath();
      c.arc(px, py, (bright ? 1.6 : 1.1) * hair, 0, TAU);
      c.fill();
    });
  }
}

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

/** Whether a canvas can blur what it draws (not in Safari). */
const CANVAS_BLURS = typeof CanvasRenderingContext2D !== 'undefined' && 'filter' in CanvasRenderingContext2D.prototype;

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
  if (CANVAS_BLURS) {
    ctx.filter = `blur(${blur.toFixed(2)}px)`;
    ctx.drawImage(off, 0, 0);
  } else {
    // Safari's canvas has no filter: shrunk and drawn back up, smoothed, is near enough to a blur for these layers.
    const k = Math.max(1, blur / 1.5);
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(off.width / k));
    small.height = Math.max(1, Math.round(off.height / k));
    const s = small.getContext('2d');
    if (s) {
      s.imageSmoothingQuality = 'high';
      s.drawImage(off, 0, 0, small.width, small.height);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(small, 0, 0, off.width, off.height);
    } else ctx.drawImage(off, 0, 0);
  }
  ctx.restore();
}

/**
 * The sky: stars at many depths, like the Map's, drifting slowly out towards
 * you from behind the eye. Each is a point in a box of space; the nearer, the
 * larger and the further out it lies; and the camera's pull carries the
 * farthest the most. Drawn each frame onto one canvas.
 */
export interface Star {
  x: number;
  y: number;
  /** Distance: 1 = far, down to STAR_NEAR as it passes. */
  z: number;
  r: number;
  a: number;
  cool: boolean;
  /** Twinkle: depth (0 = steady), rate and phase. */
  tw: number;
  tf: number;
  tp: number;
}
const STAR_NEAR = 0.24;
/** Distance per second: a star takes a minute and a half to pass. */
const STAR_CRUISE = 1 / 120;
const newStar = (rand: () => number, z: number): Star => ({
  x: (rand() * 2 - 1) * 1.5,
  y: (rand() * 2 - 1) * 1.5,
  z,
  r: 0.3 + rand() ** 2.2 * 1.1,
  a: 0.2 + rand() * 0.6,
  cool: rand() < 0.3,
  tw: rand() < 0.12 ? 0.3 + rand() * 0.5 : 0,
  tf: 0.6 + rand() * 1.8,
  tp: rand() * TAU,
});
/** The stars for a stage `w` by `h`. */
export function makeStars(w: number, h: number) {
  const r = seeded(5);
  return Array.from({ length: Math.min(900, Math.round((w * h) / 1500)) }, () => newStar(r, STAR_NEAR + r() * (1 - STAR_NEAR)));
}
/**
 * A ripple through space, going out from the eye: how long ago it started
 * (ms), how far it pushes the stars it passes (px), how fast it runs (px a
 * ms), how long it lasts (ms), and `flat`, how much faster it runs along the
 * tear's line than across it (1 = a circle; less, it runs out further
 * sideways, as from a line).
 */
export interface Ripple {
  age: number;
  amp: number;
  speed: number;
  life: number;
  flat: number;
}
/** How hard a ripple bears at a distance `d` (in its own measure) from its centre: 0 to 1. */
const rippleAt = (w: Ripple, d: number) => {
  const front = w.speed * w.age;
  const fade = Math.exp(-w.age / w.life) * Math.min(1, w.age / 60);
  return Math.exp(-(((d - front) / 70) ** 2)) * fade;
};

/**
 * Draw the stars, having moved them on by `dt` ms: round the vanishing point
 * (vx, vy), the eye; (ox, oy) is how far the camera carries the farthest, in
 * pixels. `t` is the time, for the twinkles. Ripples going out through space
 * push the stars aside as they pass and make them flare, and bend the dark
 * along their front. `chroma` (0 to 1) splits their light as through a lens:
 * red out from the eye and blue in, the further out the wider.
 */
export function drawStars(
  c: CanvasRenderingContext2D,
  stars: Star[],
  o: { w: number; h: number; q: number; vx: number; vy: number; ox: number; oy: number; dt: number; t: number; ripples?: Ripple[]; chroma?: number },
) {
  c.setTransform(o.q, 0, 0, o.q, 0, 0);
  c.clearRect(0, 0, o.w, o.h);
  const ripples = o.ripples ?? [];
  // The front of each ripple: a faint band where space bends.
  for (const w of ripples) {
    const fade = Math.exp(-w.age / w.life) * Math.min(1, w.age / 60);
    if (fade < 0.02) continue;
    c.save();
    c.translate(o.vx, o.vy);
    c.scale(1 / w.flat, 1);
    c.beginPath();
    c.arc(0, 0, w.speed * w.age, 0, TAU);
    c.restore();
    c.strokeStyle = `rgba(236,232,223,${(0.05 * fade).toFixed(3)})`;
    c.lineWidth = 46;
    c.stroke();
    c.strokeStyle = `rgba(236,232,223,${(0.08 * fade).toFixed(3)})`;
    c.lineWidth = 1.2;
    c.stroke();
  }
  const spread = Math.max(o.w, o.h) * 0.32;
  const flares: [number, number, number, number][] = [];
  const split: [number, number, number, number][] = [];
  const chroma = o.chroma ?? 0;
  const reach = Math.hypot(o.w, o.h) / 2;
  for (const s of stars) {
    s.z -= (o.dt / 1000) * STAR_CRUISE;
    if (s.z < STAR_NEAR) Object.assign(s, newStar(Math.random, 1));
    const f = 0.7 + 0.3 * s.z;
    let x = o.vx + (s.x / s.z) * spread + o.ox * f;
    let y = o.vy + (s.y / s.z) * spread + o.oy * f;
    // Each ripple pushes it out from the eye as it passes, and it flares.
    let lit = 0;
    for (const w of ripples) {
      const [dx, dy] = [x - o.vx, y - o.vy];
      const d = Math.hypot(dx * w.flat, dy) || 1;
      const g = rippleAt(w, d);
      if (g < 0.01) continue;
      const len = Math.hypot(dx, dy) || 1;
      x += (dx / len) * w.amp * g;
      y += (dy / len) * w.amp * g;
      lit = Math.max(lit, g);
    }
    if (x < -8 || x > o.w + 8 || y < -8 || y > o.h + 8) continue;
    const near = 1 - s.z;
    const size = s.r * (0.6 + near * 1.8) * (1 + 0.8 * lit);
    let a = Math.min(1, s.a * Math.min(1, near / 0.12) * (1 + 1.6 * lit));
    if (s.tw) a *= 1 - s.tw * (0.5 + 0.5 * Math.sin(o.t * 0.001 * s.tf + s.tp));
    if (chroma > 0.01) split.push([x, y, size, a]);
    c.globalAlpha = a;
    c.fillStyle = s.cool ? '#d6deec' : '#ece8df';
    if (size < 1) c.fillRect(x - size, y - size, size * 2, size * 2);
    else {
      c.beginPath();
      c.arc(x, y, size, 0, TAU);
      c.fill();
      if (size > 1.6) flares.push([x, y, size, a]);
    }
  }
  // Their light split, as through a lens: red out from the eye, blue in.
  if (split.length) {
    c.globalCompositeOperation = 'lighter';
    for (const [x, y, size, a] of split) {
      const [dx, dy] = [x - o.vx, y - o.vy];
      const d = Math.hypot(dx, dy) || 1;
      const off = chroma * (1.5 + 7 * Math.min(1, d / reach));
      const [ux, uy] = [(dx / d) * off, (dy / d) * off];
      const r = Math.max(0.8, size);
      c.globalAlpha = a * 0.7 * chroma;
      c.fillStyle = '#ff3a60';
      c.beginPath();
      c.arc(x + ux, y + uy, r, 0, TAU);
      c.fill();
      c.fillStyle = '#3cc8ff';
      c.beginPath();
      c.arc(x - ux, y - uy, r, 0, TAU);
      c.fill();
    }
    c.globalCompositeOperation = 'source-over';
  }
  // The nearest carry a faint cross of light.
  c.strokeStyle = '#ece8df';
  c.lineWidth = 0.6;
  for (const [x, y, size, a] of flares) {
    c.globalAlpha = a * 0.28;
    c.beginPath();
    c.moveTo(x - size * 6, y);
    c.lineTo(x + size * 6, y);
    c.moveTo(x, y - size * 6);
    c.lineTo(x, y + size * 6);
    c.stroke();
  }
  c.globalAlpha = 1;
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
