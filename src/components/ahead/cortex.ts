import { claimSentence, claimStatus } from '../../domain/claims';
import { EXPERIMENT_STATUS_LABEL, REGULARITY_LABEL, SKILL_STATUS_LABEL, STATUS_META } from '../../domain/constants';
import { experimentCode, patternStats, patternTitle } from '../../domain/selectors';
import type { AtlasData, EntityRef, SkillStatus, StrategicPath } from '../../domain/types';
import { t } from '../../i18n';

/*
 * Ahead as a nervous system, drawn like an anatomical plate.
 *
 * Where you are is a brain seen from the front. Below it, the spine: what
 * holds you branching off one side (constraints), what carries you off the
 * other (assets). Above it, a dome of four bands, the questions every option
 * is asked (what it needs, the skills it takes, what it costs, what is not
 * known yet). Each option is a nerve growing out of the brain through the
 * dome; where it crosses a band, its answers branch off it as dendrites, one
 * mark per answer, so reading round a band compares the options and reading
 * up a nerve reads one option. Nothing here is ranked.
 */

export type P = [number, number];

export type Band = 'needs' | 'skills' | 'costs' | 'unknowns';
export const BANDS: Band[] = ['needs', 'skills', 'costs', 'unknowns'];

export type CortexKind =
  'requirement' | 'dependency' | 'capital' | 'time' | 'skill' | 'risk' | 'tradeoff' | 'cost' | 'unknown' | 'assumption' | 'test' | 'idea' | 'repeat';

export const BAND_OF: Record<CortexKind, Band> = {
  requirement: 'needs',
  dependency: 'needs',
  capital: 'needs',
  time: 'needs',
  skill: 'skills',
  risk: 'costs',
  tradeoff: 'costs',
  cost: 'costs',
  unknown: 'unknowns',
  assumption: 'unknowns',
  test: 'unknowns',
  idea: 'unknowns',
  repeat: 'unknowns',
};

export const BAND_LABEL: Record<Band, () => string> = {
  needs: () => t('Needs'),
  skills: () => t('Skills'),
  costs: () => t('Costs'),
  unknowns: () => t('Unknowns'),
};

export const KIND_LABEL: Record<CortexKind, () => string> = {
  requirement: () => t('Requirement'),
  dependency: () => t('Dependency'),
  capital: () => t('Capital'),
  time: () => t('Time'),
  skill: () => t('Skill'),
  risk: () => t('Risk'),
  tradeoff: () => t('Trade-off'),
  cost: () => t('Opportunity cost'),
  unknown: () => t('Unknown'),
  assumption: () => t('Relies on'),
  test: () => t('Test'),
  idea: () => t('Idea for a test'),
  repeat: () => t('Repeat in play'),
};

/** One answer an option gives, as a mark on its nerve. */
export interface CortexItem {
  key: string;
  pathId: string;
  kind: CortexKind;
  band: Band;
  text: string;
  /** Its status in words (a skill's, a reason's, a test's, a repeat's). */
  status?: string;
  /** A skill's footing. */
  skill?: SkillStatus;
  /** How a reason it relies on is drawn: its line and how solid it reads. */
  dash?: string;
  opacity?: number;
  /** Wants your attention: a skill you lack, a reason the exceptions outweigh. */
  warn?: boolean;
  /** What it opens in the inspector. */
  ref?: EntityRef;
}

/** Every answer an option gives, in the order of its bands. */
export function cortexItems(data: AtlasData, p: StrategicPath): CortexItem[] {
  const out: CortexItem[] = [];
  const add = (kind: CortexKind, text: string, extra: Partial<CortexItem> = {}) =>
    out.push({ key: `${p.id}:${kind}:${out.length}`, pathId: p.id, kind, band: BAND_OF[kind], text, ...extra });
  p.requirements.forEach((x) => add('requirement', x));
  p.dependencies.forEach((x) => add('dependency', x));
  if (p.capital) add('capital', p.capital);
  if (p.time) add('time', p.time);
  p.skills.forEach((s) => add('skill', s.label, { skill: s.status, status: SKILL_STATUS_LABEL[s.status], warn: s.status === 'gap' }));
  p.risks.forEach((x) => add('risk', x));
  p.tradeoffs.forEach((x) => add('tradeoff', x));
  p.opportunityCosts.forEach((x) => add('cost', x));
  p.unknowns.forEach((x) => add('unknown', x));
  for (const id of p.assumptionIds) {
    const c = data.claims[id];
    if (!c) continue;
    const status = claimStatus(data, c);
    const meta = STATUS_META[status];
    add('assumption', claimSentence(data, c, status), {
      status: meta.label,
      dash: meta.dash,
      opacity: meta.opacity,
      warn: status === 'weakened' || status === 'retired',
      ref: { kind: 'claim', id },
    });
  }
  for (const id of p.experimentIds) {
    const x = data.experiments[id];
    if (!x) continue;
    add('test', `${experimentCode(x.code)} ${x.title}`, { status: EXPERIMENT_STATUS_LABEL[x.status], ref: { kind: 'experiment', id } });
  }
  p.proposedExperiments.forEach((x) => add('idea', x));
  for (const id of p.patternIds) {
    const pat = data.patterns[id];
    if (!pat || pat.setAside) continue;
    add('repeat', patternTitle(pat), { status: REGULARITY_LABEL[patternStats(data, pat).regularity], ref: { kind: 'pattern', id } });
  }
  return out;
}

