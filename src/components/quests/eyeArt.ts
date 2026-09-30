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
/** How far the iris travels when it looks. */
export const GAZE = 70;
/** The rings: its strength, its ticks, its armor, the text that turns. */
export const R_HP = 392;
export const R_TICKS = 372;
export const R_ARMOR = 436;
export const R_TEXT = 462;

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

/** The eye's outline, open by `o` (0 closed, 1 wide open). */
export function lids(o: number) {
  const c = (-EH * Math.max(0.012, o)) / 0.75;
  return `M${-EW} 0C${f(-EW * 0.45)} ${f(c)} ${f(EW * 0.45)} ${f(c)} ${EW} 0C${f(EW * 0.45)} ${f(-c)} ${f(-EW * 0.45)} ${f(-c)} ${-EW} 0Z`;
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

/** A ring of the boss's strength: segment `i` of `n` at radius `r`. */
export function segment(i: number, n: number, r: number) {
  const gap = Math.min(2.6, 110 / n);
  return arc(r, -90 + (i * 360) / n + gap / 2, -90 + ((i + 1) * 360) / n - gap / 2);
}

/* ---- The clock that is its pupil ------------------------------------------ */

const NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
const ADVANCE: Record<string, number> = { I: 3.6, V: 8.8, X: 8.8 };

/**
 * Roman numerals engraved as strokes, set radially as on an old dial (the
 * top of each numeral faces out). Heavy and hairline strokes are separate,
 * as in the old engraved faces; III and VI give way to the window and the
 * small seconds.
 */
export const DIAL = (() => {
  const h = 13;
  const rn = RC - 28;
  let heavy = '';
  let hair = '';
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
      if (c === 'I') {
        const cx = x + 1;
        heavy += line(cx, y0, cx, y1);
        hair += line(cx - 1.7, y0, cx + 1.7, y0) + line(cx - 1.7, y1, cx + 1.7, y1);
      } else {
        const [l, r] = [x + 0.6, x + 7.2];
        if (c === 'V') {
          heavy += line(l, y0, (l + r) / 2, y1);
          hair += line((l + r) / 2, y1, r, y0);
        } else {
          heavy += line(l, y0, r, y1);
          hair += line(r, y0, l, y1) + line(l - 1.5, y1, l + 1.9, y1) + line(r - 1.9, y1, r + 1.5, y1);
        }
        hair += line(l - 1.5, y0, l + 1.9, y0) + line(r - 1.9, y0, r + 1.5, y0);
      }
      x += ADVANCE[c];
    }
  });
  // A rose-engine pattern at the centre of the dial.
  let rose = '';
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * TAU;
    const [cx, cy, r] = [Math.cos(a) * RC * 0.13, Math.sin(a) * RC * 0.13, RC * 0.33];
    rose += `M${f(cx + r)} ${f(cy)}A${r} ${r} 0 1 0 ${f(cx - r)} ${f(cy)}A${r} ${r} 0 1 0 ${f(cx + r)} ${f(cy)}`;
  }
  return {
    heavy,
    hair,
    rose,
    knurl: ticks(150, RC + 5, RC + 10),
    minutes: ticks(60, RC - 7, RC - 12, (i) => i % 5 === 0),
    hours: ticks(12, RC - 5, RC - 15),
    subTicks: ticks(12, 14, 17),
  };
})();

/** The small seconds, at six o'clock, and the window at three. */
export const SUB = { y: RC * 0.47, r: 18.5 };
export const WINDOW = { x: RC * 0.5, w: 25, h: 15 };

/** A Breguet hand pointing up: a tapered shaft, an open moon near the tip, a needle point. */
export function hand(length: number, moon: number, moonR: number, w: number) {
  return (
    `M${-w} 10L${w} 10L${f(w * 0.55)} ${f(-(moon - moonR))}L${f(-w * 0.55)} ${f(-(moon - moonR))}Z` +
    `M${f(-w * 0.6)} ${f(-(moon + moonR))}L${f(w * 0.6)} ${f(-(moon + moonR))}L0 ${-length}Z`
  );
}
export const HOUR = { length: RC * 0.5, moon: RC * 0.36, moonR: 4.6, w: 1.9 };
export const MINUTE = { length: RC * 0.8, moon: RC * 0.6, moonR: 5, w: 1.5 };

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
