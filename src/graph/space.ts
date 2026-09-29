/**
 * The graph as a real 3D space.
 *
 * Every node gets a depth (z, in graph units; positive is toward the viewer).
 * A perspective camera orbits a pivot at the middle of the view: the pointer
 * (or device tilt, or a slow sway when idle) turns it a few degrees, panning
 * moves the pivot, zooming changes the focal length. Each frame the engine
 * projects every node through that camera and writes the result straight to
 * the DOM:
 *
 * - nodes: the `translate` / `scale` properties of React Flow's node wrapper
 *   (separate from the `transform` React Flow owns);
 * - edges: one similarity transform per edge (its SVG and its HTML overlay
 *   with pulses and label), mapping the stored segment onto the projected
 *   endpoints, so lines stay attached and pulses stay on their lines;
 * - rings: an exact 3D plane transform (matrix3d) at their ring's depth.
 *
 * Depths are compensated so the layout is unchanged at rest: nodes drift
 * apart only when the camera moves, turns or zooms, when time moves (the
 * slow depth oscillation of satellites) and when you interact: the
 * selection comes forward, hovered nodes lift, the pointer pulls on what is
 * near it. Nothing re-renders React.
 */
import type { ReactFlowState } from '@xyflow/react';
import { createContext, useCallback, useContext, useRef } from 'react';
import { DOMAIN_META } from '../domain/constants';
import type { DomainKey, ID } from '../domain/types';
import { hash01 } from './motion';
import type { AtlasFlowNode, SemanticEdge } from './types';

type FlowState = ReactFlowState<AtlasFlowNode, SemanticEdge>;
interface FlowStore {
  getState(): FlowState;
}

/** Depth of each Orbit ring: self nearest, conditions farthest. */
const RING_DEPTH = [85, 40, -40, -115];
/** Focal length at the reference zoom (graph units). */
const FOCAL = 1500;
const REF_ZOOM = 0.7;
const MAX_YAW = (11 * Math.PI) / 180;
const MAX_PITCH = (8 * Math.PI) / 180;
/** Above this many nodes the graph stays flat (the camera still moves the stars). */
export const SPACE_MAX_NODES = 160;

/**
 * Set when automatic mode found this device too slow for depth. Kept for the
 * page's lifetime so every graph stays flat instead of re-testing.
 */
export const spaceHealth = { degraded: false };

interface Depth {
  base: number;
  /** Time-varying depth: the slow fourth dimension. */
  amp: number;
  period: number;
  phase: number;
  /** In-plane micro-orbit radius. */
  orbit: number;
  /** Selection / hover lift (spring). */
  focus: number;
  focusV: number;
  /** Pointer gravity (smoothed). */
  pullX: number;
  pullY: number;
  lift: number;
}

interface EdgeEls {
  source: ID;
  target: ID;
  svg: SVGSVGElement | null;
  html: HTMLElement | null;
}

interface Projection {
  dx: number;
  dy: number;
  s: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const TAU = Math.PI * 2;

export class SpaceEngine {
  /** Eased look direction in [-1, 1] (pointer, tilt or sway). Shared with the star field. */
  readonly camera = { lx: 0, ly: 0 };
  private cameraOn = false;
  private depthOn = false;
  /** How pronounced depth and camera turns are (compact layouts on small screens get less). */
  private intensity = 1;
  private occludedLeft = 0;
  private occludedRight = 0;
  private raf = 0;
  private last = 0;
  private lastFull = 0;
  private prevTransform = [NaN, NaN, NaN];
  private readonly nodeEls = new Map<ID, HTMLElement>();
  private readonly followers = new Map<HTMLElement, ID>();
  private readonly edgeEls = new Map<string, EdgeEls>();
  private readonly ringEls = new Map<number, HTMLElement | SVGElement>();
  private readonly depth = new Map<ID, Depth>();
  private readonly proj = new Map<ID, Projection>();
  private readonly listeners = new Set<() => void>();
  private focusTargets = new Map<ID, number>();
  private pointer = { x: 0, y: 0, inside: false, down: false, moved: -1e9 };
  private tilt: { x: number; y: number } | null = null;
  private rect = { left: 0, top: 0, width: 0, height: 0 };
  private rectSize = '';
  /** Frame-time watchdog for automatic mode: sustained slow frames switch depth off. */
  private governor = { on: false, since: 0, sum: 0, n: 0, strikes: 0 };
  onDegrade: (() => void) | null = null;