/* ---- The plate's geometry ------------------------------------------------- */

export interface CortexGeo {
  w: number;
  h: number;
  /** The brain's centre, where the dome is drawn from. */
  cx: number;
  cy: number;
  /** The brain's half width and height. */
  bw: number;
  bh: number;
  /** The band edges, inside to out: five radii. */
  r: number[];
  /** Where the spine runs, top to bottom. */
  spine: [number, number];
  /** How far the dome opens either side of straight up, in degrees. */
  open: number;
  /** A narrow plate: options named by their letter at the nerve's end, the names of the bands left to the key. */
  compact: boolean;
}

/**
 * Lay the plate out on a stage `w` by `h`; `room` is the width on the right
 * kept free for the reading panel.
 */
export function cortexGeo(w: number, h: number, room = 0): CortexGeo {
  const avail = Math.max(240, w - room);
  const compact = avail < 560;
  const cx = avail / 2;
  const wideOuter = Math.max(120, Math.min(h * 0.66 - 64, (avail / 2) * 0.84, h * 0.64));
  const outer = compact ? Math.max(110, Math.min(avail / 2 - 14, h * 0.6 - 44)) : wideOuter;
  const cy = compact ? Math.min(h * 0.6, outer + 84) : h * 0.66;
  const r0 = outer * 0.27;
  const inner = r0 * 1.16;
  const r = Array.from({ length: 5 }, (_, i) => inner + ((outer - inner) * i) / 4);
  const bh = r0 * 0.86;
  return { w, h, cx, cy, bw: r0, bh, r, spine: [cy + bh * 0.95, h - 14], open: 82, compact };
}

/** A point at `r` from the brain, `a` degrees right of straight up. */
export const polar = (g: CortexGeo, r: number, a: number): P => {
  const rad = (a * Math.PI) / 180;
  return [g.cx + r * Math.sin(rad), g.cy - r * Math.cos(rad)];
};

