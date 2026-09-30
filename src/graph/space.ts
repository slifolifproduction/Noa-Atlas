/**
 * The graph as a living 3D space.
 *
 * Every node is a body with a depth (z, in graph units; positive is toward
 * the viewer). A perspective camera orbits a pivot at the middle of the view:
 * the pointer (or device tilt, or a slow sway when idle) turns it a few
 * degrees, panning moves the pivot, zooming changes the focal length.
 *
 * On top of that the network behaves like a running system:
 * - bodies drift idly; each hub's satellites turn slowly back and forth
 *   around it together, like a small planetary system;
 * - bodies are springs coupled along their links, so a disturbance in one
 *   node travels to its neighbours and dies away;
 * - a signal cascade (see GraphCanvas) jolts each node as it arrives, and the
 *   node briefly fires;
 * - selecting a node reorganises the network around it (neighbours draw in,
 *   the rest makes room) and brings it forward;
 * - attention accumulates: nodes you hover and select come forward over time,
 *   and signals start from them more often;
 * - on first load, nodes arrive from deep space in reveal order;
 * - on the Causes helix, the whole helix turns slowly back and forth about its
 *   axis, a scanning ring sweeps it from cause to effect, and the strands are
 *   projected afresh each frame so the elements stay on them.
 *
 * Each frame the engine projects every body through the camera and writes the
 * result straight to the DOM (node wrappers' translate/scale, one similarity
 * transform per edge and its overlay, a matrix3d plane per ring). Resting
 * depths are compensated so the stored layout is what you see at rest.
 * Nothing re-renders React.
 */
import type { ReactFlowState } from '@xyflow/react';
import { createContext, useCallback, useContext, useRef } from 'react';
import { YOU_ID } from '../domain/constants';
import type { ID, LayerKey } from '../domain/types';
import { helixDrawing, helixSpan, scanStep, type HelixDrawing, type HelixSpec } from './helix';
import { hash01, HOP_MS, waveBus, type Wave } from './motion';
import type { AtlasFlowNode, SemanticEdge } from './types';

type FlowState = ReactFlowState<AtlasFlowNode, SemanticEdge>;
interface FlowStore {
  getState(): FlowState;
}

/**
 * Depth of each Orbit ring: the person and their core nearest, what they hold
 * next, what they do behind that, and what surrounds them farthest back, with
 * the area markers on the rim behind everything. The star field stays behind
 * all of them.
 */
const RING_DEPTH = [170, 60, -90, -240];
const LAYER_DEPTH: Record<LayerKey | 'core', number> = { core: 130, hold: 60, do: -90, around: -240 };
/** Elements float a little in front of their ring's plane. */
const ELEMENT_LIFT = 24;
const AREA_MARKER_DEPTH = -270;
/** The plane a constellation shape's figure is drawn on: the area markers' depth, so its lines stay on them. */
export const FIGURE_PLANE = 9;
/**
 * Each ring turns slowly about the centre, all its elements together, inner
 * rings a little faster: amplitude in degrees, period in seconds.
 */
const LAYER_SPIN: Record<LayerKey | 'core', [number, number]> = { core: [3, 38], hold: [2.2, 52], do: [1.6, 68], around: [1.2, 86] };
/** Focal length at the reference zoom (graph units). */
const FOCAL = 1500;
const REF_ZOOM = 0.7;
const MAX_YAW = (17 * Math.PI) / 180;
const MAX_PITCH = (12 * Math.PI) / 180;
/** Where nodes start on first load: far behind the scene. */
const BOOT_DEPTH = 480;
/** Above this many nodes the graph stays flat (the camera still moves the stars). */
export const SPACE_MAX_NODES = 160;
/** The helix turns back and forth about its axis: amplitude (radians) and period (seconds). */
const HELIX_SWAY = (16 * Math.PI) / 180;
const HELIX_PERIOD = 40;
/** The camera turns less around the helix, so no step ever passes the next and every name stays clear. */
const HELIX_CAMERA = 0.6;

/**
 * Set when automatic mode found this device too slow for depth. Kept for the
 * page's lifetime so every graph stays flat instead of re-testing.
 */
export const spaceHealth = { degraded: false };

/* Spring constants (per second²). Slightly underdamped: motion settles with a little life. */
const K_HOME = 16;
const C_HOME = 5.5;
const K_LINK = 7;
const K_Z = 22;
const C_Z = 6.5;
const K_LINK_Z = 5;

