import { ArrowRight, Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { currentAction, experimentCode, pathCode } from '../../domain/selectors';
import type { StrategicPath } from '../../domain/types';
import { useIsDesktop, useMediaQuery } from '../../hooks/useMediaQuery';
import { t } from '../../i18n';
import { cn } from '../../lib/cn';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { commitDirection } from '../../state/operations';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { BAND_LABEL, BANDS, KIND_LABEL, answersOf, type Band } from './answers';
import { BandPanel, Glyph, ItemPanel, KEY, PathPanel, Section } from './AheadPanels';
import {
  atHeight,
  DISTANCE,
  eye,
  faceYaw,
  FLOOR,
  growTree,
  HALF,
  leafAt,
  LEVELS,
  project,
  projectAll,
  sizeOf,
  SOIL,
  TOP,
  type Camera,
  type TreeAnswer,
  type V3,
} from './tree';

type Pick = { kind: 'path'; id: string } | { kind: 'item'; key: string } | { kind: 'bough'; key: string } | { kind: 'band'; band: Band } | null;
const same = (a: Pick, b: Pick) => JSON.stringify(a) === JSON.stringify(b);

/** The reading panel's width on a wide screen, kept clear of the plate. */
const ROOM = 372;
/** Room on the plate's left for the level marks. */
const MARGIN = 112;
/** The camera at rest: looking a little down into the case, from under its ceiling. */
const PITCH = 8;
/** Once round in this many seconds, when nothing is held. */
const TURN = 150;
/** The tree grows in, up and down at once, over this long, as the page opens. */
const BUILD_MS = 3200;
/** After that, a root or the tree grows toward a new size about this fast (the time to go most of the way). */
const GROW_MS = 480;
const ROMAN = ['I', 'II', 'III', 'IV'];
/** The close-ups on the cards: drawn this much sharper than their size, and this much nearer than the plate. */
const CROP_DPR = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
const ZOOM = 2.4;
/** Lines are drawn in bins of width (on a log scale) and brightness, so a frame is a few dozen strokes. */
const WB = 14;
const AB = 5;
const W0 = 0.45;
const NONE = 65535;
const binWidth = (b: number) => W0 * 2 ** (b / 2.2);
const widthBin = (w: number) => Math.max(0, Math.min(WB - 1, Math.round(Math.log2(Math.max(W0, w) / W0) * 2.2)));
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const ease = (x: number) => 1 - (1 - x) ** 3;
/** The shortest way round from one angle to another, in degrees. */
const turnTo = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

/** The case's walls: each one's outward normal, and its two corners along it (at a given height). */
const WALLS: { n: V3; a: (y: number) => V3; b: (y: number) => V3 }[] = [
  { n: [1, 0, 0], a: (y) => [HALF, y, -HALF], b: (y) => [HALF, y, HALF] },
  { n: [-1, 0, 0], a: (y) => [-HALF, y, HALF], b: (y) => [-HALF, y, -HALF] },
  { n: [0, 0, 1], a: (y) => [HALF, y, HALF], b: (y) => [-HALF, y, HALF] },
  { n: [0, 0, -1], a: (y) => [-HALF, y, -HALF], b: (y) => [HALF, y, -HALF] },
];
const CORNERS: [number, number][] = [
  [HALF, HALF],
  [HALF, -HALF],
  [-HALF, HALF],
  [-HALF, -HALF],
];

interface Card {
  key: string;
  /** What it points at. */
  at: V3;
  meta: string;
  title: string;
  sub?: string;
  warm?: boolean;
  /** What a click on it opens. */
  pick: Pick;
  /** It reads a root's tip (wherever the root has grown to), or something on the tree above (shown at its size). */
  root?: string;
  lift?: boolean;
  /** Where what it reads is kept, and when it last changed: how the plate knows it. */
  from?: string;
}

/**
 * Ahead as a section through a glass case (see tree.ts): a young tree for where you are, standing in a slab of
 * earth, and under it, lit, a root for every option, through four strata, among circuits on the walls. Drawn
 * through a camera you can turn all the way round, on a plate with the levels, the floor's compass, an axis
 * mark, a title block and a scale, and cards called out from the roots on traces to what they read.
 */
export function AheadTree({
  paths,
  onEditPath,
  onEditState,
  onCompare,
}: {
  paths: StrategicPath[];
  onEditPath(id: string): void;
  onEditState(): void;
  onCompare(): void;
}) {
  const data = useAtlas((s) => s.data);
  const busy = useUI((s) => s.busy);
  const openEntity = useUI((s) => s.openEntity);
  const wide = useIsDesktop();
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const plateRef = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const budsRef = useRef<SVGSVGElement>(null);
  const gizmo = useRef<SVGGElement>(null);
  const levelEls = useRef<(HTMLButtonElement | null)[]>([]);
  const blockRef = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const cropEls = useRef(new Map<string, HTMLCanvasElement>());
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<Pick>(null);
  const [sel, setSel] = useState<Pick>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const nav = data.navigation;
  const state = data.currentState;
  const compact = size.w > 0 && size.w < 640;

  useLayoutEffect(() => {
    const el = plateRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (s.w === Math.round(r.width) && s.h === Math.round(r.height) ? s : { w: Math.round(r.width), h: Math.round(r.height) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSel(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const answers = useMemo(() => new Map(paths.map((p) => [p.id, answersOf(data, p)])), [data, paths]);
  const tree = useMemo(() => growTree(paths, answers, state.constraints, state.assets), [paths, answers, state.constraints, state.assets]);
  const byKey = useMemo(() => new Map(tree.answers.map((a) => [a.key, a])), [tree]);
  const boughByKey = useMemo(() => new Map(tree.boughs.map((b) => [b.key, b])), [tree]);
  const rootById = useMemo(() => new Map(tree.roots.map((l) => [l.pathId, l])), [tree]);
  const pathById = useMemo(() => new Map(paths.map((p) => [p.id, p])), [paths]);
  const counts = (pathId: string, band: Band) => (answers.get(pathId) ?? []).filter((i) => i.band === band).length;
  const total = tree.answers.length;

  const show = hover ?? sel;
  const pick = (p: Pick) => {
    setSel(p);
    setConfirm(null);
  };

  // The cards called out from the roots: what you chose and what wants attention always; what you point at or pick.
  const cards = useMemo(() => {
    const out: Card[] = [];
    const put = (c: Card) => !out.some((o) => o.key === c.key) && out.push(c);
    const updated = (at: string) => t('Updated {date}', { date: formatDate(at) });
    // Where an answer is kept: the reason in Causes, the test, the repeat it opens; or else the option it belongs to.
    const fromOf = (a: TreeAnswer) => {
      const ref = a.ref;
      const claim = ref?.kind === 'claim' ? data.claims[ref.id] : undefined;
      const test = ref?.kind === 'experiment' ? data.experiments[ref.id] : undefined;
      const repeat = ref?.kind === 'pattern' ? data.patterns[ref.id] : undefined;
      if (claim) return `${t('Causes')} · ${updated(claim.updatedAt)}`;
      if (test) return `${experimentCode(test.code)} · ${updated(test.updatedAt)}`;
      if (repeat) return `${t('Repeats')} · ${updated(repeat.updatedAt)}`;
      const p = pathById.get(a.pathId);
      return p ? `${pathCode(p.code)} · ${updated(p.updatedAt)}` : undefined;
    };
    const answerCard = (a: TreeAnswer): Card => ({
      key: a.key,
      at: a.at,
      from: fromOf(a)?.toUpperCase(),
      meta: `${a.index} · ${ROMAN[BANDS.indexOf(a.band)]} ${BAND_LABEL[a.band]()}`.toUpperCase(),
      title: clip(a.text, 64),
      sub: [KIND_LABEL[a.kind](), a.status].filter(Boolean).join(' · ').toUpperCase(),
      warm: a.warn,
      pick: { kind: 'item', key: a.key },
    });
    const rootCard = (id: string): Card | null => {
      const l = rootById.get(id);
      const p = pathById.get(id);
      if (!l || !p) return null;
      const chosen = nav?.pathId === id;
      const step = chosen && nav ? currentAction(nav) : undefined;
      return {
        key: `root:${id}`,
        at: l.tip,
        root: id,
        meta: pathCode(p.code).toUpperCase(),
        title: p.title,
        sub: step ? `${t('Next step')}: ${clip(step.title, 48)}` : BANDS.map((b, i) => `${ROMAN[i]} ${counts(id, b)}`).join(' · '),
        warm: chosen,
        pick: { kind: 'path', id },
        from: (chosen && nav ? `${t('What you chose')} · ${formatDate(nav.committedAt)}` : updated(p.updatedAt)).toUpperCase(),
      };
    };
    if (show?.kind === 'item' && byKey.get(show.key)) put(answerCard(byKey.get(show.key)!));
    if (show?.kind === 'path') {
      const c = rootCard(show.id);
      if (c) put(c);
    }
    if (show?.kind === 'bough' && boughByKey.get(show.key)) {
      const b = boughByKey.get(show.key)!;
      put({
        key: b.key,
        at: b.end,
        lift: true,
        meta: (b.side === 'constraint' ? t('Holds you') : t('Carries you')).toUpperCase(),
        title: clip(b.text, 64),
        pick: { kind: 'bough', key: b.key },
        from: `${t('You are here')} · ${updated(state.updatedAt)}`.toUpperCase(),
      });
    }
    if (nav && rootById.has(nav.pathId)) {
      const c = rootCard(nav.pathId);
      if (c) put(c);
    }
    if (wide) {
      const warm = tree.answers.filter((a) => a.warn).sort((a, b) => Number(b.pathId === nav?.pathId) - Number(a.pathId === nav?.pathId));
      for (const a of warm.slice(0, 2)) put(answerCard(a));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, nav, tree, wide]);

  // What the loop reads, so it never restarts when these change.
  const live = useRef({ show, sel, cards, chosen: nav?.pathId, reduced, compact });
  Object.assign(live.current, { show, sel, cards, chosen: nav?.pathId, reduced, compact });
  const cam = useRef({ yaw: 20, pitch: PITCH, lookX: 0, lookY: 0, drag: null as null | { x: number; y: number; yaw: number; pitch: number; moved: boolean } });
  // How far each root has grown and how grown the tree is, kept across redraws, so what changes grows into place.
  const growth = useRef({ built: false, cut: new Map<string, number>(), grown: 0 });
  const seen = useRef({
    buds: new Map<string, [number, number]>(),
    roots: new Map<string, [number, number][]>(),
    boughs: new Map<string, [number, number]>(),
  });

  // The loop: the camera, the case and what is in it, the furniture that moves with it, the nodes and the cards.
  useEffect(() => {
    const cv = canvas.current;
    if (!cv || !size.w) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(size.w * dpr);
    cv.height = Math.round(size.h * dpr);
    const area = { left: compact ? 0 : MARGIN, right: size.w - (wide ? ROOM : 0) };
    const cx = (area.left + area.right) / 2;
    const span = area.right - area.left;
    // Fitted to the plate: the case, and the turntable in front of it, from straight on and from its corner.
    const R = HALF * 1.58;
    const fit = { top: Infinity, bottom: -Infinity, side: 0 };
    {
      const probe: Camera = { yaw: 0, pitch: PITCH, cx: 0, cy: 0, scale: 1 };
      const box: V3[] = CORNERS.flatMap(([x, z]): V3[] => [
        [x, TOP, z],
        [x, FLOOR, z],
      ]);
      const compass: V3[] = Array.from({ length: 24 }, (_, i): V3 => [Math.cos(i / 3.82) * (R + 2), FLOOR, Math.sin(i / 3.82) * (R + 2)]);
      for (const yaw of [0, 45]) {
        probe.yaw = yaw;
        for (const p of [...box, ...compass]) {
          const y = project(probe, p)[1];
          fit.top = Math.min(fit.top, y);
          fit.bottom = Math.max(fit.bottom, y);
        }
        for (const p of box) fit.side = Math.max(fit.side, Math.abs(project(probe, p)[0]));
      }
    }
    const pad = compact ? 14 : 22;
    const scale = Math.min((size.h - pad * 2) / (fit.bottom - fit.top), (span - 16) / (fit.side * 2));
    // Centred top to bottom when the width is what limits it.
    const cy = Math.max(pad, (size.h - (fit.bottom - fit.top) * scale) / 2) - fit.top * scale;
    const camera: Camera = { yaw: 0, pitch: PITCH, cx, cy, scale };

    const V = tree.verts.length / 3;
    const vx = new Float32Array(V);
    const vy = new Float32Array(V);
    const vz = new Float32Array(V);
    const NL = tree.leaves.length / 3;
    const lx = new Float32Array(NL);
    const ly = new Float32Array(NL);
    const lz = new Float32Array(NL);
    const ND = tree.dirt.length / 3;
    const dx = new Float32Array(ND);
    const dy = new Float32Array(ND);
    const dz = new Float32Array(ND);
    const NC = tree.crumbs.length / 3;
    const crx = new Float32Array(NC);
    const cry = new Float32Array(NC);
    const crz = new Float32Array(NC);
    const S = tree.width.length;
    const binOf = new Uint16Array(S);
    const BINS = WB * AB * 2;
    const bins = new Uint32Array(BINS);
    const start = new Uint32Array(BINS + 1);
    const cursor = new Uint32Array(BINS + 1);
    const order = new Uint32Array(S);
    // The whole tree grows in once, as the page opens; after that, only what changed grows, from where it was.
    const G = growth.current;
    const first = !G.built;
    G.built = true;
    const splitY = tree.taproot[tree.taproot.length - 1][1];
    const rootIds = new Set(tree.roots.map((l) => l.pathId));
    for (const id of [...G.cut.keys()]) if (!rootIds.has(id)) G.cut.delete(id);
    for (const l of tree.roots) if (first || !G.cut.has(l.pathId)) G.cut.set(l.pathId, first ? l.cut : splitY);
    if (first) G.grown = tree.grown;
    const cutOf = (pathId: string) => G.cut.get(pathId) ?? 0;
    const pathOfGroup = new Map([...tree.groups.root].map(([id, g]) => [g, id]));
    // The tree above is drawn grown and shown at its size, about its foot: its wood and its leaves.
    const lifted = new Uint8Array(V);
    for (let s = 0; s < S; s++)
      if (tree.kind[s] === 1) {
        lifted[tree.seg[s * 2]] = 1;
        lifted[tree.seg[s * 2 + 1]] = 1;
      }
    const verts = new Float32Array(tree.verts);
    const leaves = new Float32Array(tree.leaves);
    let shownSize = -1;
    /** Sorts the lines into their bins (counting), so each bin can be drawn as one stroke. */
    const sortBins = (nb: number) => {
      bins.fill(0);
      for (let s = 0; s < S; s++) if (binOf[s] !== NONE) bins[binOf[s]]++;
      start[0] = 0;
      for (let b = 0; b < nb; b++) start[b + 1] = start[b] + bins[b];
      cursor.set(start);
      for (let s = 0; s < S; s++) if (binOf[s] !== NONE) order[cursor[binOf[s]]++] = s;
    };
    const traceBin = (b: number) => {
      ctx.beginPath();
      for (let k = start[b]; k < start[b + 1]; k++) {
        const s = order[k];
        const i = tree.seg[s * 2];
        const j = tree.seg[s * 2 + 1];
        ctx.moveTo(vx[i], vy[i]);
        ctx.lineTo(vx[j], vy[j]);
      }
    };
    // Which roots are drawn warm: some of what you chose, and the rootlets that want attention.
    const warmTwigs = new Set(tree.answers.filter((a) => a.warn).map((a) => tree.groups.twig.get(a.key)!));
    const rootGroup = (g: number) => tree.rootOf.get(g) ?? g;
    const started = first ? performance.now() : -Infinity;
    let last = performance.now();
    let raf = 0;
    let frame = 0;
    const cardPos = new Map<string, { x: number; y: number }>();
    const cardSide = new Map<string, number>();
    const P = (p: V3) => project(camera, p);
    const shape = (pts: V3[], close: boolean) => {
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [x, y] = P(p);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      if (close) ctx.closePath();
    };
    const lineAt = (a: V3, b: V3) => {
      const [ax, ay] = P(a);
      const [bx, by] = P(b);
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
    };
    const edge = (a: V3, b: V3, alpha: number) => {
      ctx.strokeStyle = `rgba(214,230,222,${alpha})`;
      ctx.beginPath();
      lineAt(a, b);
      ctx.stroke();
    };
    const ring = (radius: number, y: number, stepDeg = 4) => {
      ctx.beginPath();
      for (let d = 0; d <= 360; d += stepDeg) {
        const [px, py] = P([Math.cos((d * Math.PI) / 180) * radius, y, Math.sin((d * Math.PI) / 180) * radius]);
        if (d === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    };
    const lamp: V3[] = [
      [-HALF * 0.62, TOP - 0.4, -0.9],
      [HALF * 0.62, TOP - 0.4, -0.9],
      [HALF * 0.62, TOP - 0.4, 0.9],
      [-HALF * 0.62, TOP - 0.4, 0.9],
    ];

    const frameFn = (now: number) => {
      raf = requestAnimationFrame(frameFn);
      const L = live.current;
      const dt = Math.min(64, now - last);
      last = now;
      frame++;
      const c = cam.current;
      // The camera: it turns by itself when nothing is held, faces an option you pick, and leans to the pointer.
      const focusPath = L.sel?.kind === 'path' ? L.sel.id : L.sel?.kind === 'item' ? byKey.get(L.sel.key)?.pathId : undefined;
      if (!c.drag) {
        if (focusPath && rootById.get(focusPath)) c.yaw += turnTo(c.yaw, faceYaw(rootById.get(focusPath)!.bearing)) * Math.min(1, dt / 420);
        else if (!L.reduced && !L.show) c.yaw += (dt / 1000) * (360 / TURN);
      }
      camera.yaw = c.yaw + c.lookX * 6;
      camera.pitch = c.pitch + c.lookY * 2.5;
      const E = eye(camera);
      const facing = (n: V3, p: V3) => n[0] * (E[0] - p[0]) + n[1] * (E[1] - p[1]) + n[2] * (E[2] - p[2]) > 0;
      const wallFront = WALLS.map((w) => facing(w.n, w.a(0)));
      const screenY = (y: number) => P([0, y, 0])[1];

      const age = now - started;
      const building = !L.reduced && age < BUILD_MS;
      const reveal = building ? ease(age / BUILD_MS) : 1;

      // Each root grows toward as far down as its answers reach, the tree toward its size; the tip still growing lit.
      const step = L.reduced ? 1 : Math.min(1, dt / GROW_MS);
      const growing = new Set<string>();
      for (const l of tree.roots) {
        const was = cutOf(l.pathId);
        const next = was + (l.cut - was) * step;
        G.cut.set(l.pathId, Math.abs(l.cut - next) < 0.02 ? l.cut : next);
        if (Math.abs(l.cut - next) >= 0.02) growing.add(l.pathId);
      }
      G.grown = Math.abs(tree.grown - G.grown) < 0.002 ? tree.grown : G.grown + (tree.grown - G.grown) * step;
      const treeSize = sizeOf(G.grown);
      if (treeSize !== shownSize) {
        shownSize = treeSize;
        for (let i = 0; i < V; i++) if (lifted[i]) for (let a = 0; a < 3; a++) verts[i * 3 + a] = tree.verts[i * 3 + a] * treeSize;
        for (let i = 0; i < leaves.length; i++) leaves[i] = tree.leaves[i] * treeSize;
      }
      const lift = (p: V3): V3 => [p[0] * treeSize, p[1] * treeSize, p[2] * treeSize];
      const tipOf = (pathId: string) => atHeight(rootById.get(pathId)!.curve, cutOf(pathId));
      const inLeaf = leafAt(G.grown);

      // What is lit.
      const show = L.show;
      const litRoot =
        show?.kind === 'path' ? tree.groups.root.get(show.id) : show?.kind === 'item' ? tree.groups.root.get(byKey.get(show.key)?.pathId ?? '') : undefined;
      const litTwig = show?.kind === 'item' ? tree.groups.twig.get(show.key) : undefined;
      const litBough = show?.kind === 'bough' ? tree.groups.bough.get(show.key) : undefined;
      const litBand = show?.kind === 'band' ? BANDS.indexOf(show.band) : -1;
      const anything = Boolean(show);
      const chosenRoot = L.chosen ? tree.groups.root.get(L.chosen) : undefined;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1;

      // The floor the case stands on: its tiles, a pool of light under the roots, and the turntable it stands on,
      // graduated so you can see it turn, with no numbers on it, for the way a root runs means nothing.
      ctx.strokeStyle = 'rgba(214,226,220,0.05)';
      ctx.beginPath();
      for (let u = -42; u <= 42; u += 6) {
        lineAt([u, FLOOR, -42], [u, FLOOR, 42]);
        lineAt([-42, FLOOR, u], [42, FLOOR, u]);
      }
      ctx.stroke();
      {
        const [fx, fy] = P([0, FLOOR, 0]);
        const rx = HALF * 1.1 * scale;
        const ry = Math.max(4, rx * Math.sin((Math.max(2, camera.pitch) * Math.PI) / 180));
        const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        glow.addColorStop(0, 'rgba(214,236,226,0.16)');
        glow.addColorStop(1, 'rgba(214,236,226,0)');
        ctx.save();
        ctx.translate(fx, fy);
        ctx.scale(rx, ry);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(236,232,223,0.2)';
      ring(R, FLOOR, 3);
      ctx.stroke();
      for (let d = 0; d < 360; d += 5) {
        const rad = (d * Math.PI) / 180;
        const major = d % 30 === 0;
        const at = (rr: number): V3 => [Math.cos(rad) * rr, FLOOR, Math.sin(rad) * rr];
        const [ax, ay] = P(at(R));
        const [bx, by, bz] = P(at(R + (major ? 1.6 : 0.7)));
        ctx.strokeStyle = `rgba(236,232,223,${bz < 0 ? 0.4 : 0.16})`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }

      // The case's far side: its floor, its walls (lit and misty above the earth, dark below), its ceiling.
      if (!facing([0, -1, 0], [0, FLOOR, 0])) {
        shape(
          WALLS.map((w) => w.a(FLOOR)),
          true,
        );
        ctx.fillStyle = 'rgba(6,8,7,0.62)';
        ctx.fill();
      }
      WALLS.forEach((w, i) => {
        if (wallFront[i]) return;
        shape([w.a(FLOOR), w.b(FLOOR), w.b(-SOIL), w.a(-SOIL)], true);
        const dark = ctx.createLinearGradient(0, screenY(-SOIL), 0, screenY(FLOOR));
        dark.addColorStop(0, 'rgba(22,30,26,0.6)');
        dark.addColorStop(1, 'rgba(6,8,7,0.7)');
        ctx.fillStyle = dark;
        ctx.fill();
        shape([w.a(0), w.b(0), w.b(TOP), w.a(TOP)], true);
        const mist = ctx.createLinearGradient(0, screenY(TOP), 0, screenY(0));
        mist.addColorStop(0, 'rgba(206,222,213,0.5)');
        mist.addColorStop(1, 'rgba(150,168,158,0.2)');
        ctx.fillStyle = mist;
        ctx.fill();
        edge(w.a(FLOOR), w.b(FLOOR), 0.16);
        edge(w.a(TOP), w.b(TOP), 0.2);
      });
      if (!facing([0, 1, 0], [0, TOP, 0])) {
        shape(
          WALLS.map((w) => w.a(TOP)),
          true,
        );
        ctx.fillStyle = 'rgba(206,222,213,0.3)';
        ctx.fill();
      }
      // The lamp's light spilling down the far walls above the earth.
      {
        ctx.save();
        ctx.beginPath();
        WALLS.forEach((w, i) => {
          if (wallFront[i]) return;
          const pts = [w.a(0), w.b(0), w.b(TOP), w.a(TOP)].map(P);
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (const q of pts.slice(1)) ctx.lineTo(q[0], q[1]);
          ctx.closePath();
        });
        ctx.clip();
        const [lx0, ly0] = P([0, TOP, 0]);
        const r0 = HALF * 1.3 * scale;
        const spill = ctx.createRadialGradient(lx0, ly0, 0, lx0, ly0, r0);
        spill.addColorStop(0, 'rgba(236,248,242,0.32)');
        spill.addColorStop(1, 'rgba(236,248,242,0)');
        ctx.fillStyle = spill;
        ctx.fillRect(lx0 - r0, ly0 - r0, r0 * 2, r0 * 2);
        ctx.restore();
      }
      for (const [x, z] of CORNERS) {
        if (!facing([Math.sign(x), 0, 0], [x, 0, z]) && !facing([0, 0, Math.sign(z)], [x, 0, z])) edge([x, FLOOR, z], [x, TOP, z], 0.22);
      }
      // The lamp under its ceiling.
      ctx.save();
      ctx.shadowColor = 'rgba(232,246,238,0.9)';
      ctx.shadowBlur = 28;
      shape(lamp, true);
      ctx.fillStyle = 'rgba(240,250,245,0.92)';
      ctx.fill();
      ctx.restore();

      // What the far walls carry: circuits under the earth. Texture only, so never in the signal colour.
      ctx.globalCompositeOperation = 'lighter';
      const tone = '214,230,222';
      for (const cc of tree.circuits) {
        if (wallFront[cc.wall]) continue;
        if (cc.kind === 'chip') {
          shape(cc.pts, true);
          ctx.fillStyle = `rgba(${tone},0.05)`;
          ctx.fill();
          ctx.strokeStyle = `rgba(${tone},0.22)`;
          ctx.stroke();
        } else if (cc.kind === 'bar') {
          ctx.strokeStyle = `rgba(${tone},0.24)`;
          ctx.beginPath();
          for (let i = 0; i < cc.pts.length; i += 2) lineAt(cc.pts[i], cc.pts[i + 1]);
          ctx.stroke();
        } else if (cc.kind === 'via') {
          const [px, py] = P(cc.pts[0]);
          ctx.fillStyle = `rgba(${tone},0.4)`;
          ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
        } else {
          ctx.strokeStyle = `rgba(${tone},0.13)`;
          shape(cc.pts, false);
          ctx.stroke();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      // The strata: a line round the case at each, on its far walls here and its near walls later; lit when you
      // compare on it.
      const strata = (front: boolean) => {
        LEVELS.forEach((y, b) => {
          ctx.setLineDash([4, 5]);
          ctx.strokeStyle = litBand === b ? 'rgba(255,90,31,0.85)' : `rgba(214,230,222,${anything && litBand !== b ? 0.08 : front ? 0.2 : 0.14})`;
          ctx.beginPath();
          WALLS.forEach((w, i) => {
            if (wallFront[i] === front) lineAt(w.a(y), w.b(y));
          });
          ctx.stroke();
          ctx.setLineDash([]);
        });
      };
      strata(false);

      // Crumbs on the case's floor.
      projectAll(camera, tree.crumbs, crx, cry, crz);
      ctx.fillStyle = 'rgba(150,160,150,0.4)';
      for (let i = 0; i < NC; i++) ctx.fillRect(crx[i] - 0.7, cry[i] - 0.5, 1.4, 1);

      // The roots, lit: in bins, a wide faint glow, the line itself, white or warm, and a hot core in the thickest.
      projectAll(camera, verts, vx, vy, vz);
      for (let s = 0; s < S; s++) {
        binOf[s] = NONE;
        if (tree.kind[s] !== 0 || tree.grow[s] > reveal) continue;
        const g = tree.group[s];
        const rg = rootGroup(g);
        // Only as far down as its root has grown.
        const pid = pathOfGroup.get(rg);
        const cut = pid === undefined ? -Infinity : cutOf(pid);
        if (tree.origin[s] < cut - 0.01) continue;
        const i = tree.seg[s * 2];
        const j = tree.seg[s * 2 + 1];
        const z = (vz[i] + vz[j]) / 2;
        let a = 0.88 * Math.max(0.3, Math.min(1, 0.66 - z / 64));
        if (anything) {
          if (litTwig !== undefined) a *= g === litTwig ? 2.2 : rg === litRoot ? 1 : 0.32;
          else if (litRoot !== undefined) a *= rg === litRoot ? 1.5 : 0.3;
          else if (litBand >= 0) {
            const y = (tree.verts[i * 3 + 1] + tree.verts[j * 3 + 1]) / 2;
            a *= Math.abs(y - LEVELS[litBand]) < 2.6 ? 1.7 : 0.4;
          } else a *= 0.6;
        }
        const grow = tree.grow[s];
        if (building && reveal - grow < 0.025) a *= 2.2;
        if (pid !== undefined && growing.has(pid) && tree.origin[s] - cut < 1.8) a *= 2.2;
        a = Math.min(1, a);
        const wb = widthBin(tree.width[s] * scale * (DISTANCE / (DISTANCE + z)));
        const ab = Math.min(AB - 1, Math.floor(a * AB));
        const warm = warmTwigs.has(g) || (chosenRoot !== undefined && rg === chosenRoot && (s * 7) % 10 < 4) ? 1 : 0;
        binOf[s] = (warm * WB + wb) * AB + ab;
      }
      sortBins(BINS);
      ctx.globalCompositeOperation = 'lighter';
      for (const pass of ['glow', 'core', 'hot'] as const) {
        for (let b = 0; b < BINS; b++) {
          if (start[b + 1] === start[b]) continue;
          const ab = b % AB;
          const wb = Math.floor(b / AB) % WB;
          if (pass === 'hot' && wb < 7) continue;
          const alpha = (ab + 1) / AB;
          const w = binWidth(wb);
          const tone = b >= WB * AB ? '255,128,70' : '228,240,234';
          if (pass === 'glow') {
            ctx.lineWidth = w * 2.4 + 2.5;
            ctx.strokeStyle = `rgba(${tone},${(alpha * 0.11).toFixed(3)})`;
          } else if (pass === 'core') {
            ctx.lineWidth = w;
            ctx.strokeStyle = `rgba(${tone},${alpha.toFixed(3)})`;
          } else {
            ctx.lineWidth = w * 0.35;
            ctx.strokeStyle = `rgba(255,255,255,${(alpha * 0.9).toFixed(3)})`;
          }
          traceBin(b);
          ctx.stroke();
        }
      }
      // Sap: light running down the taproot and out along what you chose.
      if (chosenRoot !== undefined && !L.reduced && L.chosen && !building) {
        const root = rootById.get(L.chosen);
        if (root) {
          const route = [...tree.taproot, ...root.curve.filter((p) => p[1] >= cutOf(root.pathId))];
          ctx.fillStyle = 'rgba(255,150,100,0.95)';
          for (let k = 0; k < 5; k++) {
            const f = ((now / 3600 + k / 5) % 1) * (route.length - 1);
            const a = route[Math.floor(f)];
            const b = route[Math.min(route.length - 1, Math.floor(f) + 1)];
            const p: V3 = [a[0] + (b[0] - a[0]) * (f % 1), a[1] + (b[1] - a[1]) * (f % 1), a[2] + (b[2] - a[2]) * (f % 1)];
            const [px, py] = P(p);
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 1;

      // The slab of earth: whichever of its faces you see, dark, with its grain; a line of light along its edges.
      const slab = [
        { n: [0, 1, 0] as V3, pts: WALLS.map((w) => w.a(0)) },
        { n: [0, -1, 0] as V3, pts: WALLS.map((w) => w.a(-SOIL)) },
        ...WALLS.map((w) => ({ n: w.n, pts: [w.a(0), w.b(0), w.b(-SOIL), w.a(-SOIL)] })),
      ];
      const slabFront = slab.map((f) => facing(f.n, f.pts[0]));
      slab.forEach((f, i) => {
        if (!slabFront[i]) return;
        shape(f.pts, true);
        if (i >= 2) {
          const side = ctx.createLinearGradient(0, screenY(0), 0, screenY(-SOIL));
          side.addColorStop(0, 'rgba(34,31,26,0.98)');
          side.addColorStop(1, 'rgba(12,12,11,0.98)');
          ctx.fillStyle = side;
        } else ctx.fillStyle = i === 0 ? 'rgba(26,25,21,0.98)' : 'rgba(10,10,9,0.98)';
        ctx.fill();
      });
      projectAll(camera, tree.dirt, dx, dy, dz);
      for (let i = 0; i < ND; i++) {
        const f = tree.dirtFace[i];
        if (!slabFront[f === 0 ? 0 : f + 1]) continue;
        ctx.fillStyle = i % 3 ? 'rgba(150,140,120,0.22)' : 'rgba(4,4,4,0.5)';
        ctx.fillRect(dx[i] - 0.6, dy[i] - 0.6, 1.3, 1.3);
      }
      ctx.strokeStyle = 'rgba(214,230,222,0.28)';
      ctx.beginPath();
      WALLS.forEach((w, i) => {
        if (slabFront[i + 2]) {
          lineAt(w.a(0), w.b(0));
          lineAt(w.a(-SOIL), w.b(-SOIL));
        }
      });
      ctx.stroke();

      // The tree above, dark against the light: its wood and grass, then its leaves. What you point at, warm.
      for (let s = 0; s < S; s++) {
        binOf[s] = NONE;
        if (tree.kind[s] === 0 || tree.grow[s] > reveal) continue;
        const i = tree.seg[s * 2];
        const j = tree.seg[s * 2 + 1];
        const z = (vz[i] + vz[j]) / 2;
        const wb = widthBin(tree.width[s] * scale * (DISTANCE / (DISTANCE + z)));
        const fog = z > 8 ? 0 : z > -8 ? 1 : 2;
        const lit = litBough !== undefined && tree.group[s] === litBough ? 1 : 0;
        binOf[s] = (lit * WB + wb) * 3 + fog;
      }
      sortBins(WB * 3 * 2);
      for (let b = 0; b < WB * 3 * 2; b++) {
        if (start[b + 1] === start[b]) continue;
        const fog = b % 3;
        ctx.lineWidth = binWidth(Math.floor(b / 3) % WB);
        ctx.strokeStyle = b >= WB * 3 ? 'rgba(255,100,40,0.95)' : `rgba(12,15,13,${[0.55, 0.75, 0.92][fog]})`;
        traceBin(b);
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      projectAll(camera, leaves, lx, ly, lz);
      for (let i = 0; i < NL; i++) {
        if (tree.leafGrow[i] > reveal || tree.leafNeed[i] > inLeaf) continue;
        const lit = litBough !== undefined && tree.leafGroup[i] === litBough;
        ctx.fillStyle = lit ? 'rgba(255,110,50,0.9)' : `rgba(10,13,11,${lz[i] > 8 ? 0.6 : 0.92})`;
        const s = lz[i] < 0 ? 2.6 : 2;
        ctx.fillRect(lx[i] - s / 2, ly[i] - s / 2, s, s);
      }

      // The case's near side: its glass catching a little light, its edges, and the strata on it.
      WALLS.forEach((w, i) => {
        if (!wallFront[i]) return;
        shape([w.a(FLOOR), w.b(FLOOR), w.b(TOP), w.a(TOP)], true);
        const [gx0, gy0] = P(w.a(TOP));
        const [gx1, gy1] = P(w.b(FLOOR));
        const sheen = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
        sheen.addColorStop(0, 'rgba(220,236,228,0.05)');
        sheen.addColorStop(0.5, 'rgba(220,236,228,0)');
        sheen.addColorStop(1, 'rgba(220,236,228,0.025)');
        ctx.fillStyle = sheen;
        ctx.fill();
        edge(w.a(FLOOR), w.b(FLOOR), 0.32);
        edge(w.a(TOP), w.b(TOP), 0.36);
      });
      for (const [x, z] of CORNERS) {
        const f1 = facing([Math.sign(x), 0, 0], [x, 0, z]);
        const f2 = facing([0, 0, Math.sign(z)], [x, 0, z]);
        if (f1 || f2) edge([x, FLOOR, z], [x, TOP, z], f1 && f2 ? 0.5 : 0.34);
      }
      strata(true);

      // Each root's letter below its tip; the end of the bough you point at or open: what holds you a bar across it
      // (the atlas's mark for what limits), what carries you a ring.
      const seenRoots = seen.current.roots;
      ctx.textAlign = 'center';
      ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      for (const l of tree.roots) {
        const cut = cutOf(l.pathId);
        seenRoots.set(
          l.pathId,
          l.curve
            .filter((p, i) => i % 2 === 0 && p[1] >= cut)
            .map((p) => {
              const [px, py] = P(p);
              return [px, py];
            }),
        );
        if (reveal < 0.98) continue;
        const [px, py] = P(tipOf(l.pathId));
        const chosen = L.chosen === l.pathId;
        ctx.strokeStyle = chosen ? 'rgba(255,90,31,0.95)' : 'rgba(228,240,234,0.65)';
        ctx.fillStyle = 'rgba(7,8,10,0.9)';
        ctx.beginPath();
        ctx.arc(px, py + 14, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = chosen ? 'rgb(255,120,70)' : 'rgba(228,240,234,0.95)';
        ctx.fillText(l.code, px, py + 17.5);
      }
      const seenBoughs = seen.current.boughs;
      ctx.lineWidth = 1.3;
      for (const b of tree.boughs) {
        const [px, py] = P(lift(b.end));
        seenBoughs.set(b.key, [px, py]);
        // Its mark only on the bough you point at or open: at rest the tree is only a tree in leaf.
        const lit = litBough === tree.groups.bough.get(b.key);
        if (reveal < 0.9 || !lit) continue;
        ctx.strokeStyle = 'rgba(255,90,31,0.95)';
        ctx.beginPath();
        if (b.side === 'constraint') {
          const [qx, qy] = P(lift(b.curve[b.curve.length - 2]));
          const l = Math.hypot(px - qx, py - qy) || 1;
          const [nx, ny] = [-(py - qy) / l, (px - qx) / l];
          ctx.moveTo(px - nx * 5, py - ny * 5);
          ctx.lineTo(px + nx * 5, py + ny * 5);
        } else ctx.arc(px, py, 3.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.lineWidth = 1;

      // The nodes: each answer's mark where its rootlet ends.
      const seenBuds = seen.current.buds;
      const buds = budsRef.current;
      if (buds) {
        for (const a of tree.answers) {
          const el = buds.querySelector<SVGGElement>(`[data-bud="${CSS.escape(a.key)}"]`);
          const [px, py, z] = P(a.at);
          // Out once its root has grown down to it.
          const grown = a.from[1] >= cutOf(a.pathId) - 0.01;
          if (grown) seenBuds.set(a.key, [px, py]);
          else seenBuds.delete(a.key);
          if (!el) continue;
          el.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
          el.style.opacity = reveal < 0.97 || !grown ? '0' : String(Math.max(0.35, Math.min(1, 0.9 - z / 50)));
        }
      }

      // The levels at the side, each with a datum out to the case.
      const datum = (y: number, el: HTMLElement | null | undefined, lit: boolean) => {
        let x0 = Infinity;
        let y0 = 0;
        for (const w of WALLS) {
          const [px, py] = P(w.a(y));
          if (px < x0) [x0, y0] = [px, py];
        }
        if (el) el.style.transform = `translateY(${(y0 - 9).toFixed(1)}px)`;
        ctx.strokeStyle = lit ? 'rgba(255,90,31,0.6)' : 'rgba(236,232,223,0.13)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(compact ? 34 : MARGIN - 6, y0);
        ctx.lineTo(x0 - 6, y0);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      LEVELS.forEach((y, b) => datum(y, levelEls.current[b], litBand === b));
      datum(0, levelEls.current[4], false);

      // The axis mark, turning with the camera.
      const g = gizmo.current;
      if (g) {
        const axes: [string, V3][] = [
          ['x', [1, 0, 0]],
          ['y', [0, 1, 0]],
          ['z', [0, 0, 1]],
        ];
        for (const [name, v] of axes) {
          const yaw = (camera.yaw * Math.PI) / 180;
          const pitch = (camera.pitch * Math.PI) / 180;
          const x1 = v[0] * Math.cos(yaw) - v[2] * Math.sin(yaw);
          const z1 = v[0] * Math.sin(yaw) + v[2] * Math.cos(yaw);
          const y2 = v[1] * Math.cos(pitch) + z1 * Math.sin(pitch);
          const line = g.querySelector<SVGLineElement>(`[data-axis="${name}"]`);
          const label = g.querySelector<SVGTextElement>(`[data-axis-label="${name}"]`);
          line?.setAttribute('x2', (x1 * 16).toFixed(1));
          line?.setAttribute('y2', (-y2 * 16).toFixed(1));
          label?.setAttribute('x', (x1 * 23).toFixed(1));
          label?.setAttribute('y', (-y2 * 23 + 3).toFixed(1));
        }
      }

      // The cards: each in a column beside the case, as near level with what it reads as they allow, and a trace
      // out to it, turning square as on a board. Each shows the plate close up round what it reads.
      const under = (el: HTMLElement | null) => (el && el.offsetParent ? el.offsetTop + el.offsetHeight + 12 : 16);
      const top = { [-1]: under(blockRef.current), [1]: L.compact ? under(blockRef.current) : 16 } as Record<number, number>;
      const placed: { key: string; el: HTMLDivElement; ax: number; ay: number; side: number; w: number; h: number; y: number }[] = [];
      for (const card of L.cards) {
        const el = cardEls.current.get(card.key);
        if (!el) continue;
        const [ax, ay] = P(card.root && rootById.has(card.root) ? tipOf(card.root) : card.lift ? lift(card.at) : card.at);
        const was = cardSide.get(card.key);
        // On a phone the levels take the left, so every card goes right.
        const side = L.compact ? 1 : was && Math.abs(ax - cx) < 36 ? was : ax < cx ? -1 : 1;
        placed.push({ key: card.key, el, ax, ay, side, w: el.offsetWidth, h: el.offsetHeight, y: 0 });
      }
      // A column with more than it can hold gives the card nearest the middle to the other.
      const height = (side: number) => placed.filter((p) => p.side === side).reduce((n, p) => n + p.h + 10, 0);
      if (!L.compact)
        for (const side of [-1, 1]) {
          const room = (sd: number) => size.h - 16 - top[sd];
          while (height(side) > room(side)) {
            const move = placed.filter((p) => p.side === side).sort((a, b) => Math.abs(a.ax - cx) - Math.abs(b.ax - cx))[0];
            if (!move || height(-side) + move.h + 10 > room(-side)) break;
            move.side = -side;
          }
        }
      for (const p of placed) cardSide.set(p.key, p.side);
      const leaders: { ax: number; ay: number; ex: number; ey: number; side: number; warm?: boolean }[] = [];
      for (const side of [-1, 1]) {
        const column = placed.filter((p) => p.side === side).sort((a, b) => a.ay - b.ay);
        // Down from the top, each level with what it reads where it can be; then up from the bottom, so none falls off.
        let floor = top[side];
        for (const p of column) {
          p.y = Math.max(floor, p.ay - p.h / 2);
          floor = p.y + p.h + 10;
        }
        let ceiling = size.h - 16;
        for (let j = column.length - 1; j >= 0; j--) {
          column[j].y = Math.min(column[j].y, ceiling - column[j].h);
          ceiling = column[j].y - 10;
        }
        for (const p of column) {
          const { el, w } = p;
          const x = L.compact ? size.w - w - 8 : side < 0 ? area.left + 8 : area.right - w - 14;
          const prev = cardPos.get(p.key) ?? { x, y: p.y };
          const pos = { x: prev.x + (x - prev.x) * 0.25, y: prev.y + (p.y - prev.y) * 0.25 };
          cardPos.set(p.key, pos);
          el.style.transform = `translate(${pos.x.toFixed(1)}px, ${pos.y.toFixed(1)}px)`;
          const warm = L.cards.find((c) => c.key === p.key)?.warm;
          leaders.push({ ax: p.ax, ay: p.ay, ex: side < 0 ? pos.x + w : pos.x, ey: pos.y + 14, side, warm });
          // Close up: the plate round it, larger, every other frame, before any trace is drawn over it.
          const crop = cropEls.current.get(p.key);
          if (crop && (frame + p.key.length) % 2 === 0) {
            const cc = crop.getContext('2d');
            if (cc) {
              const cw = crop.width / CROP_DPR;
              const ch = crop.height / CROP_DPR;
              cc.setTransform(CROP_DPR, 0, 0, CROP_DPR, 0, 0);
              cc.fillStyle = '#050607';
              cc.fillRect(0, 0, cw, ch);
              const sw = cw / ZOOM;
              const sh = ch / ZOOM;
              cc.imageSmoothingQuality = 'high';
              cc.drawImage(cv, (p.ax - sw / 2) * dpr, (p.ay - sh / 2) * dpr, sw * dpr, sh * dpr, 0, 0, cw, ch);
              cc.strokeStyle = warm ? 'rgba(255,90,31,0.9)' : 'rgba(236,232,223,0.75)';
              cc.lineWidth = 1;
              cc.beginPath();
              for (const [sx, sy] of [
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
              ]) {
                cc.moveTo(cw / 2 + sx * 8, ch / 2 + sy * 3);
                cc.lineTo(cw / 2 + sx * 8, ch / 2 + sy * 8);
                cc.lineTo(cw / 2 + sx * 3, ch / 2 + sy * 8);
              }
              cc.stroke();
              cc.fillStyle = 'rgba(236,232,223,0.6)';
              cc.font = '500 8px "IBM Plex Mono", ui-monospace, monospace';
              cc.textAlign = 'left';
              cc.fillText(`DETAIL ×${ZOOM}`, 5, ch - 5);
            }
          }
        }
      }
      // The traces: out of what it reads level, then square up or down, then into the card; a pad at each end.
      for (const l of leaders) {
        const bend = l.ex - l.side * 18;
        ctx.strokeStyle = l.warm ? 'rgba(255,90,31,0.75)' : 'rgba(228,240,234,0.55)';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(l.ax, l.ay);
        ctx.lineTo(bend, l.ay);
        ctx.lineTo(bend, l.ey);
        ctx.lineTo(l.ex, l.ey);
        ctx.stroke();
        ctx.fillRect(l.ax - 2.5, l.ay - 2.5, 5, 5);
        ctx.fillRect(bend - 1.5, l.ay - 1.5, 3, 3);
        ctx.beginPath();
        ctx.arc(l.ex, l.ey, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const key of [...cardPos.keys()])
        if (!L.cards.some((c) => c.key === key)) {
          cardPos.delete(key);
          cardSide.delete(key);
        }
    };
    raf = requestAnimationFrame(frameFn);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tree, size, wide, compact]);

  // Pointing, dragging to turn, and picking.
  const nearest = (x: number, y: number): Pick => {
    let best: Pick = null;
    let bestD = 13;
    for (const [key, [px, py]] of seen.current.buds) {
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) [best, bestD] = [{ kind: 'item', key }, d];
    }
    if (best) return best;
    bestD = 12;
    for (const [key, [px, py]] of seen.current.boughs) {
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) [best, bestD] = [{ kind: 'bough', key }, d];
    }
    if (best) return best;
    bestD = 11;
    for (const [id, pts] of seen.current.roots) {
      for (const [px, py] of pts) {
        const d = Math.hypot(px - x, py - y);
        if (d < bestD) [best, bestD] = [{ kind: 'path', id }, d];
      }
    }
    return best;
  };
  const local = (e: React.PointerEvent) => {
    const r = plateRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };

  const chosen = nav ? data.paths[nav.pathId] : undefined;
  const step = nav ? currentAction(nav) : undefined;
  const bough = sel?.kind === 'bough' ? boughByKey.get(sel.key) : undefined;

  return (
    <div className="ahead-stage">
      <div
        ref={plateRef}
        className={cn('ahead-plate tree-plate', hover && 'is-pointing')}
        role="group"
        aria-label={t('Your options as roots growing from where you are')}
        onPointerDown={(e) => {
          if ((e.target as Element).closest('button, .tree-card')) return;
          const c = cam.current;
          c.drag = { x: e.clientX, y: e.clientY, yaw: c.yaw, pitch: c.pitch, moved: false };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const c = cam.current;
          const r = plateRef.current!.getBoundingClientRect();
          c.lookX = ((e.clientX - r.left) / r.width - 0.5) * 2;
          c.lookY = ((e.clientY - r.top) / r.height - 0.5) * 2;
          if (c.drag) {
            const dx = e.clientX - c.drag.x;
            const dy = e.clientY - c.drag.y;
            if (Math.hypot(dx, dy) > 4) c.drag.moved = true;
            c.yaw = c.drag.yaw - dx * 0.35;
            c.pitch = Math.max(0, Math.min(24, c.drag.pitch + dy * 0.1));
            return;
          }
          if ((e.target as Element).closest('button, .tree-card')) return;
          const [x, y] = local(e);
          const next = nearest(x, y);
          setHover((h) => (same(h, next) ? h : next));
        }}
        onPointerUp={(e) => {
          const c = cam.current;
          const drag = c.drag;
          c.drag = null;
          if (!drag || drag.moved) return;
          const [x, y] = local(e);
          pick(nearest(x, y));
        }}
        onPointerCancel={() => {
          cam.current.drag = null;
        }}
        onPointerLeave={() => {
          cam.current.lookX = cam.current.lookY = 0;
          setHover(null);
        }}
      >
        <canvas ref={canvas} className="tree-canvas" />

        {/* The nodes: a mark for each answer, kept where its rootlet ends. */}
        <svg ref={budsRef} className="tree-buds" width={size.w} height={size.h} aria-hidden>
          {tree.answers.map((a) => (
            <g
              key={a.key}
              data-bud={a.key}
              className={cn('tree-bud', a.warn && 'is-warn', show?.kind === 'item' && show.key === a.key && 'is-lit', a.pathId === nav?.pathId && 'is-chosen')}
            >
              <circle r={8} className="tree-bud-halo" />
              <Glyph kind={a.kind} item={a} size={0.95} />
            </g>
          ))}
        </svg>

        {/* The plate's title block, as on a drawing: what it is and what is on it. No measurements: nothing here is one. */}
        <div ref={blockRef} className="tree-block" aria-hidden>
          <div className="tree-block-main">
            <div className="tree-block-row is-head">{t('Plate · Ahead').toUpperCase()}</div>
            <div className="tree-block-row is-sub">{t('What could grow from here · a section').toUpperCase()}</div>
            {wide && (
              <>
                <div className="tree-block-row">{t('{n} options · {m} answers · not ranked', { n: paths.length, m: total }).toUpperCase()}</div>
                <div className="tree-block-row is-dim">{t('Drag to turn it').toUpperCase()}</div>
              </>
            )}
          </div>
        </div>
        {/* The axis mark, in the plate's corner. */}
        {wide && (
          <svg className="tree-gizmo" width={64} height={64} viewBox="-32 -32 64 64" aria-hidden>
            <circle r={27} className="tree-gizmo-ring" />
            <g ref={gizmo}>
              <circle r={1.8} />
              {(['x', 'y', 'z'] as const).map((a) => (
                <g key={a}>
                  <line data-axis={a} x1={0} y1={0} x2={0} y2={0} className={`is-${a}`} />
                  <text data-axis-label={a} textAnchor="middle">
                    {a.toUpperCase()}
                  </text>
                </g>
              ))}
            </g>
          </svg>
        )}
        {/* Registration marks at the plate's corners. */}
        <div className="tree-register" aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="tree-levels">
          {[...BANDS.map((b, i) => ({ band: b as Band | null, i })), { band: null, i: 4 }].map(({ band, i }) => (
            <button
              key={i}
              type="button"
              ref={(el) => {
                levelEls.current[i] = el;
              }}
              className={cn('tree-level', band && show?.kind === 'band' && show.band === band && 'is-lit', !band && 'is-ground')}
              onPointerEnter={() => setHover(band ? { kind: 'band', band } : null)}
              onPointerLeave={() => setHover(null)}
              onClick={() => pick(band ? (sel?.kind === 'band' && sel.band === band ? null : { kind: 'band', band }) : null)}
            >
              <svg width={10} height={8} viewBox="0 0 10 8" aria-hidden>
                <path d="M0 0H10L5 8Z" />
              </svg>
              <span className="tree-level-num">{band ? ROMAN[i] : '—'}</span>
              {!compact && <span className="tree-level-name">{band ? BAND_LABEL[band]() : t('You are here')}</span>}
            </button>
          ))}
        </div>

        {/* The cards called out from the roots. */}
        {cards.map((c) => (
          <div
            key={c.key}
            ref={(el) => {
              if (el) cardEls.current.set(c.key, el);
              else cardEls.current.delete(c.key);
            }}
            className={cn('tree-card', c.warm && 'is-warm')}
            onClick={() => pick(c.pick)}
          >
            {wide && (
              <canvas
                width={194 * CROP_DPR}
                height={84 * CROP_DPR}
                className="tree-card-crop"
                ref={(el) => {
                  if (el) cropEls.current.set(c.key, el);
                  else cropEls.current.delete(c.key);
                }}
              />
            )}
            <div className="tree-card-meta">{c.meta}</div>
            <div className="tree-card-title">{c.title}</div>
            {c.sub && <div className="tree-card-sub">{c.sub}</div>}
            {c.from && <div className="tree-card-at">{c.from}</div>}
          </div>
        ))}
      </div>

      {/* Every answer, for a screen reader or a keyboard. */}
      <ul className="sr-only">
        {tree.answers.map((a) => (
          <li key={a.key}>
            <button type="button" onClick={() => pick({ kind: 'item', key: a.key })}>
              {a.index} · {KIND_LABEL[a.kind]()}: {a.text}
            </button>
          </li>
        ))}
      </ul>
      {/* The side: the options as a legend, then the reading panel. */}
      <div className="ahead-side">
        {/* The options, as a list too: to pick one with a key, and on a phone. */}
        <div className="ahead-options">
          {paths.map((p) => (
            <button
              key={p.id}
              type="button"
              onPointerEnter={() => setHover({ kind: 'path', id: p.id })}
              onPointerLeave={() => setHover(null)}
              onClick={() => pick({ kind: 'path', id: p.id })}
              className={cn('ahead-option', nav?.pathId === p.id && 'is-chosen', sel?.kind === 'path' && sel.id === p.id && 'is-on')}
            >
              <span className="ahead-option-letter">{p.code}</span>
              <span className="truncate">{p.title}</span>
            </button>
          ))}
        </div>
        {/* The reading panel: what is picked, or where you are. */}
        <aside className="ahead-panel" aria-live="polite">
          {sel?.kind === 'item' && byKey.get(sel.key) ? (
            <ItemPanel
              item={byKey.get(sel.key)!}
              path={pathById.get(byKey.get(sel.key)!.pathId)!}
              onPath={(pid) => pick({ kind: 'path', id: pid })}
              onEditPath={onEditPath}
              onOpen={(ref) => openEntity(ref)}
            />
          ) : sel?.kind === 'path' && pathById.get(sel.id) ? (
            <PathPanel
              path={pathById.get(sel.id)!}
              chosen={nav?.pathId === sel.id}
              since={nav?.pathId === sel.id ? nav.committedAt : undefined}
              counts={(b) => counts(sel.id, b)}
              gaps={(answers.get(sel.id) ?? []).filter((i) => i.warn).length}
              confirming={confirm === sel.id}
              busy={busy[`commit:${sel.id}`]}
              hasPlan={Boolean(nav)}
              onConfirm={() => setConfirm(sel.id)}
              onCancel={() => setConfirm(null)}
              onChoose={async () => {
                await commitDirection(sel.id);
                setConfirm(null);
                navigate('navigation');
              }}
              onEdit={() => onEditPath(sel.id)}
              onCompare={onCompare}
            />
          ) : bough ? (
            <Section label={bough.side === 'constraint' ? t('Holds you · a constraint') : t('Carries you · an asset')}>
              <p className="mt-2 text-[14px] leading-snug text-ink">{bough.text}</p>
              <div className="mt-4 flex gap-1.5">
                <Button size="sm" icon={Pencil} onClick={onEditState}>
                  {t('Edit where you are')}
                </Button>
              </div>
            </Section>
          ) : sel?.kind === 'band' ? (
            <BandPanel band={sel.band} paths={paths} counts={counts} onPath={(pid) => pick({ kind: 'path', id: pid })} />
          ) : (
            <Section label={t('You are here')}>
              <p className="display mt-1.5 text-[17px] leading-[1.2] text-ink">{state.position || t('Where are you starting from?')}</p>
              {state.summary && <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-ink-2">{state.summary}</p>}
              {chosen && (
                <div className="mt-3 border-t border-line pt-3">
                  <div className="label">{t('What you chose')}</div>
                  <button
                    type="button"
                    className="tap mt-1 text-left text-[13px] text-ink hover:underline"
                    onClick={() => pick({ kind: 'path', id: chosen.id })}
                  >
                    {pathCode(chosen.code)} · {chosen.title}
                  </button>
                  {step && (
                    <p className="mt-1 text-[12px] text-ink-3">
                      {t('Next step')}: <span className="text-ink-2">{step.title}</span>
                    </p>
                  )}
                  {nav?.committedAt && <p className="mt-1 font-mono text-[10.5px] text-ink-3">{formatDate(nav.committedAt)}</p>}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {nav && (
                  <Button size="sm" variant="primary" icon={ArrowRight} onClick={() => navigate('navigation')}>
                    {t('Open the plan')}
                  </Button>
                )}
                <Button size="sm" variant="ghost" icon={Pencil} onClick={onEditState}>
                  {t('Edit where you are')}
                </Button>
              </div>
              <p className="label-sm mt-4 leading-relaxed text-ink-3">
                {t('Drag to turn it · point at a root to read its option · at a level to compare them · click a node to open it')}
              </p>
            </Section>
          )}
        </aside>
        {/* The key. */}
        <div className="ahead-key" aria-hidden>
          <div className="label mb-1.5">{t('Key')}</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {KEY.map((k, i) => (
              <div key={i} className="flex items-center gap-2">
                <svg width={14} height={14} viewBox="-7 -7 14 14" className="ahead-key-glyph shrink-0 overflow-visible">
                  <Glyph kind={k.kind} item={k.item} size={0.9} />
                </svg>
                <span className="min-w-0 leading-snug">{k.label()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