  constructor(private readonly store: FlowStore) {}

  /* -------------------------------------------------------- configuration */

  configure(opts: {
    camera: boolean;
    depth: boolean;
    nodes: AtlasFlowNode[];
    occludedLeft: number;
    occludedRight: number;
    intensity: number;
    /** Watch frame times and step down on slow devices. */
    adaptive: boolean;
  }) {
    this.intensity = opts.intensity;
    if (opts.adaptive !== this.governor.on) this.governor = { on: opts.adaptive, since: performance.now() + 1500, sum: 0, n: 0, strikes: 0 };
    this.occludedLeft = opts.occludedLeft;
    this.occludedRight = opts.occludedRight;
    const wasDepth = this.depthOn;
    this.depthOn = opts.camera && opts.depth;
    this.assignDepths(opts.nodes);
    if (wasDepth && !this.depthOn) this.flatten();
    if (opts.camera && !this.cameraOn) this.start();
    else if (!opts.camera && this.cameraOn) this.stop();
    this.lastFull = 0;
  }

  private assignDepths(nodes: AtlasFlowNode[]) {
    const q = this.intensity;
    const hubDepth = (key: DomainKey) => RING_DEPTH[DOMAIN_META[key].ring] * q;
    const seen = new Set<ID>();
    for (const n of nodes) {
      if (n.type === 'rings') continue;
      seen.add(n.id);
      const h = hash01(n.id);
      const h2 = hash01(`${n.id}:z`);
      let base = 0;
      let amp = 0;
      let orbit = 0;
      if (n.type === 'hub') {
        base = hubDepth(n.data.key);
        amp = 10;
      } else if (n.type === 'item') {
        // Satellites float around their hub's depth and drift through it over time.
        base = hubDepth(n.data.domain) + (h2 - 0.5) * 50 * q;
        amp = 30;
        orbit = 4 + h * 5;
      } else if (n.type === 'pattern') {
        base = 60 * q;
        amp = 18;
      } else {
        base = (h2 - 0.55) * 110 * q;
        amp = 18;
        orbit = 2 + h * 3;
      }
      amp *= q;
      orbit *= q;
      const prev = this.depth.get(n.id);
      this.depth.set(n.id, {
        base,
        amp,
        orbit,
        period: 14 + h * 12,
        phase: h2 * TAU,
        focus: prev?.focus ?? 0,
        focusV: prev?.focusV ?? 0,
        pullX: prev?.pullX ?? 0,
        pullY: prev?.pullY ?? 0,
        lift: prev?.lift ?? 0,
      });
    }
    for (const id of [...this.depth.keys()]) if (!seen.has(id)) this.depth.delete(id);
  }

  /** The selection comes forward, its neighbourhood with it; the hovered node lifts a little. */
  setFocus(selected: ID | undefined, near: Iterable<ID>, hovered: ID | null) {
    const t = new Map<ID, number>();
    const q = this.intensity;
    for (const id of near) t.set(id, 60 * q);
    if (hovered) t.set(hovered, Math.max(t.get(hovered) ?? 0, 40 * q));
    if (selected) t.set(selected, 130 * q);
    this.focusTargets = t;
    this.lastFull = 0;
  }

  /* -------------------------------------------------------- registration */

  registerNode(id: ID, el: HTMLElement | null) {
    const prev = this.nodeEls.get(id);
    if (prev && prev !== el) clearNode(prev);
    if (el) {
      this.nodeEls.set(id, el);
      this.applyNode(id, el);
    } else this.nodeEls.delete(id);
  }

  /** An element that moves with a node (e.g. the selection reticle). */
  follow(id: ID, el: HTMLElement | null, prev: HTMLElement | null) {
    if (prev) this.followers.delete(prev);
    if (el) {
      this.followers.set(el, id);
      const p = this.proj.get(id);
      if (p && this.depthOn) setFollower(el, p);
    }
  }