/** An arc at `r` from `a0` to `a1` degrees, as path data. */
export function arcD(g: CortexGeo, r: number, a0: number, a1: number) {
  const [x0, y0] = polar(g, r, a0);
  const [x1, y1] = polar(g, r, a1);
  return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r.toFixed(1)} ${r.toFixed(1)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0} ${a1 > a0 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`;
}

export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
const f = (n: number) => n.toFixed(1);

/** A smooth line through points (Catmull-Rom as cubic Béziers). */
export function smooth(pts: P[], closed = false) {
  if (pts.length < 2) return '';
  const at = (i: number) => (closed ? pts[(i + pts.length) % pts.length] : pts[Math.max(0, Math.min(pts.length - 1, i))]);
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    const c1: P = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: P = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

/* ---- The brain -------------------------------------------------------------- */

/**
 * One hemisphere in a coronal section (right side; x is mirrored for the
 * left), round from the top of the midline: the convexity, the lateral
 * (Sylvian) notch, the temporal lobe below it, and back up the midline.
 */
const HEMISPHERE: P[] = [
  [0.05, -0.93],
  [0.22, -1.0],
  [0.45, -0.97],
  [0.66, -0.86],
  [0.83, -0.67],
  [0.95, -0.42],
  [1.0, -0.14],
  [0.96, 0.06],
  [0.84, 0.1],
  [0.74, 0.12],
  [0.86, 0.2],
  [0.97, 0.33],
  [0.93, 0.5],
  [0.78, 0.62],
  [0.58, 0.63],
  [0.42, 0.52],
  [0.3, 0.4],
  [0.17, 0.36],
  [0.08, 0.24],
  [0.05, 0.0],
  [0.04, -0.5],
];

/** Resample a closed outline to `n` points spaced along it. */
function resample(pts: P[], n: number): P[] {
  const segs = pts.map((p, i) => {
    const q = pts[(i + 1) % pts.length];
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  });
  const total = segs.reduce((a, b) => a + b, 0);
  const out: P[] = [];
  let i = 0;
  let acc = 0;
  for (let k = 0; k < n; k++) {
    const want = (total * k) / n;
    while (acc + segs[i] < want) acc += segs[i++];
    const u = (want - acc) / segs[i];
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    out.push([p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u]);
  }
  return out;
}

export interface Brain {
  outline: string[];
  /** The cortex's grey band (a contour inside the outline), and the sulci cutting into it. */
  cortex: string[];
  sulci: string;
  /** The white matter's landmarks: the corpus callosum, the ventricles, the thalami. */
  callosum: string;
  ventricles: string[];
  thalami: string[];
  fissure: string;
  stem: string;
  /** Where you are: the point between the hemispheres every option grows from. */
  you: P;
}

/** How far the brain's outline lies from its centre, `a` degrees right of straight up (an ellipse, near enough). */
export const brainReach = (g: CortexGeo, a: number) => {
  const rad = (a * Math.PI) / 180;
  return 1 / Math.sqrt((Math.sin(rad) / g.bw) ** 2 + (Math.cos(rad) / g.bh) ** 2);
};

/** The brain, drawn round its centre, as an anatomical plate draws a coronal section. */
export function brain(g: CortexGeo): Brain {
  const base = resample(HEMISPHERE, 96);
  const at =
    (side: 1 | -1) =>
    (p: P): P => [g.cx + side * p[0] * g.bw, g.cy + p[1] * g.bh];
  const r = seeded(11);
  const outline: string[] = [];
  const cortex: string[] = [];
  let sulci = '';
  const centre: P = [0.5, -0.12];
  for (const side of [1, -1] as const) {
    const place = at(side);
    outline.push(smooth(base.map(place), true));
    // The grey band: the outline drawn inwards, gently waving, as the cortex follows the folds.
    const wave = r() * 6;
    const grey = base.map(([x, y], i): P => {
      const u = (i / base.length) * Math.PI * 2;
      const s = 0.84 + 0.035 * Math.sin(u * 9 + wave);
      return [centre[0] + (x - centre[0]) * s, centre[1] + (y - centre[1]) * s];
    });
    cortex.push(smooth(grey.map(place), true));
    // The sulci: grooves cutting in from the surface, each a short bent stroke, the deep ones forked.
    for (let i = 0; i < base.length; i += 5) {
      const [x, y] = base[i];
      if (x < 0.12 || (y > 0.3 && x < 0.5)) continue;
      const [nx, ny] = [centre[0] - x, centre[1] - y];
      const len = Math.hypot(nx, ny) || 1;
      const depth = 0.1 + r() * 0.13;
      const bend = (r() - 0.5) * 0.08;
      const [ux, uy] = [nx / len, ny / len];
      const end: P = [x + ux * depth - uy * bend, y + uy * depth + ux * bend];
      const mid: P = [x + ux * depth * 0.5 + uy * bend, y + uy * depth * 0.5 - ux * bend];
      const [p0, p1, p2] = [place([x + ux * 0.01, y + uy * 0.01]), place(mid), place(end)];
      sulci += `M${f(p0[0])} ${f(p0[1])}Q${f(p1[0])} ${f(p1[1])} ${f(p2[0])} ${f(p2[1])}`;
      if (depth > 0.18) {
        const fork = place([end[0] + uy * 0.05, end[1] - ux * 0.05]);
        sulci += `M${f(p2[0])} ${f(p2[1])}L${f(fork[0])} ${f(fork[1])}`;
      }
    }
  }
  const P0 = (x: number, y: number): P => [g.cx + x * g.bw, g.cy + y * g.bh];
  const callosum = [
    smooth([P0(-0.46, -0.16), P0(-0.24, -0.32), P0(0, -0.36), P0(0.24, -0.32), P0(0.46, -0.16)]),
    smooth([P0(-0.4, -0.1), P0(-0.2, -0.22), P0(0, -0.25), P0(0.2, -0.22), P0(0.4, -0.1)]),
  ].join('');
  const ventricles = [1, -1].map((side) =>
    smooth([P0(side * 0.04, -0.2), P0(side * 0.22, -0.2), P0(side * 0.3, -0.08), P0(side * 0.2, -0.1), P0(side * 0.06, -0.06)], true),
  );
  const thalami = [1, -1].map((side) =>
    smooth([P0(side * 0.04, 0.02), P0(side * 0.17, -0.02), P0(side * 0.22, 0.1), P0(side * 0.12, 0.2), P0(side * 0.04, 0.16)], true),
  );
  const fissure = `M${f(g.cx)} ${f(g.cy - g.bh * 0.93)}L${f(g.cx)} ${f(g.cy - g.bh * 0.37)}`;
  const top = g.cy + g.bh * 0.3;
  const stem = [-1, 1]
    .map(
      (side) =>
        `M${f(g.cx + side * g.bw * 0.1)} ${f(top)}C${f(g.cx + side * g.bw * 0.1)} ${f(top + g.bh * 0.3)} ${f(g.cx + side * g.bw * 0.05)} ${f(g.spine[0] - g.bh * 0.2)} ${f(g.cx + side * g.bw * 0.05)} ${f(g.spine[0])}`,
    )
    .join('');
  return { outline, cortex, sulci, callosum, ventricles, thalami, fissure, stem, you: P0(0, -0.3) };
}

/* ---- The spine -------------------------------------------------------------- */

export interface Nerve {
  key: string;
  side: 'constraint' | 'asset';
  text: string;
  d: string;
  end: P;
}

/** The spine's nerves: constraints to the left, assets to the right, spaced down it. */
export function nerves(g: CortexGeo, constraints: string[], assets: string[]): Nerve[] {
  const [top, bottom] = g.spine;
  const reach = Math.min(g.w * 0.2, 150, g.cx - 24);
  const out: Nerve[] = [];
  const lay = (items: string[], side: 'constraint' | 'asset') => {
    const dir = side === 'constraint' ? -1 : 1;
    items.forEach((text, i) => {
      const y = top + 14 + ((bottom - top - 22) * (i + 0.5)) / Math.max(1, items.length);
      const x0 = g.cx + dir * 4;
      const end: P = [g.cx + dir * reach * (0.62 + 0.38 * ((i % 2) * 0.6 + 0.4)), y + 8];
      out.push({
        key: `${side}:${i}`,
        side,
        text,
        d: `M${f(x0)} ${f(y)}C${f(x0 + dir * reach * 0.35)} ${f(y)} ${f(end[0] - dir * reach * 0.25)} ${f(end[1])} ${f(end[0])} ${f(end[1])}`,
        end,
      });
    });
  };
  lay(constraints, 'constraint');
  lay(assets, 'asset');
  return out;
}

/* ---- The nerves of the options ---------------------------------------------- */

export interface Trunk {
  pathId: string;
  /** Its middle direction, degrees right of straight up, and the share of the dome it has. */
  angle: number;
  span: number;
  d: string;
  /** Where it reaches each band's middle, for its counts. */
  crossings: P[];
  tip: P;
  /** Where its name goes, and which way the text runs from there. */
  label: P;
  anchor: 'start' | 'middle' | 'end';
  /** Its terminal arbor, and the small ornamental branches along it. */
  arbor: string;
  ticks: string;
}

export interface PlacedItem extends CortexItem {
  x: number;
  y: number;
  /** The twig from the nerve to it, and its fine dendrites. */
  twig: string;
  fringe: string;
  /** Its number on the plate: the option's letter and its place. */
  index: string;
  /** Which way out from the brain it lies, for its annotation. */
  angle: number;
}

/** Where along a nerve, at radius `rr`, the nerve has drifted to (degrees). */
const drift = (seed: number) => (rr: number) => Math.sin(seed * 0.7 + rr * 0.011) * 2.2 + Math.sin(seed * 1.3 + rr * 0.027) * 0.8;

/**
 * Grow a nerve per option and set each answer on a twig off it, within its
 * share of the dome and its band. `items` are each option's answers.
 */
export function layoutCortex(g: CortexGeo, paths: { id: string; code: string }[], items: Map<string, CortexItem[]>) {
  const n = paths.length;
  const gap = n > 1 ? 7 : 0;
  const span = Math.min(62, (2 * g.open - gap * (n - 1)) / Math.max(1, n));
  const total = span * n + gap * (n - 1);
  const trunks: Trunk[] = [];
  const placed: PlacedItem[] = [];
  const [inner, outer] = [g.r[0], g.r[4]];
  paths.forEach((p, i) => {
    const angle = -total / 2 + span / 2 + i * (span + gap);
    const seed = hash(p.id) % 1000;
    const r = seeded(seed + 3);
    const wave = drift(seed);
    const at = (rr: number) => angle + wave(rr);
    const start = brainReach(g, angle) * 0.96;
    const end = outer + 14;
    const pts: P[] = [];
    for (let k = 0; k <= 26; k++) {
      const rr = start + ((end - start) * k) / 26;
      pts.push(polar(g, rr, at(rr)));
    }
    const tip = polar(g, end, at(end));
    // The terminal arbor: the nerve ends in a spray of fine branches.
    let arbor = '';
    for (let k = 0; k < 7; k++) {
      const a = at(end) + (k - 3) * 3.2 + (r() - 0.5) * 2;
      const l = 10 + r() * 14;
      const [x1, y1] = polar(g, end + l, a);
      const [mx, my] = polar(g, end + l * 0.5, (a + at(end)) / 2);
      arbor += `M${f(tip[0])} ${f(tip[1])}Q${f(mx)} ${f(my)} ${f(x1)} ${f(y1)}`;
    }
    // Ticks along it, every few pixels, like a measured axis.
    let ticks = '';
    for (let rr = inner + 6; rr < outer; rr += 9) {
      const a = (at(rr) * Math.PI) / 180;
      const [x, y] = polar(g, rr, at(rr));
      const [nx, ny] = [Math.cos(a) * 2.5, Math.sin(a) * 2.5];
      ticks += `M${f(x - nx)} ${f(y - ny)}L${f(x + nx)} ${f(y + ny)}`;
    }
    const labelR = outer + (g.compact ? 26 : 50);
    const la = at(outer);
    trunks.push({
      pathId: p.id,
      angle,
      span,
      d: smooth(pts),
      crossings: [0, 1, 2, 3].map((b) => polar(g, (g.r[b] + g.r[b + 1]) / 2, at((g.r[b] + g.r[b + 1]) / 2))),
      tip,
      label: polar(g, labelR, la),
      anchor: g.compact ? 'middle' : la < -18 ? 'end' : la > 18 ? 'start' : 'middle',
      arbor,
      ticks,
    });

    // Its answers, band by band, spread either side of it.
    const mine = items.get(p.id) ?? [];
    let number = 0;
    BANDS.forEach((band, b) => {
      const list = mine.filter((it) => it.band === band);
      if (!list.length) return;
      const [lo, hi] = [g.r[b], g.r[b + 1]];
      const usable = span - 4;
      // One row when they fit, two (staggered) when they do not.
      const mid = (lo + hi) / 2;
      const room = ((usable * Math.PI) / 180) * mid;
      const rows = list.length * 22 > room ? 2 : 1;
      const perRow = Math.ceil(list.length / rows);
      list.forEach((it, j) => {
        const row = rows === 2 ? j % 2 : 0;
        const slot = rows === 2 ? Math.floor(j / 2) : j;
        const count = rows === 2 ? (row === 0 ? perRow : list.length - perRow) : list.length;
        let off = -usable / 2 + (usable * (slot + 0.5 + row * 0.5)) / (count + row * 0.5);
        // Keep clear of the nerve itself.
        if (Math.abs(off) < 3.2) off = off < 0 ? -3.2 : 3.2;
        const rr = rows === 2 ? lo + (hi - lo) * (row ? 0.7 : 0.32) + (r() - 0.5) * 6 : lo + (hi - lo) * (0.38 + r() * 0.24);
        const a = at(rr) + off;
        const [x, y] = polar(g, rr, a);
        const from = polar(g, rr - 4, at(rr - 4));
        const [cx, cy] = polar(g, rr + 6, (a + at(rr)) / 2);
        // Its fine dendrites: two short hairs off the mark.
        let fringe = '';
        for (let k = 0; k < 2; k++) {
          const da = (r() - 0.5) * 9;
          const [hx, hy] = polar(g, rr + 6 + r() * 6, a + da);
          fringe += `M${f(x)} ${f(y)}L${f(hx)} ${f(hy)}`;
        }
        number += 1;
        placed.push({
          ...it,
          x,
          y,
          twig: `M${f(from[0])} ${f(from[1])}Q${f(cx)} ${f(cy)} ${f(x)} ${f(y)}`,
          fringe,
          index: `${p.code}.${number}`,
          angle: a,
        });
      });
    });
  });
  return { trunks, placed, span };
}

/** The faint rays out from the brain, and the measured outer rim, as path data. */
export function graticule(g: CortexGeo) {
  let rays = '';
  for (let a = -g.open; a <= g.open + 0.01; a += 4) {
    const [x0, y0] = polar(g, g.r[0], a);
    const [x1, y1] = polar(g, g.r[4] + 6, a);
    rays += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
  }
  let ticks = '';
  for (let a = -g.open; a <= g.open + 0.01; a += 2) {
    const long = Math.round(a) % 10 === 0;
    const [x0, y0] = polar(g, g.r[4], a);
    const [x1, y1] = polar(g, g.r[4] + (long ? 9 : 4), a);
    ticks += `M${f(x0)} ${f(y0)}L${f(x1)} ${f(y1)}`;
  }
  return { rays, ticks };
}
