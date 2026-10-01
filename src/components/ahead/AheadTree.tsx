import { ArrowRight, Pencil } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { navigate } from '../../app/router';
import { currentAction, pathCode } from '../../domain/selectors';
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
import { CROWN_Y, DISTANCE, faceYaw, GROUND_R, growTree, LEVELS, project, projectAll, type Camera, type Tree, type TreeAnswer, type V3 } from './tree';

type Pick = { kind: 'path'; id: string } | { kind: 'item'; key: string } | { kind: 'root'; key: string } | { kind: 'band'; band: Band } | null;
const same = (a: Pick, b: Pick) => JSON.stringify(a) === JSON.stringify(b);

/** The reading panel's width on a wide screen, kept clear of the plate. */
const ROOM = 372;
/** Room on the plate's left for the level marks. */
const MARGIN = 112;
/** The camera at rest: looking a little down on the tree. */
const PITCH = 14;
/** Once round in this many seconds, when nothing is held. */
const TURN = 150;
/** The scan builds the tree up from the ground over this long, and passes over it again every so often. */
const BUILD_MS = 2600;
const PASS_EVERY = 16000;
const PASS_MS = 3200;
const ROMAN = ['I', 'II', 'III', 'IV'];
/** The close-ups on the cards: drawn this much sharper than their size, and this much nearer than the plate. */
const CROP_DPR = typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1);
const ZOOM = 2.4;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const bearingOf = (deg: number) => Math.round((((deg + 90) % 360) + 360) % 360);
const ease = (x: number) => 1 - (1 - x) ** 3;
/** The shortest way round from one angle to another, in degrees. */
const turnTo = (from: number, to: number) => ((((to - from) % 360) + 540) % 360) - 180;

interface Card {
  key: string;
  /** What it points at, in the tree. */
  at: V3;
  meta: string;
  title: string;
  sub?: string;
  warm?: boolean;
  /** What a click on it opens. */
  pick: Pick;
}