  registerEdge(id: string, source: ID, target: ID, part: 'svg' | 'html', el: Element | null) {
    const entry = this.edgeEls.get(id) ?? { source, target, svg: null, html: null };
    entry.source = source;
    entry.target = target;
    if (part === 'svg') entry.svg = (el as SVGSVGElement | null) ?? null;
    else entry.html = (el as HTMLElement | null) ?? null;
    if (!entry.svg && !entry.html) this.edgeEls.delete(id);
    else {
      this.edgeEls.set(id, entry);
      if (this.depthOn) this.applyEdge(entry);
    }
  }

  registerRing(index: number, el: HTMLElement | SVGElement | null) {
    if (el) this.ringEls.set(index, el);
    else this.ringEls.delete(index);
    this.lastFull = 0;
  }

  /** Current projected offset of a node (graph units), for overlays that track it. */
  offset(id: ID): Projection {
    return (this.depthOn && this.proj.get(id)) || { dx: 0, dy: 0, s: 1 };
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  /* -------------------------------------------------------- loop */

  private start() {
    this.cameraOn = true;
    this.last = performance.now();
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', this.onUp, { passive: true });
    const needsPermission =
      typeof (globalThis.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined)?.requestPermission === 'function';
    if (typeof DeviceOrientationEvent !== 'undefined' && !needsPermission) window.addEventListener('deviceorientation', this.onTilt, { passive: true });
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() {
    this.cameraOn = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('pointermove', this.onPointer);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
    window.removeEventListener('deviceorientation', this.onTilt);
    this.camera.lx = this.camera.ly = 0;
    this.flatten();
  }

  private onPointer = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    const dom = this.store.getState().domNode;
    this.pointer.x = e.clientX;
    this.pointer.y = e.clientY;
    this.pointer.inside = Boolean(dom && e.target instanceof Node && dom.contains(e.target));
    this.pointer.moved = performance.now();
  };
  private onDown = () => void (this.pointer.down = true);
  private onUp = () => void (this.pointer.down = false);
  private onTilt = (e: DeviceOrientationEvent) => {
    if (e.gamma == null || e.beta == null) return;
    this.tilt = { x: clamp(e.gamma / 25, -1, 1), y: clamp((e.beta - 40) / 25, -1, 1) };
  };

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const gap = now - this.last;
    const dt = Math.min(0.05, gap / 1000);
    this.last = now;
    this.watch(now, gap);
    const st = this.store.getState();
    const [tx, ty, k] = st.transform;
    const w = st.width;
    const h = st.height;
    if (!w || !h) return;
    const size = `${w}x${h}`;
    if (size !== this.rectSize && st.domNode) {
      const r = st.domNode.getBoundingClientRect();
      this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
      this.rectSize = size;
    }

    // Look direction: the pointer while it is in use, device tilt on phones, otherwise a slow sway.
    const t = now / 1000;
    const viewCx = this.occludedLeft + (w - this.occludedLeft - this.occludedRight) / 2;
    const pointerActive = this.pointer.inside && now - this.pointer.moved < 4000;
    let gx: number;
    let gy: number;
    if (pointerActive) {
      gx = clamp((this.pointer.x - this.rect.left - viewCx) / ((w - this.occludedLeft - this.occludedRight) / 2 || 1), -1, 1);
      gy = clamp((this.pointer.y - this.rect.top - h / 2) / (h / 2), -1, 1);
    } else if (this.tilt) {
      gx = this.tilt.x;
      gy = this.tilt.y;
    } else {
      gx = 0.5 * Math.sin((t * TAU) / 23);
      gy = 0.4 * Math.sin((t * TAU) / 31 + 1.3);
    }
    const ease = Math.min(1, dt * (pointerActive ? 3.2 : 1.2));
    // Following the pointer is interactive (full rate); the idle sway is slow (~30 fps is plenty).
    const lookMoving = pointerActive && Math.abs(gx - this.camera.lx) + Math.abs(gy - this.camera.ly) > 0.002;
    this.camera.lx += (gx - this.camera.lx) * ease;
    this.camera.ly += (gy - this.camera.ly) * ease;

    if (!this.depthOn) {
      for (const fn of this.listeners) fn();
      return;
    }

    const cameraMoved = tx !== this.prevTransform[0] || ty !== this.prevTransform[1] || k !== this.prevTransform[2];
    const pointerRecent = now - this.pointer.moved < 400;
    // Full rate while you interact (pan, zoom, pointer, springs settling). The idle sway and
    // depth drift are slow enough that ~15 fps is indistinguishable, and far cheaper to composite.
    if (!cameraMoved && !lookMoving && !pointerRecent && !this.springsActive && now - this.lastFull < 64) return;
    this.lastFull = now;
    this.prevTransform = [tx, ty, k];
    this.project(st, t, dt, tx, ty, k, viewCx);
    for (const fn of this.listeners) fn();
  };