type Kind = 'hub' | 'item' | 'element';

interface Body {
  kind: Kind;
  /** Elements on Orbit: the centre they turn about. */
  hub?: ID;
  base: number;
  /** Time-varying depth: the slow fourth dimension. */
  amp: number;
  period: number;
  phase: number;
  /** Organic in-plane wander (graph units) and its frequencies and phases. */
  wander: number;
  f1: number;
  f2: number;
  f3: number;
  p1: number;
  p2: number;
  p3: number;
  /** Selection / hover lift (spring). */
  focus: number;
  focusV: number;
  /** Physical offset from home (springs, link coupling, signal impulses). */
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  oz: number;
  vz: number;
  /** Pointer gravity (smoothed). */
  pullX: number;
  pullY: number;
  lift: number;
  /** Accumulated attention, 0–1. */
  att: number;
  /** Boot: held far away until this time. */
  release: number;
  firingUntil: number;
  /** Elements on Orbit: how their ring turns (amplitude in radians, period in seconds, phase). */
  spinAmp: number;
  spinPeriod: number;
  spinPhase: number;
  /**
   * Elements on the Causes helix: their seat (angle at rest, which side the
   * name is on, which base pair), and what the engine last wrote for them.
   */
  helix?: { phase: number; side: 1 | -1; slot: number; flipped: boolean; hz: number; scanned: boolean };
}

/** The helix backbone's SVG and its parts, drawn by the engine while the space is live. */
interface HelixEls {
  spec: HelixSpec;
  svg: SVGSVGElement;
  paths: Map<string, SVGPathElement>;
  texts: Map<string, SVGTextElement>;
  emitter: SVGEllipseElement | null;
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

interface Kick {
  id: ID;
  at: number;
  vx: number;
  vy: number;
  vz: number;
  fire: number;
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
  private lastProject = 0;
  private prevTransform = [NaN, NaN, NaN];
  private active = false;
  private booted = false;
  private readonly nodeEls = new Map<ID, HTMLElement>();
  private readonly followers = new Map<HTMLElement, ID>();
  private readonly edgeEls = new Map<string, EdgeEls>();
  private readonly ringEls = new Map<number, HTMLElement | SVGElement>();
  private helix: HelixEls | null = null;
  private helixSpec: HelixSpec | null = null;
  /** The helix's current turn about its axis (radians). */
  private sway = 0;
  private readonly bodies = new Map<ID, Body>();
  private readonly proj = new Map<ID, Projection>();
  private readonly listeners = new Set<() => void>();
  private links: [ID, ID][] = [];
  private kicks: Kick[] = [];
  private focusTargets = new Map<ID, number>();
  private selected: ID | undefined;
  private near = new Set<ID>();
  private hovered: ID | null = null;
  private pointer = { x: 0, y: 0, inside: false, down: false, moved: -1e9 };
  private tilt: { x: number; y: number } | null = null;
  private rect = { left: 0, top: 0, width: 0, height: 0 };
  private rectSize = '';
  private offWave: (() => void) | null = null;
  /** Frame-time watchdog for automatic mode: sustained slow frames switch depth off. */
  private governor = { on: false, since: 0, sum: 0, n: 0, strikes: 0 };
  onDegrade: (() => void) | null = null;

  constructor(private readonly store: FlowStore) {}

  /* -------------------------------------------------------- configuration */

  configure(opts: {
    camera: boolean;
    depth: boolean;
    nodes: AtlasFlowNode[];
    links: [ID, ID][];
    occludedLeft: number;
    occludedRight: number;
    intensity: number;
    /** Watch frame times and step down on slow devices. */
    adaptive: boolean;
    /** First appearance: nodes arrive from deep space in reveal order. */
    boot: boolean;
  }) {
    this.intensity = opts.intensity;
    if (opts.adaptive !== this.governor.on) this.governor = { on: opts.adaptive, since: performance.now() + 1500, sum: 0, n: 0, strikes: 0 };
    this.occludedLeft = opts.occludedLeft;
    this.occludedRight = opts.occludedRight;
    const wasDepth = this.depthOn;
    this.depthOn = opts.camera && opts.depth;
    this.assignBodies(opts.nodes, opts.boot && this.depthOn && !this.booted);
    if (opts.nodes.length) this.booted = true;
    this.links = opts.links.filter(([a, b]) => this.bodies.has(a) && this.bodies.has(b));
    if (wasDepth && !this.depthOn) this.flatten();
    if (opts.camera && !this.cameraOn) this.start();
    else if (!opts.camera && this.cameraOn) this.stop();
    this.lastFull = 0;
  }