/**
 * Ahead as a world tree, scanned (see tree.ts), on a plate drawn like an
 * architect's: the scan as points through a camera you can turn, its four
 * sections and their levels, the ground's compass, an axis mark, a title
 * block and a scale, and cards called out from the tree to what they read.
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
  const readout = useRef<HTMLSpanElement>(null);
  const scaleBar = useRef<HTMLDivElement>(null);
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
  const rootByKey = useMemo(() => new Map(tree.roots.map((r) => [r.key, r])), [tree]);
  const limbById = useMemo(() => new Map(tree.limbs.map((l) => [l.pathId, l])), [tree]);
  const pathById = useMemo(() => new Map(paths.map((p) => [p.id, p])), [paths]);
  const counts = (pathId: string, band: Band) => (answers.get(pathId) ?? []).filter((i) => i.band === band).length;
  const total = tree.answers.length;

  const show = hover ?? sel;
  const pick = (p: Pick) => {
    setSel(p);
    setConfirm(null);
  };

  // The cards called out from the tree: what you chose and what wants attention always; what you point at or pick.
  const cards = useMemo(() => {
    const out: Card[] = [];
    const put = (c: Card) => !out.some((o) => o.key === c.key) && out.push(c);
    const answerCard = (a: TreeAnswer): Card => ({
      key: a.key,
      at: a.at,
      meta: `${a.index} · ${ROMAN[BANDS.indexOf(a.band)]} ${BAND_LABEL[a.band]()}`.toUpperCase(),
      title: clip(a.text, 64),
      sub: [KIND_LABEL[a.kind](), a.status].filter(Boolean).join(' · ').toUpperCase(),
      warm: a.warn,
      pick: { kind: 'item', key: a.key },
    });
    const limbCard = (id: string): Card | null => {
      const l = limbById.get(id);
      const p = pathById.get(id);
      if (!l || !p) return null;
      const chosen = nav?.pathId === id;
      const step = chosen && nav ? currentAction(nav) : undefined;
      return {
        key: `limb:${id}`,
        at: l.tip,
        meta: `${pathCode(p.code).toUpperCase()}${chosen ? ` · ${t('What you chose').toUpperCase()}` : ''} · ${t('Bearing {deg}°', { deg: bearingOf(l.bearing) }).toUpperCase()}`,
        title: p.title,
        sub: step ? `${t('Next step')}: ${clip(step.title, 48)}` : BANDS.map((b, i) => `${ROMAN[i]} ${counts(id, b)}`).join(' · '),
        warm: chosen,
        pick: { kind: 'path', id },
      };
    };
    if (show?.kind === 'item' && byKey.get(show.key)) put(answerCard(byKey.get(show.key)!));
    if (show?.kind === 'path') {
      const c = limbCard(show.id);
      if (c) put(c);
    }
    if (show?.kind === 'root' && rootByKey.get(show.key)) {
      const r = rootByKey.get(show.key)!;
      put({
        key: r.key,
        at: r.end,
        meta: (r.side === 'constraint' ? t('Holds you') : t('Carries you')).toUpperCase(),
        title: clip(r.text, 64),
        pick: { kind: 'root', key: r.key },
      });
    }
    if (nav && limbById.has(nav.pathId)) {
      const c = limbCard(nav.pathId);
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
  const seen = useRef({
    buds: new Map<string, [number, number]>(),
    limbs: new Map<string, [number, number][]>(),
    roots: new Map<string, [number, number]>(),
    tree: null as Tree | null,
  });

  // The loop: the camera, the scan, the plate's furniture that moves with it, the buds and the cards.
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
    const scale = Math.min((size.h - (compact ? 70 : 110)) / (CROWN_Y + 10), span / (GROUND_R * 2 + 6));
    const camera: Camera = { yaw: 0, pitch: PITCH, cx, cy: size.h - (compact ? 44 : 78), scale };
    const N = tree.points.length / 3;
    const step = compact ? 2 : 1;
    // Per point, this frame: x, y, alpha; and which are warm.
    const sx = new Float32Array(N);
    const sy = new Float32Array(N);
    const sz = new Float32Array(N);
    const sa = new Float32Array(N);
    const BINS = 8;
    const binOf = new Uint8Array(N);
    const bins = new Uint32Array(BINS * 2);
    const start = new Uint32Array(BINS * 2 + 1);
    const cursor = new Uint32Array(BINS * 2 + 1);
    const order = new Uint32Array(N);
    // Which points are drawn warm: some of what you chose, and the twigs that want attention.
    const warm = new Uint8Array(N);
    let warmFor: string | undefined | null = null;
    const warmTwigs = new Set(tree.answers.filter((a) => a.warn).map((a) => tree.groups.twig.get(a.key)!));
    const paintWarm = (chosen: string | undefined) => {
      const limb = chosen ? tree.groups.limb.get(chosen) : undefined;
      for (let i = 0; i < N; i++) {
        const g = tree.group[i];
        warm[i] = Number(warmTwigs.has(g) || (limb !== undefined && (g === limb || tree.limbOf.get(g) === limb) && (i * 7) % 10 < 4));
      }
      warmFor = chosen;
    };
    const started = performance.now();
    let last = started;
    let raf = 0;
    let frame = 0;
    const cardPos = new Map<string, { x: number; y: number }>();
    const cardSide = new Map<string, number>();
    seen.current.tree = tree;

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
        if (focusPath && limbById.get(focusPath)) c.yaw += turnTo(c.yaw, faceYaw(limbById.get(focusPath)!.bearing)) * Math.min(1, dt / 420);
        else if (!L.reduced && !L.show) c.yaw += (dt / 1000) * (360 / TURN);
      }
      camera.yaw = c.yaw + c.lookX * 6;
      camera.pitch = c.pitch + c.lookY * 3;

      const age = now - started;
      const building = !L.reduced && age < BUILD_MS;
      const scanY = building ? -2 + (CROWN_Y + 8) * ease(age / BUILD_MS) : Infinity;
      const pass = L.reduced ? -1 : (age - BUILD_MS) % PASS_EVERY;
      const passY = pass >= 0 && pass < PASS_MS && age > BUILD_MS ? -1 + (CROWN_Y + 4) * (pass / PASS_MS) : NaN;

      // What is lit.
      const show = L.show;
      const litLimb =
        show?.kind === 'path' ? tree.groups.limb.get(show.id) : show?.kind === 'item' ? tree.groups.limb.get(byKey.get(show.key)?.pathId ?? '') : undefined;
      const litTwig = show?.kind === 'item' ? tree.groups.twig.get(show.key) : undefined;
      const litRoot = show?.kind === 'root' ? tree.groups.root.get(show.key) : undefined;
      const litBand = show?.kind === 'band' ? BANDS.indexOf(show.band) : -1;
      const anything = Boolean(show);
      const chosenLimb = L.chosen ? tree.groups.limb.get(L.chosen) : undefined;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size.w, size.h);

      // The ground's survey: rings every five metres, rays, and its compass.
      ctx.lineWidth = 1;
      const ring = (radius: number, y: number, from = 0, to = 360, stepDeg = 6) => {
        ctx.beginPath();
        for (let d = from; d <= to; d += stepDeg) {
          const [px, py] = project(camera, [Math.cos((d * Math.PI) / 180) * radius, y, Math.sin((d * Math.PI) / 180) * radius]);
          if (d === from) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      };
      ctx.strokeStyle = 'rgba(236,232,223,0.07)';
      for (const rr of [5, 10, 15]) {
        ring(rr, 0);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(236,232,223,0.22)';
      ring(GROUND_R, 0, 0, 360, 3);
      ctx.stroke();
      ctx.font = '500 9px "IBM Plex Mono", ui-monospace, monospace';
      ctx.textAlign = 'center';
      for (let d = 0; d < 360; d += 5) {
        const rad = ((d - 90) * Math.PI) / 180;
        const major = d % 30 === 0;
        const [ax, ay] = project(camera, [Math.cos(rad) * GROUND_R, 0, Math.sin(rad) * GROUND_R]);
        const [bx, by, bz] = project(camera, [Math.cos(rad) * (GROUND_R + (major ? 1.4 : 0.6)), 0, Math.sin(rad) * (GROUND_R + (major ? 1.4 : 0.6))]);
        const near = bz < 0;
        ctx.strokeStyle = `rgba(236,232,223,${near ? 0.4 : 0.18})`;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
        if (major) {
          const [lx, ly] = project(camera, [Math.cos(rad) * (GROUND_R + 3), 0, Math.sin(rad) * (GROUND_R + 3)]);
          const name = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d).padStart(3, '0');
          ctx.fillStyle = name.length === 1 ? `rgba(236,232,223,${near ? 0.8 : 0.4})` : `rgba(236,232,223,${near ? 0.42 : 0.2})`;
          ctx.fillText(name, lx, ly + 3);
        }
      }

      // The sections: a ring round the tree at each level, dashed, lit when you compare on it.
      LEVELS.forEach((y, b) => {
        const reach = Math.hypot(tree.limbs[0]?.levels[b][0] ?? 6, tree.limbs[0]?.levels[b][2] ?? 0) + 4.5;
        ctx.setLineDash([3, 5]);
        ctx.strokeStyle = litBand === b ? 'rgba(255,90,31,0.75)' : `rgba(236,232,223,${anything && litBand !== b ? 0.07 : 0.14})`;
        ring(reach, y);
        ctx.stroke();
        ctx.setLineDash([]);
        // Its datum: a line from the level mark to the trunk.
        const [ax, ay] = project(camera, [0, y, 0]);
        const el = levelEls.current[b];
        if (el) el.style.transform = `translateY(${(ay - 9).toFixed(1)}px)`;
        ctx.strokeStyle = litBand === b ? 'rgba(255,90,31,0.6)' : 'rgba(236,232,223,0.12)';
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(compact ? 34 : MARGIN - 6, ay);
        ctx.lineTo(ax - 8, ay);
        ctx.stroke();
        ctx.setLineDash([]);
      });
      {
        const [, gy] = project(camera, [0, 0, 0]);
        const el = levelEls.current[4];
        if (el) el.style.transform = `translateY(${(gy - 9).toFixed(1)}px)`;
      }

      // The scan itself: every point placed, then how bright it is, then drawn in a few bins of brightness, white,
      // and warm for what you chose and what wants attention.
      const P = tree.points;
      projectAll(camera, P, step, sx, sy, sz);
      bins.fill(0);
      if (warmFor !== L.chosen) paintWarm(L.chosen);
      for (let i = 0; i < N; i += step) {
        const y = P[i * 3 + 1];
        if (y > scanY) {
          sa[i] = 0;
          continue;
        }
        const z = sz[i];
        const g = tree.group[i];
        let a = tree.weight[i] * Math.max(0.22, Math.min(1, 0.62 - z / 46)) * (0.8 + 0.4 * (DISTANCE / (DISTANCE + z)));
        if (anything) {
          const limb = g === litLimb || tree.limbOf.get(g) === litLimb;
          if (litTwig !== undefined) a *= g === litTwig ? 2.4 : limb ? 1.15 : 0.45;
          else if (litLimb !== undefined) a *= limb ? 1.7 : 0.42;
          else if (litRoot !== undefined) a *= g === litRoot ? 2.6 : 0.5;
          else if (litBand >= 0) a *= Math.abs(y - LEVELS[litBand]) < 2.4 ? 1.9 : 0.5;
        }
        if (building && y > scanY - 1.4) a *= 3;
        if (!Number.isNaN(passY) && Math.abs(y - passY) < 0.9) a *= 1.8;
        a = Math.min(1, a);
        sa[i] = a;
        const bin = (warm[i] ? BINS : 0) + Math.min(BINS - 1, Math.floor(a * BINS));
        binOf[i] = bin;
        bins[bin]++;
      }
      // Sorted into their bins (counting), then each bin drawn in one colour.
      for (let b = 0; b < BINS * 2; b++) start[b + 1] = start[b] + bins[b];
      cursor.set(start);
      for (let i = 0; i < N; i += step) if (sa[i] > 0) order[cursor[binOf[i]]++] = i;
      ctx.globalCompositeOperation = 'lighter';
      for (let b = 0; b < BINS * 2; b++) {
        if (start[b + 1] === start[b]) continue;
        const alpha = (((b % BINS) + 1) / BINS).toFixed(3);
        ctx.fillStyle = b >= BINS ? `rgba(255,120,60,${alpha})` : `rgba(236,232,223,${alpha})`;
        for (let j = start[b]; j < start[b + 1]; j++) {
          const i = order[j];
          ctx.fillRect(sx[i] - 0.6, sy[i] - 0.6, 1.25, 1.25);
        }
      }
      ctx.globalCompositeOperation = 'source-over';

      // Sap: light rising through the trunk and up what you chose.
      if (chosenLimb !== undefined && !L.reduced && L.chosen) {
        const limb = limbById.get(L.chosen);
        if (limb) {
          const route = [...tree.trunk, ...limb.curve];
          ctx.fillStyle = 'rgba(255,110,50,0.95)';
          for (let k = 0; k < 6; k++) {
            const f = ((now / 3200 + k / 6) % 1) * (route.length - 1);
            const a = route[Math.floor(f)];
            const b = route[Math.min(route.length - 1, Math.floor(f) + 1)];
            const p: V3 = [a[0] + (b[0] - a[0]) * (f % 1), a[1] + (b[1] - a[1]) * (f % 1), a[2] + (b[2] - a[2]) * (f % 1)];
            if (p[1] > scanY) continue;
            const [px, py] = project(camera, p);
            ctx.beginPath();
            ctx.arc(px, py, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // The scanner's plane as it builds the tree up, and as it passes over again.
      for (const y of [scanY, passY]) {
        if (!Number.isFinite(y)) continue;
        ctx.strokeStyle = `rgba(236,232,223,${y === scanY ? 0.5 : 0.22})`;
        ring(GROUND_R * 0.62, y, 0, 360, 4);
        ctx.stroke();
      }

      // The roots' ends: what holds you, a bar; what carries you, a ringed point.
      const seenRoots = seen.current.roots;
      for (const r of tree.roots) {
        const [px, py] = project(camera, r.end);
        seenRoots.set(r.key, [px, py]);
        const lit = litRoot === tree.groups.root.get(r.key);
        ctx.strokeStyle = lit ? 'rgba(255,90,31,0.95)' : 'rgba(236,232,223,0.6)';
        ctx.beginPath();
        if (r.side === 'constraint') {
          ctx.moveTo(px, py - 5);
          ctx.lineTo(px, py + 5);
        } else ctx.arc(px, py, 4.5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // The limbs as you see them, for pointing at; their tips marked with their letter.
      const seenLimbs = seen.current.limbs;
      ctx.textAlign = 'center';
      ctx.font = '500 10px "IBM Plex Mono", ui-monospace, monospace';
      for (const l of tree.limbs) {
        seenLimbs.set(
          l.pathId,
          l.curve
            .filter((_, i) => i % 3 === 0)
            .map((p) => {
              const [px, py] = project(camera, p);
              return [px, py];
            }),
        );
        if (l.tip[1] > scanY) continue;
        const [px, py] = project(camera, l.tip);
        const chosen = L.chosen === l.pathId;
        ctx.strokeStyle = chosen ? 'rgba(255,90,31,0.9)' : 'rgba(236,232,223,0.55)';
        ctx.fillStyle = 'rgba(7,8,10,0.85)';
        ctx.beginPath();
        ctx.arc(px, py - 14, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = chosen ? 'rgb(255,120,70)' : 'rgba(236,232,223,0.9)';
        ctx.fillText(l.code, px, py - 10.5);
      }

      // The buds: each answer's mark where its twig ends.
      const seenBuds = seen.current.buds;
      const buds = budsRef.current;
      if (buds) {
        for (const a of tree.answers) {
          const el = buds.querySelector<SVGGElement>(`[data-bud="${CSS.escape(a.key)}"]`);
          const [px, py, z] = project(camera, a.at);
          seenBuds.set(a.key, [px, py]);
          if (!el) continue;
          const hidden = a.at[1] > scanY;
          el.setAttribute('transform', `translate(${px.toFixed(1)} ${py.toFixed(1)})`);
          el.style.opacity = hidden ? '0' : String(Math.max(0.35, Math.min(1, 0.85 - z / 40)));
        }
      }

      // The axis mark, turning with the camera; and the readout.
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
      if (readout.current && frame % 6 === 0) {
        readout.current.textContent = t('Bearing {deg}° · looking down {pitch}°', {
          deg: bearingOf(-camera.yaw - 90),
          pitch: Math.round(camera.pitch),
        }).toUpperCase();
      }
      if (scaleBar.current && frame % 30 === 1) {
        const [, , , k] = project(camera, [0, 0, 0]);
        scaleBar.current.style.width = `${(10 * camera.scale * k).toFixed(1)}px`;
      }

      // The cards: each in a column beside the tree, as near level with what it reads as they allow, and a
      // leader line out to it. Each shows the scan close up round what it reads.
      const under = (el: HTMLElement | null) => (el && el.offsetParent ? el.offsetTop + el.offsetHeight + 12 : 16);
      const top = { [-1]: under(blockRef.current), [1]: L.compact ? under(blockRef.current) : 16 } as Record<number, number>;
      const placed: { key: string; el: HTMLDivElement; ax: number; ay: number; side: number; w: number; h: number; y: number }[] = [];
      for (const card of L.cards) {
        const el = cardEls.current.get(card.key);
        if (!el) continue;
        const [ax, ay] = project(camera, card.at);
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
          // The leader: from what it reads to the card's near edge, a point at either end.
          const ex = side < 0 ? pos.x + w : pos.x;
          const ey = pos.y + 14;
          const warm = L.cards.find((c) => c.key === p.key)?.warm;
          ctx.strokeStyle = warm ? 'rgba(255,90,31,0.7)' : 'rgba(236,232,223,0.55)';
          ctx.fillStyle = ctx.strokeStyle;
          ctx.beginPath();
          ctx.moveTo(p.ax, p.ay);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(p.ax, p.ay, 2.4, 0, Math.PI * 2);
          ctx.arc(ex, ey, 1.8, 0, Math.PI * 2);
          ctx.fill();
          // Close up: the scan round it, larger, every other frame.
          const crop = cropEls.current.get(p.key);
          if (crop && (frame + p.key.length) % 2 === 0) {
            const cc = crop.getContext('2d');
            if (cc) {
              const cw = crop.width / CROP_DPR;
              const ch = crop.height / CROP_DPR;
              cc.setTransform(CROP_DPR, 0, 0, CROP_DPR, 0, 0);
              cc.fillStyle = '#050607';
              cc.fillRect(0, 0, cw, ch);
              cc.globalCompositeOperation = 'lighter';
              cc.fillStyle = warm ? 'rgba(255,140,90,0.5)' : 'rgba(236,232,223,0.45)';
              for (let i = 0; i < N; i++) {
                if (sa[i] <= 0) continue;
                const qx = (sx[i] - p.ax) * ZOOM + cw / 2;
                const qy = (sy[i] - p.ay) * ZOOM + ch / 2;
                if (qx < 0 || qy < 0 || qx > cw || qy > ch) continue;
                cc.fillRect(qx - 0.7, qy - 0.7, 1.4 + sa[i], 1.4 + sa[i]);
              }
              cc.globalCompositeOperation = 'source-over';
              // A reticle on what it reads, and the detail's scale.
              cc.strokeStyle = warm ? 'rgba(255,90,31,0.9)' : 'rgba(236,232,223,0.7)';
              cc.lineWidth = 1;
              cc.beginPath();
              for (const [dx, dy] of [
                [-1, -1],
                [1, -1],
                [1, 1],
                [-1, 1],
              ]) {
                cc.moveTo(cw / 2 + dx * 7, ch / 2 + dy * 3);
                cc.lineTo(cw / 2 + dx * 7, ch / 2 + dy * 7);
                cc.lineTo(cw / 2 + dx * 3, ch / 2 + dy * 7);
              }
              cc.stroke();
              cc.fillStyle = 'rgba(236,232,223,0.55)';
              cc.font = '500 8px "IBM Plex Mono", ui-monospace, monospace';
              cc.textAlign = 'left';
              cc.fillText(`DETAIL ×${ZOOM}`, 5, ch - 5);
            }
          }
        }
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
    for (const [key, [px, py]] of seen.current.roots) {
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) [best, bestD] = [{ kind: 'root', key }, d];
    }
    if (best) return best;
    bestD = 11;
    for (const [id, pts] of seen.current.limbs) {
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

  return (
    <div className="ahead-stage">
      <div
        ref={plateRef}
        className={cn('ahead-plate tree-plate', hover && 'is-pointing')}
        role="img"
        aria-label={t('Your options as a tree growing from where you are')}
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
            c.pitch = Math.max(4, Math.min(32, c.drag.pitch + dy * 0.12));
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

        {/* The buds: a mark for each answer, kept where its twig ends. */}
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

        {/* The plate's title block, as on a drawing: what it is, what is on it, the view, the scale, the axes. */}
        <div ref={blockRef} className="tree-block" aria-hidden>
          <div className="tree-block-main">
            <div className="tree-block-row is-head">
              <span>{t('Plate · Ahead').toUpperCase()}</span>
              <span className="tree-block-no">A—01</span>
            </div>
            <div className="tree-block-row is-sub">{t('The tree of what could be · a scan').toUpperCase()}</div>
            {wide && (
              <>
                <div className="tree-block-row">{t('{n} options · {m} answers · not ranked', { n: paths.length, m: total }).toUpperCase()}</div>
                <div className="tree-block-row">
                  <span ref={readout} />
                </div>
                <div className="tree-block-row tree-block-scale">
                  <div ref={scaleBar} className="tree-scale" />
                  <span>10 M</span>
                  <span className="tree-block-dim">{t('Drag to turn it').toUpperCase()}</span>
                </div>
              </>
            )}
          </div>
          {wide && (
            <svg className="tree-gizmo" width={64} height={64} viewBox="-32 -32 64 64">
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
        </div>
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
              <span className="tree-level-num">{band ? `+${(LEVELS[i] - 0).toFixed(1)}` : '±0.0'}</span>
              {!compact && <span className="tree-level-name">{band ? `${ROMAN[i]} · ${BAND_LABEL[band]()}` : t('You are here')}</span>}
              {compact && <span className="tree-level-name">{band ? ROMAN[i] : '±'}</span>}
            </button>
          ))}
        </div>

        {/* The cards called out from the tree. */}
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
            <div className="tree-card-at">
              <span>X {c.at[0].toFixed(1)}</span>
              <span>Y {c.at[1].toFixed(1)}</span>
              <span>Z {c.at[2].toFixed(1)}</span>
            </div>
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
              {limbById.get(p.id) && <span className="ahead-option-bearing">{bearingOf(limbById.get(p.id)!.bearing)}°</span>}
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
          ) : sel?.kind === 'root' && rootByKey.get(sel.key) ? (
            <Section label={rootByKey.get(sel.key)!.side === 'constraint' ? t('Holds you · a constraint') : t('Carries you · an asset')}>
              <p className="mt-2 text-[14px] leading-snug text-ink">{rootByKey.get(sel.key)!.text}</p>
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
                  <button type="button" className="mt-1 text-left text-[13px] text-ink hover:underline" onClick={() => pick({ kind: 'path', id: chosen.id })}>
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
              <p className="mt-4 font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-ink-3 uppercase">
                {t('Drag to turn it · point at a limb to read its option · at a level to compare them · click a bud to open it')}
              </p>
            </Section>
          )}
        </aside>
      </div>

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
  );
}