  private springsActive = false;

  /** Two consecutive 2.5 s windows averaging under ~33 fps: this device is better served flat. */
  private watch(now: number, gap: number) {
    const g = this.governor;
    if (!g.on || !this.depthOn || document.hidden || now < g.since || gap > 250) return;
    g.sum += gap;
    g.n++;
    if (now - g.since < 2500) return;
    g.strikes = g.sum / g.n > 30 ? g.strikes + 1 : 0;
    g.since = now;
    g.sum = g.n = 0;
    if (g.strikes >= 2) {
      spaceHealth.degraded = true;
      this.depthOn = false;
      this.flatten();
      this.onDegrade?.();
    }
  }

  private project(st: FlowState, t: number, dt: number, tx: number, ty: number, k: number, viewCx: number) {
    const yaw = -this.camera.lx * MAX_YAW * this.intensity;
    const pitch = this.camera.ly * MAX_PITCH * this.intensity;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // Zooming in brings the camera closer: perspective grows.
    const F = FOCAL * clamp(Math.sqrt(REF_ZOOM / k), 0.6, 1.7);
    const Cx = (viewCx - tx) / k;
    const Cy = (st.height / 2 - ty) / k;
    const px = (this.pointer.x - this.rect.left - tx) / k;
    const py = (this.pointer.y - this.rect.top - ty) / k;
    const gravity = this.pointer.inside && !this.pointer.down && performance.now() - this.pointer.moved < 4000;
    const reach = 170 / k;
    let active = false;

    for (const [id, d] of this.depth) {
      // Springs: focus lift toward its target.
      const target = this.focusTargets.get(id) ?? 0;
      const acc = (target - d.focus) * 55 - d.focusV * 14.8;
      d.focusV += acc * dt;
      d.focus += d.focusV * dt;
      if (Math.abs(target - d.focus) > 0.3 || Math.abs(d.focusV) > 0.3) active = true;
    }

    for (const [id, el] of this.nodeEls) {
      const n = st.nodeLookup.get(id);
      const d = this.depth.get(id);
      if (!n || !d) continue;
      const pos = n.internals.positionAbsolute;
      const w = n.measured.width ?? 0;
      const h = n.measured.height ?? 0;
      const ang = (t * TAU) / d.period + d.phase;
      const bx = pos.x + w / 2 + d.orbit * Math.cos(ang * 0.7) + d.pullX;
      const by = pos.y + h / 2 + d.orbit * Math.sin(ang * 0.7) * 0.6 + d.pullY;
      const z = d.base + d.amp * Math.sin(ang) + d.focus + d.lift;
      // Compensate for the resting depth, so the stored layout is what you see at rest.
      const m0 = FOCAL / (FOCAL - d.base);
      const u = bx / m0 - Cx;
      const v = by / m0 - Cy;
      const x1 = u * cy + z * sy;
      const z1 = -u * sy + z * cy;
      const y2 = v * cp - z1 * sp;
      const z2 = v * sp + z1 * cp;
      const persp = F / (F - z2);
      const X = Cx + x1 * persp;
      const Y = Cy + y2 * persp;
      // Farther is smaller, but only a little: text stays readable.
      const s = clamp((persp / m0) * m0 ** 0.35, 0.9, 1.12);

      // Pointer gravity: what is near the pointer leans toward it and rises.
      let tpx = 0;
      let tpy = 0;
      let tlift = 0;
      if (gravity) {
        const gx = px - X;
        const gy = py - Y;
        const dist = Math.hypot(gx, gy);
        if (dist < reach && dist > 0.001) {
          const f = (1 - dist / reach) ** 2;
          const pull = Math.min(f * (9 / k), dist * 0.3);
          tpx = (gx / dist) * pull;
          tpy = (gy / dist) * pull;
          tlift = f * 45 * this.intensity;
        }
      }
      const g = Math.min(1, dt * 5);
      d.pullX += (tpx - d.pullX) * g;
      d.pullY += (tpy - d.pullY) * g;
      d.lift += (tlift - d.lift) * g;
      if (Math.abs(tpx - d.pullX) + Math.abs(tpy - d.pullY) + Math.abs(tlift - d.lift) > 0.05) active = true;

      const p = { dx: X - (pos.x + w / 2), dy: Y - (pos.y + h / 2), s };
      this.proj.set(id, p);
      setNode(el, pos.x, pos.y, p);
    }
    this.springsActive = active;

    for (const [el, id] of this.followers) {
      const p = this.proj.get(id);
      if (p) setFollower(el, p);
    }
    for (const e of this.edgeEls.values()) this.applyEdge(e);

    // Rings: exact planes at their ring's depth.
    const rings = st.nodeLookup.get('__rings');
    if (rings && this.ringEls.size) {
      const o = rings.internals.positionAbsolute;
      for (const [i, el] of this.ringEls) {
        const z = (RING_DEPTH[i + 1] ?? 0) * this.intensity;
        const m0 = FOCAL / (FOCAL - z);
        el.style.transformOrigin = `${(Cx - o.x).toFixed(2)}px ${(Cy - o.y).toFixed(2)}px`;
        el.style.transform = planeMatrix(z, m0, -Cx * (1 - 1 / m0), -Cy * (1 - 1 / m0), cy, sy, cp, sp, F);
      }
    }
  }