  private assignBodies(nodes: AtlasFlowNode[], boot: boolean) {
    const q = this.intensity;
    const now = performance.now();
    const seen = new Set<ID>();
    const backbone = nodes.find((n) => n.type === 'helix');
    const helix = backbone?.type === 'helix' ? backbone.data.spec : null;
    this.helixSpec = helix;
    for (const n of nodes) {
      if (n.type === 'rings' || n.type === 'figure' || n.type === 'helix') continue;
      seen.add(n.id);
      const h = hash01(n.id);
      const h2 = hash01(`${n.id}:z`);
      const h3 = hash01(`${n.id}:w`);
      let kind: Kind = 'element';
      let base = 0;
      let amp = 30;
      let wander = 11;
      let spin = 0;
      let spinPeriod = 26 + h * 18;
      let spinPhase = h2 * TAU;
      let hub: ID | undefined;
      if (n.type === 'hub') {
        kind = 'hub';
        // On a figure every star is at one depth, so the figure's lines stay on all of them.
        base = (n.data.center && !n.data.onFigure ? RING_DEPTH[0] : AREA_MARKER_DEPTH) * q;
        amp = n.data.center ? 16 : 22;
        wander = n.data.center ? 5 : 9;
      } else if (n.type === 'item' && n.data.helix && helix) {
        // On the helix: at its seat's depth, turning with the whole helix about the axis.
        kind = 'item';
        base = helix.deep * helix.R * Math.cos(n.data.helix.phase) * q;
        amp = 7;
        wander = 1.5;
      } else if (n.type === 'item') {
        // Elements sit on their ring's plane and turn with it about the centre (on a figure: about their own star).
        kind = 'item';
        const ring = n.data.core ? 'core' : n.data.layer;
        hub = n.data.orbitHub ?? YOU_ID;
        base = n.data.orbitHub
          ? (AREA_MARKER_DEPTH + ELEMENT_LIFT + (ring === 'around' ? -20 : ring === 'hold' || ring === 'core' ? 20 : 0) + (h2 - 0.5) * 16) * q
          : (LAYER_DEPTH[ring] + ELEMENT_LIFT + (h2 - 0.5) * 30) * q;
        amp = 26;
        wander = 3;
        [spin, spinPeriod] = LAYER_SPIN[ring];
        spinPhase = hash01(`ring:${ring}`) * TAU;
      } else {
        base = (h2 - 0.55) * 110 * q;
      }
      const prev = this.bodies.get(n.id);
      // Reveal order, when booting: the CSS reveal delay of each node.
      const reveal = parseFloat(String((n.style as Record<string, unknown> | undefined)?.['--reveal'] ?? '0')) || 0;
      this.bodies.set(n.id, {
        kind,
        hub,
        base,
        amp: amp * q,
        period: 14 + h * 12,
        phase: h2 * TAU,
        wander: wander * q,
        f1: TAU * (0.05 + h * 0.05),
        f2: TAU * (0.08 + h3 * 0.06),
        f3: TAU * (0.04 + h2 * 0.05),
        p1: h3 * TAU,
        p2: h * TAU,
        p3: (h + h3) * TAU,
        focus: prev?.focus ?? 0,
        focusV: prev?.focusV ?? 0,
        ox: prev?.ox ?? 0,
        oy: prev?.oy ?? 0,
        vx: prev?.vx ?? 0,
        vy: prev?.vy ?? 0,
        oz: boot ? -BOOT_DEPTH * q : (prev?.oz ?? 0),
        vz: prev?.vz ?? 0,
        pullX: prev?.pullX ?? 0,
        pullY: prev?.pullY ?? 0,
        lift: prev?.lift ?? 0,
        att: prev?.att ?? 0,
        release: boot ? now + reveal : (prev?.release ?? 0),
        firingUntil: prev?.firingUntil ?? 0,
        spinAmp: (spin * Math.PI) / 180,
        spinPeriod,
        spinPhase,
        helix:
          n.type === 'item' && n.data.helix && helix
            ? {
                ...n.data.helix,
                // What is already written on the node stays true until the next frame changes it.
                flipped: prev?.helix?.flipped ?? false,
                hz: prev?.helix?.hz ?? -1,
                scanned: prev?.helix?.scanned ?? false,
              }
            : undefined,
      });
    }
    for (const id of [...this.bodies.keys()]) if (!seen.has(id)) this.bodies.delete(id);
  }