  private applyNode(id: ID, el: HTMLElement) {
    const n = this.store.getState().nodeLookup.get(id);
    const p = this.proj.get(id);
    if (!n || !p || !this.depthOn) return;
    setNode(el, n.internals.positionAbsolute.x, n.internals.positionAbsolute.y, p);
  }

  private applyEdge(e: EdgeEls) {
    const st = this.store.getState();
    const a = st.nodeLookup.get(e.source);
    const b = st.nodeLookup.get(e.target);
    if (!a || !b) return;
    const pa = this.proj.get(e.source) ?? { dx: 0, dy: 0, s: 1 };
    const pb = this.proj.get(e.target) ?? { dx: 0, dy: 0, s: 1 };
    const sx = a.internals.positionAbsolute.x + (a.measured.width ?? 0) / 2;
    const sy = a.internals.positionAbsolute.y + (a.measured.height ?? 0) / 2;
    const tx = b.internals.positionAbsolute.x + (b.measured.width ?? 0) / 2;
    const ty = b.internals.positionAbsolute.y + (b.measured.height ?? 0) / 2;
    const vx = tx - sx;
    const vy = ty - sy;
    const wx = tx + pb.dx - (sx + pa.dx);
    const wy = ty + pb.dy - (sy + pa.dy);
    const den = vx * vx + vy * vy;
    // The similarity transform that carries the stored segment onto the projected one.
    const A = den > 1e-6 ? (vx * wx + vy * wy) / den : 1;
    const B = den > 1e-6 ? (vx * wy - vy * wx) / den : 0;
    const E = sx + pa.dx - (A * sx - B * sy);
    const F = sy + pa.dy - (B * sx + A * sy);
    const m = `matrix(${A.toFixed(5)}, ${B.toFixed(5)}, ${(-B).toFixed(5)}, ${A.toFixed(5)}, ${E.toFixed(2)}, ${F.toFixed(2)})`;
    if (e.svg) e.svg.style.transform = m;
    if (e.html) e.html.style.transform = m;
  }

  private flatten() {
    for (const el of this.nodeEls.values()) clearNode(el);
    for (const el of this.followers.keys()) clearNode(el);
    for (const e of this.edgeEls.values()) {
      if (e.svg) e.svg.style.transform = '';
      if (e.html) e.html.style.transform = '';
    }
    for (const el of this.ringEls.values()) el.style.transform = '';
    this.proj.clear();
  }
}

function setNode(el: HTMLElement, x: number, y: number, p: Projection) {
  // React Flow positions the wrapper with `transform: translate(x, y)`; `scale` applies after
  // it, so the translation is corrected to scale about the node's own centre.
  el.style.translate = `${(x * (1 - p.s) + p.dx).toFixed(2)}px ${(y * (1 - p.s) + p.dy).toFixed(2)}px`;
  el.style.scale = p.s.toFixed(4);
}

function setFollower(el: HTMLElement, p: Projection) {
  el.style.translate = `${p.dx.toFixed(2)}px ${p.dy.toFixed(2)}px`;
  el.style.scale = p.s.toFixed(4);
}

function clearNode(el: HTMLElement) {
  el.style.translate = '';
  el.style.scale = '';
}

/**
 * The projective map of a plane at depth z through the camera, as CSS matrix3d,
 * for local coordinates relative to the pivot (the transform origin). Same maths
 * as the node projection, including the resting-depth compensation (scale 1/m0
 * and shift D about the layout origin).
 */
function planeMatrix(z: number, m0: number, Dx: number, Dy: number, cy: number, sy: number, cp: number, sp: number, F: number): string {
  const k = 1 / m0;
  // q = k·(u, v) + D; then the same rotation and perspective as nodes.
  const x0 = Dx * cy + z * sy;
  const z10 = -Dx * sy + z * cy;
  const y0 = Dy * cp - z10 * sp;
  const z20 = Dy * sp + z10 * cp;
  const Xu = k * cy;
  const Xv = 0;
  const Yu = k * sy * sp;
  const Yv = k * cp;
  const Wu = (k * sy * cp) / F;
  const Wv = -(k * sp) / F;
  const W0 = 1 - z20 / F;
  const f = (n: number) => n.toFixed(6);
  return `matrix3d(${f(Xu)}, ${f(Yu)}, 0, ${f(Wu)}, ${f(Xv)}, ${f(Yv)}, 0, ${f(Wv)}, 0, 0, 1, 0, ${f(x0)}, ${f(y0)}, 0, ${f(W0)})`;
}

/* ------------------------------------------------------------ React glue */

export const SpaceContext = createContext<SpaceEngine | null>(null);
export const useSpace = () => useContext(SpaceContext);

/** Ref for a node component's root: its React Flow wrapper takes the projection. */
export function useSpaceNode(id: ID) {
  const space = useSpace();
  return useCallback((el: HTMLElement | null) => space?.registerNode(id, el?.parentElement ?? null), [space, id]);
}

/** Ref for an overlay that should move with a node (e.g. the selection reticle). */
export function useSpaceFollower(id: ID) {
  const space = useSpace();
  const prev = useRef<HTMLElement | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      space?.follow(id, el, prev.current);
      prev.current = el;
    },
    [space, id],
  );
}

/** Refs for an edge: its SVG (found from any element inside it) and its HTML overlay. */
export function useSpaceEdge(id: string, source: ID, target: ID) {
  const space = useSpace();
  const svg = useCallback((el: SVGElement | null) => space?.registerEdge(id, source, target, 'svg', el?.closest('svg') ?? null), [space, id, source, target]);
  const html = useCallback((el: HTMLElement | null) => space?.registerEdge(id, source, target, 'html', el), [space, id, source, target]);
  return { svg, html };
}

export function useSpaceRing(index: number) {
  const space = useSpace();
  return useCallback((el: HTMLElement | SVGElement | null) => space?.registerRing(index, el), [space, index]);
}