  /** The selection comes forward and the network reorganises around it; the hovered node lifts a little. */
  setFocus(selected: ID | undefined, near: Iterable<ID>, hovered: ID | null) {
    const t = new Map<ID, number>();
    const q = this.intensity;
    this.near = new Set(near);
    for (const id of this.near) t.set(id, 60 * q);
    if (hovered) t.set(hovered, Math.max(t.get(hovered) ?? 0, 40 * q));
    if (selected) t.set(selected, 130 * q);
    if (selected && selected !== this.selected) {
      const b = this.bodies.get(selected);
      if (b) b.att = Math.min(1, b.att + 0.35);
    }
    this.focusTargets = t;
    this.selected = selected;
    this.hovered = hovered;
    this.lastFull = 0;
  }

  /** Accumulated attention of a node (0–1): signals start more often from what you look at. */
  attention(id: ID) {
    return this.bodies.get(id)?.att ?? 0;
  }

  /** The node with the most attention, if any has built up. */
  topAttention(): ID | null {
    let best: ID | null = null;
    let score = 0.15;
    for (const [id, b] of this.bodies) if (b.att > score) [best, score] = [id, b.att];
    return best;
  }

  /* -------------------------------------------------------- registration */

  registerNode(id: ID, el: HTMLElement | null) {
    const prev = this.nodeEls.get(id);
    if (prev && prev !== el) {
      clearNode(prev);
      const h = this.bodies.get(id)?.helix;
      if (h) [h.flipped, h.hz, h.scanned] = [false, -1, false];
    }
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

  /** The helix backbone: drawn flat now, then projected each frame while the space is live. */
  registerHelix(svg: SVGSVGElement | null, spec: HelixSpec) {
    if (!svg) {
      if (this.helix?.spec === spec) this.helix = null;
      return;
    }
    this.helix = helixEls(svg, spec);
    this.lastFull = 0;
    if (!this.depthOn) paintHelix(this.helix, helixDrawing(spec));
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
    this.last = this.lastProject = performance.now();
    window.addEventListener('pointermove', this.onPointer, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', this.onUp, { passive: true });
    const needsPermission =
      typeof (globalThis.DeviceOrientationEvent as unknown as { requestPermission?: unknown } | undefined)?.requestPermission === 'function';
    if (typeof DeviceOrientationEvent !== 'undefined' && !needsPermission) window.addEventListener('deviceorientation', this.onTilt, { passive: true });
    this.offWave = waveBus.on(this.onWave);
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
    this.offWave?.();
    this.offWave = null;
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

  /** A signal step: the node it leaves jolts now, the nodes it reaches jolt when it arrives. */
  private onWave = (w: Wave) => {
    if (!this.depthOn) return;
    const now = performance.now();
    const s = w.strength;
    this.kicks.push({ id: w.origin, at: now, vx: 0, vy: 0, vz: 90 * s, fire: 700 });
    const lookup = this.store.getState().nodeLookup;
    const o = lookup.get(w.origin)?.internals.positionAbsolute;
    for (const id of w.reached) {
      const p = lookup.get(id)?.internals.positionAbsolute;
      let vx = 0;
      let vy = 0;
      if (o && p) {
        const dx = p.x - o.x;
        const dy = p.y - o.y;
        const d = Math.hypot(dx, dy) || 1;
        // Pushed along the direction the signal travelled.
        vx = (dx / d) * 55 * s;
        vy = (dy / d) * 55 * s;
      }
      this.kicks.push({ id, at: now + HOP_MS, vx, vy, vz: 150 * s, fire: 750 });
    }
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
    // Following the pointer is interactive (full rate); the idle sway is slow.
    const lookMoving = pointerActive && Math.abs(gx - this.camera.lx) + Math.abs(gy - this.camera.ly) > 0.002;
    this.camera.lx += (gx - this.camera.lx) * ease;
    this.camera.ly += (gy - this.camera.ly) * ease;

    if (!this.depthOn) {
      for (const fn of this.listeners) fn();
      return;
    }

    const cameraMoved = tx !== this.prevTransform[0] || ty !== this.prevTransform[1] || k !== this.prevTransform[2];
    const pointerRecent = now - this.pointer.moved < 400;
    // Full rate while you interact or something settles (pan, zoom, pointer, springs, signals);
    // ~30 fps for the idle motion alone, which is slow and smooth at that rate.
    if (!cameraMoved && !lookMoving && !pointerRecent && !this.active && !this.kicks.length && now - this.lastFull < 32) return;
    this.lastFull = now;
    this.prevTransform = [tx, ty, k];
    const pdt = Math.min(0.07, (now - this.lastProject) / 1000);
    this.lastProject = now;
    this.project(st, now, t, pdt, tx, ty, k, viewCx);
    for (const fn of this.listeners) fn();
  };

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

  private project(st: FlowState, now: number, t: number, dt: number, tx: number, ty: number, k: number, viewCx: number) {
    const q = this.intensity;
    const turn = this.helixSpec ? q * HELIX_CAMERA : q;
    const yaw = -this.camera.lx * MAX_YAW * turn;
    const pitch = this.camera.ly * MAX_PITCH * turn;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    // Zooming in brings the camera closer: perspective grows.
    const F = FOCAL * clamp(Math.sqrt(REF_ZOOM / k), 0.6, 1.7);
    // The pivot is the middle of the view; on the helix it stays on the helix's own axis, so the
    // camera turns about the helix wherever it is in view and it never swings away from its place.
    const span = this.helixSpec ? helixSpan(this.helixSpec) : null;
    const Cx = this.helixSpec ? this.helixSpec.axis : (viewCx - tx) / k;
    const Cy = span ? clamp((st.height / 2 - ty) / k, span.from, span.to) : (st.height / 2 - ty) / k;
    const px = (this.pointer.x - this.rect.left - tx) / k;
    const py = (this.pointer.y - this.rect.top - ty) / k;
    const gravity = this.pointer.inside && !this.pointer.down && now - this.pointer.moved < 4000;
    const reach = 170 / k;
    const lookup = st.nodeLookup;
    const centre = (id: ID) => {
      const n = lookup.get(id);
      return n ? { x: n.internals.positionAbsolute.x + (n.measured.width ?? 0) / 2, y: n.internals.positionAbsolute.y + (n.measured.height ?? 0) / 2 } : null;
    };
    const sel = this.selected ? centre(this.selected) : null;
    let active = false;
    /** A graph point at depth z (resting depth `base`) as seen through the camera. */
    const see = (bx: number, by: number, z: number, base: number) => {
      // Compensate for the resting depth, so the stored layout is what you see at rest.
      const m0 = FOCAL / (FOCAL - base);
      const u = bx / m0 - Cx;
      const v = by / m0 - Cy;
      const x1 = u * cy + z * sy;
      const z1 = -u * sy + z * cy;
      const y2 = v * cp - z1 * sp;
      const z2 = v * sp + z1 * cp;
      const persp = F / Math.max(F * 0.2, F - z2);
      return { X: Cx + x1 * persp, Y: Cy + y2 * persp, z2, persp, m0 };
    };
    // The helix turns back and forth about its axis as one body; the scanning ring sweeps it.
    const helix = this.helixSpec;
    this.sway = helix ? q * HELIX_SWAY * Math.sin((t * TAU) / HELIX_PERIOD) : 0;
    const scan = helix ? scanStep(helix, t) : NaN;

    // Signal impulses that are due.
    if (this.kicks.length) {
      const due = this.kicks.filter((kk) => kk.at <= now);
      this.kicks = this.kicks.filter((kk) => kk.at > now);
      for (const kk of due) {
        const b = this.bodies.get(kk.id);
        if (!b) continue;
        b.vx += kk.vx * q;
        b.vy += kk.vy * q;
        b.vz += kk.vz * q;
        b.firingUntil = now + kk.fire;
        const el = this.nodeEls.get(kk.id);
        if (el) el.dataset.firing = '';
      }
      if (this.kicks.length) active = true;
    }

    // Link coupling: neighbours pull on each other's offsets, so disturbances travel and fade.
    const fx = new Map<ID, number>();
    const fy = new Map<ID, number>();
    const fz = new Map<ID, number>();
    for (const [a, b] of this.links) {
      const A = this.bodies.get(a)!;
      const B = this.bodies.get(b)!;
      if (now < A.release || now < B.release) continue;
      const dx = (B.ox - A.ox) * K_LINK;
      const dy = (B.oy - A.oy) * K_LINK;
      const dz = (B.oz - A.oz) * K_LINK_Z;
      fx.set(a, (fx.get(a) ?? 0) + dx);
      fy.set(a, (fy.get(a) ?? 0) + dy);
      fz.set(a, (fz.get(a) ?? 0) + dz);
      fx.set(b, (fx.get(b) ?? 0) - dx);
      fy.set(b, (fy.get(b) ?? 0) - dy);
      fz.set(b, (fz.get(b) ?? 0) - dz);
    }

    for (const [id, b] of this.bodies) {
      // Focus lift (critically damped).
      const target = this.focusTargets.get(id) ?? 0;
      b.focusV += ((target - b.focus) * 55 - b.focusV * 14.8) * dt;
      b.focus += b.focusV * dt;
      if (Math.abs(target - b.focus) > 0.3 || Math.abs(b.focusV) > 0.3) active = true;

      // Attention builds while hovered and fades slowly.
      if (id === this.hovered) b.att = Math.min(1, b.att + dt * 0.2);
      b.att *= Math.exp(-dt / 150);

      // Reorganisation around the selection: neighbours draw in, others make a little room.
      let Tx = 0;
      let Ty = 0;
      if (sel && id !== this.selected) {
        const c = centre(id);
        if (c) {
          const dx = sel.x - c.x;
          const dy = sel.y - c.y;
          const d = Math.hypot(dx, dy) || 1;
          // Hubs are anchors; the helix keeps its elements close to their strands.
          const weight = (b.kind === 'hub' ? 0.35 : b.helix ? 0.3 : 1) * q;
          if (this.near.has(id)) {
            const m = Math.min(d * 0.12, 34) * weight;
            Tx = (dx / d) * m;
            Ty = (dy / d) * m;
          } else if (d < 520) {
            const m = 14 * (1 - d / 520) * weight;
            Tx = (-dx / d) * m;
            Ty = (-dy / d) * m;
          }
        }
      }

      // Springs home (plus the reorganisation target), coupling and damping.
      b.vx += ((Tx - b.ox) * K_HOME - b.vx * C_HOME + (fx.get(id) ?? 0)) * dt;
      b.vy += ((Ty - b.oy) * K_HOME - b.vy * C_HOME + (fy.get(id) ?? 0)) * dt;
      b.ox += b.vx * dt;
      b.oy += b.vy * dt;
      if (now < b.release) {
        b.oz = -BOOT_DEPTH * q; // still far away, waiting for its turn
        b.vz = 0;
        active = true;
      } else {
        b.vz += (-b.oz * K_Z - b.vz * C_Z + (fz.get(id) ?? 0)) * dt;
        b.oz += b.vz * dt;
      }
      if (Math.abs(b.vx) + Math.abs(b.vy) + Math.abs(b.vz) > 0.8 || Math.abs(Tx - b.ox) + Math.abs(Ty - b.oy) + Math.abs(b.oz) > 0.8) active = true;

      if (b.firingUntil && now > b.firingUntil) {
        b.firingUntil = 0;
        const el = this.nodeEls.get(id);
        if (el) delete el.dataset.firing;
      }
    }

    for (const [id, el] of this.nodeEls) {
      const n = lookup.get(id);
      const b = this.bodies.get(id);
      if (!n || !b) continue;
      const pos = n.internals.positionAbsolute;
      const w = n.measured.width ?? 0;
      const h = n.measured.height ?? 0;
      const hx = pos.x + w / 2;
      const hy = pos.y + h / 2;
      const ang = (t * TAU) / b.period + b.phase;

      // Organic wander: layered slow waves, never repeating quite the same path.
      let ox = b.wander * (0.6 * Math.sin(b.f1 * t + b.p1) + 0.4 * Math.sin(b.f2 * t + b.p2));
      let oy = b.wander * (0.6 * Math.cos(b.f3 * t + b.p3) + 0.4 * Math.sin(b.f1 * 0.7 * t + b.p2));
      // Elements turn with their ring about the centre (all together, like planets on one
      // plane), and breathe very slightly in and out.
      if (b.hub) {
        const c = centre(b.hub);
        if (c) {
          const rx = hx - c.x;
          const ry = hy - c.y;
          const swing = q * b.spinAmp * Math.sin((t * TAU) / b.spinPeriod + b.spinPhase);
          const breathe = 1 + 0.015 * q * Math.sin(ang * 1.1 + b.p3);
          const cs = Math.cos(swing);
          const sn = Math.sin(swing);
          ox += (rx * cs - ry * sn) * breathe - rx;
          oy += (rx * sn + ry * cs) * breathe - ry;
        }
      }
      // On the helix, the seat itself turns about the axis: across, a little up or down, and in depth.
      let depth = b.base;
      if (b.helix && helix) {
        const th = b.helix.phase + this.sway;
        ox += helix.R * (Math.sin(th) - Math.sin(b.helix.phase));
        oy += helix.tilt * helix.R * (Math.cos(th) - Math.cos(b.helix.phase));
        depth = q * helix.deep * helix.R * Math.cos(th);
      }

      const bx = hx + ox + b.ox + b.pullX;
      const by = hy + oy + b.oy + b.pullY;
      const z = depth + b.amp * Math.sin(ang) + b.focus + b.lift + b.oz + b.att * 45 * q;
      const { X, Y, persp, m0 } = see(bx, by, z, b.base);
      // Farther is smaller, but only a little: text stays readable.
      const s = clamp((persp / m0) * m0 ** 0.6, 0.66, 1.22);
      if (b.helix && helix) markHelixNode(el, b.helix, (bx - helix.axis) / m0, z, cy, sy, q * helix.deep * helix.R, scan);

      // Pointer gravity: what is near the pointer leans toward it and rises.
      let tpx = 0;
      let tpy = 0;
      let tlift = 0;
      if (gravity) {
        const gxv = px - X;
        const gyv = py - Y;
        const dist = Math.hypot(gxv, gyv);
        if (dist < reach && dist > 0.001) {
          const f = (1 - dist / reach) ** 2;
          const pull = Math.min(f * (9 / k), dist * 0.3);
          tpx = (gxv / dist) * pull;
          tpy = (gyv / dist) * pull;
          tlift = f * 45 * q;
        }
      }
      const g = Math.min(1, dt * 5);
      b.pullX += (tpx - b.pullX) * g;
      b.pullY += (tpy - b.pullY) * g;
      b.lift += (tlift - b.lift) * g;
      if (Math.abs(tpx - b.pullX) + Math.abs(tpy - b.pullY) + Math.abs(tlift - b.lift) > 0.05) active = true;

      const p = { dx: X - hx, dy: Y - hy, s };
      this.proj.set(id, p);
      setNode(el, pos.x, pos.y, p);
    }
    this.active = active;

    for (const [el, id] of this.followers) {
      const p = this.proj.get(id);
      if (p) setFollower(el, p);
    }
    for (const e of this.edgeEls.values()) this.applyEdge(e);

    // Rings: exact planes at their depth.
    const rings = lookup.get('__rings');
    if (rings && this.ringEls.size) {
      const o = rings.internals.positionAbsolute;
      for (const [i, el] of this.ringEls) {
        const z = (i === FIGURE_PLANE ? AREA_MARKER_DEPTH : (RING_DEPTH[i + 1] ?? 0)) * q;
        const m0 = FOCAL / (FOCAL - z);
        el.style.transformOrigin = `${(Cx - o.x).toFixed(2)}px ${(Cy - o.y).toFixed(2)}px`;
        el.style.transform = planeMatrix(z, m0, -Cx * (1 - 1 / m0), -Cy * (1 - 1 / m0), cy, sy, cp, sp, F);
      }
    }

    // The helix backbone: every strand point through the same camera as the elements on it.
    if (this.helix) {
      paintHelix(
        this.helix,
        helixDrawing(
          this.helix.spec,
          this.sway,
          (x, y, d, rest) => {
            const p = see(x, y, q * d, q * rest);
            return { x: p.X, y: p.Y, z: p.z2 };
          },
          scan,
        ),
      );
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
    for (const el of this.nodeEls.values()) {
      clearNode(el);
      delete el.dataset.firing;
    }
    for (const el of this.followers.keys()) clearNode(el);
    for (const e of this.edgeEls.values()) {
      if (e.svg) e.svg.style.transform = '';
      if (e.html) e.html.style.transform = '';
    }
    for (const el of this.ringEls.values()) el.style.transform = '';
    for (const b of this.bodies.values()) if (b.helix) [b.helix.flipped, b.helix.hz, b.helix.scanned] = [false, -1, false];
    this.sway = 0;
    if (this.helix) paintHelix(this.helix, helixDrawing(this.helix.spec));
    this.proj.clear();
    this.kicks = [];
  }
}

/**
 * What the helix writes on an element as it turns: its name moves to the other
 * side while it is across the axis, it dims toward the back (--hz, 0 far to 1
 * near), and it lights as the scanning ring passes its base pair. Written only
 * when something changes. `rx` is its offset from the axis before perspective.
 */
function markHelixNode(el: HTMLElement, h: NonNullable<Body['helix']>, rx: number, z: number, cy: number, sy: number, radius: number, scan: number) {
  const across = (rx * cy + z * sy) * h.side;
  const flipped = h.flipped ? across < 4 : across < -4;
  if (flipped !== h.flipped) {
    h.flipped = flipped;
    if (flipped) el.dataset.flip = '';
    else delete el.dataset.flip;
  }
  const near = -rx * sy + z * cy;
  const hz = Math.round(clamp(0.5 + (0.5 * near) / (radius || 1), 0, 1) * 20) / 20;
  if (hz !== h.hz) {
    h.hz = hz;
    el.style.setProperty('--hz', String(hz));
  }
  const scanned = Math.abs(h.slot - scan) < 0.45;
  if (scanned !== h.scanned) {
    h.scanned = scanned;
    if (scanned) el.dataset.scan = '';
    else delete el.dataset.scan;
  }
}

function helixEls(svg: SVGSVGElement, spec: HelixSpec): HelixEls {
  const paths = new Map<string, SVGPathElement>();
  const texts = new Map<string, SVGTextElement>();
  svg.querySelectorAll<SVGPathElement>('path[data-part]').forEach((p) => paths.set(p.dataset.part!, p));
  svg.querySelectorAll<SVGTextElement>('text[data-part]').forEach((p) => texts.set(p.dataset.part!, p));
  return { spec, svg, paths, texts, emitter: svg.querySelector<SVGEllipseElement>('ellipse[data-part]') };
}

/** Writes a drawing of the helix into its SVG. */
export function paintHelix(els: Pick<HelixEls, 'paths' | 'texts' | 'emitter'>, d: HelixDrawing) {
  const path = (key: string, value: string) => els.paths.get(key)?.setAttribute('d', value);
  for (const s of [0, 1] as const) {
    path(`front-${s}`, d.front[s]);
    path(`glow-${s}`, d.front[s]);
    path(`back-${s}`, d.back[s]);
  }
  path('rungs', d.rungs);
  path('rings', d.rings);
  path('axis', d.axis);
  path('scan', d.scan);
  path('beam', d.beam);
  els.emitter?.setAttribute('cx', d.emitter.x.toFixed(1));
  els.emitter?.setAttribute('cy', d.emitter.y.toFixed(1));
  const place = (key: string, p: { x: number; y: number }, anchor?: string) => {
    const el = els.texts.get(key);
    if (!el) return;
    el.setAttribute('x', p.x.toFixed(1));
    el.setAttribute('y', p.y.toFixed(1));
    if (anchor) el.setAttribute('text-anchor', anchor);
  };
  place('lead', d.lead);
  place('follow', d.follow);
  place('inner', d.strands[0], d.strands[0].anchor);
  place('around', d.strands[1], d.strands[1].anchor);
  place('empty', d.centre);
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
  el.style.removeProperty('--hz');
  delete el.dataset.flip;
  delete el.dataset.scan;
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

/** Ref for the helix backbone's SVG: drawn flat, or by the engine while the space is live. */
export function useSpaceHelix(spec: HelixSpec) {
  const space = useSpace();
  return useCallback(
    (el: SVGSVGElement | null) => {
      if (space) space.registerHelix(el, spec);
      else if (el) paintHelix(helixEls(el, spec), helixDrawing(spec));
    },
    [space, spec],
  );
}
