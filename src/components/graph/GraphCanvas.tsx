import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  useStoreApi,
  ViewportPortal,
  type Connection,
  type CoordinateExtent,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  type Viewport,
  type FitViewOptions,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GraphLayer, ID } from '../../domain/types';
import type { BuiltGraph } from '../../graph/build';
import { BACKDROP_IDS, isBackdrop, type AtlasFlowNode, type SemanticEdge } from '../../graph/types';
import { HOP_MS, MAX_ACTIVE_PULSES, MAX_IDLE_PULSES, MotionContext, waveBus, type MotionSettings } from '../../graph/motion';
import { SPACE_MAX_NODES, SpaceContext, SpaceEngine, spaceHealth } from '../../graph/space';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { isTyping } from '../../lib/dom';
import { FOCUS_REQUEST_TTL, toast, useUI } from '../../state/uiStore';
import { EdgePopover } from './EdgePopover';
import { HelixNodeView } from './nodes/HelixNode';
import { HubNodeView } from './nodes/HubNode';
import { ItemNodeView } from './nodes/ItemNode';
import { RingsNodeView } from './nodes/RingsNode';
import { FigureNodeView } from './nodes/FigureNode';
import { RelationPicker } from './RelationPicker';
import { NodeProbe } from './NodeProbe';
import { Reticle } from './Reticle';
import { carriesInfluence, EdgeMarkers, SemanticEdgeView } from './SemanticEdge';
import { SpaceField } from './SpaceField';
import { t } from '../../i18n';

const nodeTypes: NodeTypes = {
  hub: HubNodeView,
  item: ItemNodeView,
  rings: RingsNodeView,
  figure: FigureNodeView,
  helix: HelixNodeView,
};
const edgeTypes: EdgeTypes = { semantic: SemanticEdgeView };

const MINIMAP_COLORS: Record<string, string> = { hub: '#5b6572', item: '#3a424c' };

/** Structure, not influence: carries no pulses and does not count as a connection. */
const isStructural = (e: SemanticEdge) => e.data?.family === 'member' || (e.data?.family === 'link' && e.data.linkType === 'part_of');

export interface GraphCanvasProps {
  layer: GraphLayer;
  built: BuiltGraph;
  selectedId?: ID;
  onSelect(id: ID | null): void;
  onNodeDoubleClick?(id: ID): void;
  /** Right-edge space covered by an open panel, so auto-follow keeps nodes visible. */
  occludedRight?: number;
  minimap?: boolean;
  fitPadding?: FitViewOptions['padding'];
  /** Changing this refits the view (e.g. when a card starts or stops covering part of the map). */
  refitKey?: string;
  /** Lower bound for the automatic fit, so text stays readable on small screens. */
  fitMinZoom?: number;
  draggable?: boolean;
  /** Restore and save the viewport. Off on phones, where desktop viewports do not fit. */
  persistViewport?: boolean;
  /** Left-edge space covered by an overlay panel. */
  occludedLeft?: number;
  /**
   * The living graph: deep-space parallax, breathing, flow pulses, periodic
   * activity, staged reveal, elastic neighbours and camera glides.
   */
  living?: boolean;
  /**
   * How far the view may zoom out, as a share of the zoom at which the whole
   * content fits the free part of the view (e.g. 0.7): a scene that is one
   * object, like the Causes helix, never shrinks to a speck.
   */
  zoomOutToFit?: number;
  /** Where dragged positions go, instead of the layer's own arrangement (a Map shape keeps its own). */
  savePositions?: (positions: Record<string, { x: number; y: number }>) => void;
  children?: ReactNode;
}

const MIN_ZOOM = 0.12;

/** The extent of what the view fits to (node centres, centred origin), backdrops aside except the helix, which is its own content. */
function contentBox(nodes: AtlasFlowNode[]): { x: number; y: number; width: number; height: number } | null {
  let [x0, y0, x1, y1] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const n of nodes) {
    if (n.type === 'rings' || n.type === 'figure') continue;
    const w = n.type === 'helix' ? n.data.spec.width : (n.measured?.width ?? 26);
    const h = n.type === 'helix' ? n.data.spec.height : (n.measured?.height ?? 26);
    x0 = Math.min(x0, n.position.x - w / 2);
    x1 = Math.max(x1, n.position.x + w / 2);
    y0 = Math.min(y0, n.position.y - h / 2);
    y1 = Math.max(y1, n.position.y + h / 2);
  }
  return x1 > x0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

/**
 * d3-zoom's own rule for a translate extent, for moves made by hand (the glide): the view stays
 * inside the extent, or centres on it where the extent is the smaller of the two.
 */
function keepInside(vp: Viewport, w: number, h: number, ext: CoordinateExtent | undefined): Viewport {
  if (!ext || !w || !h) return vp;
  const k = vp.zoom;
  const dx0 = -vp.x / k - ext[0][0];
  const dx1 = (w - vp.x) / k - ext[1][0];
  const dy0 = -vp.y / k - ext[0][1];
  const dy1 = (h - vp.y) / k - ext[1][1];
  const tx = dx1 > dx0 ? (dx0 + dx1) / 2 : Math.min(0, dx0) || Math.max(0, dx1);
  const ty = dy1 > dy0 ? (dy0 + dy1) / 2 : Math.min(0, dy0) || Math.max(0, dy1);
  return tx || ty ? { x: vp.x + k * tx, y: vp.y + k * ty, zoom: k } : vp;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** Neighbours pulled along by a drag: offset, velocity and how strongly each follows. */
interface Spring {
  dragId: ID | null;
  origin: { x: number; y: number };
  dx: number;
  dy: number;
  items: Map<ID, { bx: number; by: number; w: number; ox: number; oy: number; vx: number; vy: number }>;
  raf: number;
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({
  layer,
  built,
  selectedId,
  onSelect,
  onNodeDoubleClick,
  occludedRight = 0,
  minimap,
  fitPadding = 0.12,
  refitKey,
  fitMinZoom,
  draggable = true,
  persistViewport = true,
  occludedLeft = 0,
  living = false,
  zoomOutToFit,
  savePositions,
  children,
}: GraphCanvasProps) {
  const rf = useReactFlow<AtlasFlowNode, SemanticEdge>();
  const store = useStoreApi<AtlasFlowNode, SemanticEdge>();
  const wrapper = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const setPositions = useUI((s) => s.setPositions);
  const setViewport = useUI((s) => s.setViewport);
  const focusRequest = useUI((s) => s.focusRequest);
  const [initialViewport] = useState<Viewport | undefined>(() => (persistViewport ? useUI.getState().layouts[layer].viewport : undefined));
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const idleShare = Math.min(1, MAX_IDLE_PULSES / Math.max(1, built.edges.filter((e) => !e.data?.secondary && carriesInfluence(e.data)).length));
  const activeShare = Math.min(1, MAX_ACTIVE_PULSES / Math.max(1, built.edges.filter((e) => e.data?.active).length));
  const motion = useMemo<MotionSettings>(() => ({ living, reduced, idleShare, activeShare }), [living, reduced, idleShare, activeShare]);
  const [hovered, setHovered] = useState<ID | null>(null);
  const [probe, setProbe] = useState<ID | null>(null);
  const [dragging, setDragging] = useState(false);
  const canHover = useMediaQuery('(hover: hover) and (pointer: fine)');
  // The staged reveal runs once per mount, then the class is removed so later changes appear immediately.
  const [revealing, setRevealing] = useState(living && !reduced);
  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(() => setRevealing(false), 1700);
    return () => clearTimeout(t);
  }, [revealing]);

  const [nodes, setNodes] = useState<AtlasFlowNode[]>(built.nodes);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  /** Set by keyboard travel so the camera follows the next selection. */
  const travelled = useRef<ID | null>(null);

  // The graph as a 3D space: node depths, a turning camera, focus lift and pointer gravity.
  const space = useMemo(() => new SpaceEngine(store), [store]);
  // Foreground: the viewfinder is the nearest plane, so it slides against the camera's turn.
  const finder = useRef<HTMLDivElement>(null);
  useEffect(
    () =>
      space.subscribe(() => {
        const el = finder.current;
        if (el) el.style.translate = `${(-space.camera.lx * 14).toFixed(1)}px ${(-space.camera.ly * 10).toFixed(1)}px`;
      }),
    [space],
  );
  const spaceMode = useUI((s) => s.spaceMode);
  const [degraded, setDegraded] = useState(spaceHealth.degraded);
  useEffect(() => {
    space.onDegrade = () => {
      setDegraded(true);
      toast(t('Depth paused to keep this device smooth. Settings → Space can turn it back on.'));
    };
    return () => void (space.onDegrade = null);
  }, [space]);
  const spaceOn = living && !reduced;
  const depthOn = spaceOn && built.nodes.length <= SPACE_MAX_NODES && spaceMode !== 'off' && !(spaceMode === 'auto' && degraded);
  useEffect(() => {
    space.configure({
      camera: spaceOn,
      depth: depthOn,
      nodes: built.nodes,
      links: built.edges.map((e) => [e.source, e.target] as [ID, ID]),
      occludedLeft,
      occludedRight,
      intensity: isDesktop ? 1 : 0.55,
      adaptive: spaceMode === 'auto',
      boot: revealing,
    });
    // `revealing` only matters on the first pass; it must not re-run the configuration when it ends.
  }, [space, spaceOn, depthOn, built.nodes, built.edges, occludedLeft, occludedRight, isDesktop, spaceMode]);
  useEffect(() => () => space.stop(), [space]);
  useEffect(() => {
    space.setFocus(
      selectedId,
      built.nodes.filter((n) => n.className === 'is-near').map((n) => n.id),
      hovered,
    );
  }, [space, selectedId, built.nodes, hovered]);

  // Whether the view is still the automatic fit. A fitted view stays fitted when side panels open
  // or close; once you pan, zoom or a selection moves the camera, the view is yours and stays put.
  const fitted = useRef(!initialViewport);

  // Momentum: a thrown pan keeps drifting and slows down, as things do in space.
  const momentum = useRef({ dragging: false, samples: [] as { t: number; x: number; y: number }[], raf: 0 });
  /** Where panning may go (set below with the zoom-out limit); the glide keeps to it too. */
  const extentRef = useRef<CoordinateExtent | undefined>(undefined);
  const onMoveStart = useCallback((e: MouseEvent | TouchEvent | null) => {
    if (!e) return;
    fitted.current = false;
    const m = momentum.current;
    cancelAnimationFrame(m.raf);
    m.raf = 0;
    m.dragging = e.type === 'mousedown' || e.type === 'pointerdown' || e.type === 'touchstart';
    m.samples = [];
  }, []);
  const onMove = useCallback((e: MouseEvent | TouchEvent | null, vp: Viewport) => {
    const m = momentum.current;
    if (!e || !m.dragging) return;
    // Event timestamps, not callback times, so slow frames do not distort the throw.
    m.samples.push({ t: e.timeStamp, x: vp.x, y: vp.y });
    if (m.samples.length > 8) m.samples.shift();
  }, []);
  const onMoveEnd = useCallback(
    (e: MouseEvent | TouchEvent | null, vp: Viewport) => {
      const m = momentum.current;
      if (m.raf) return; // the glide saves the viewport when it settles
      if (persistViewport) setViewport(layer, vp);
      if (!e || !m.dragging || !living || reduced) return;
      m.dragging = false;
      const now = e.timeStamp;
      // Only a release while still moving throws; stopping first and then letting go does not.
      const recent = m.samples.filter((p) => now - p.t < 160);
      if (recent.length < 2 || now - recent[recent.length - 1].t > 100) return;
      const a = recent[0];
      const b = recent[recent.length - 1];
      let vx = (b.x - a.x) / Math.max(1, b.t - a.t);
      let vy = (b.y - a.y) / Math.max(1, b.t - a.t);
      const speed = Math.hypot(vx, vy);
      if (speed < 0.3) return;
      // Capped, so a hard flick drifts a long way but never flies off the map.
      const cap = Math.min(1, 2.4 / speed);
      vx *= cap;
      vy *= cap;
      let { x, y } = vp;
      let last = performance.now();
      const step = (t: number) => {
        const dt = Math.min(32, t - last);
        last = t;
        x += vx * dt;
        y += vy * dt;
        const decay = Math.exp(-dt / 300);
        vx *= decay;
        vy *= decay;
        const kept = keepInside({ x, y, zoom: vp.zoom }, store.getState().width, store.getState().height, extentRef.current);
        // At the edge of where the view may go, the glide stops there.
        if (kept.x !== x || kept.y !== y) [x, y, vx, vy] = [kept.x, kept.y, 0, 0];
        rf.setViewport({ x, y, zoom: vp.zoom });
        if (Math.hypot(vx, vy) > 0.02) m.raf = requestAnimationFrame(step);
        else {
          m.raf = 0;
          if (persistViewport) setViewport(layer, rf.getViewport());
        }
      };
      m.raf = requestAnimationFrame(step);
    },
    [persistViewport, setViewport, layer, living, reduced, rf, store],
  );
  useEffect(() => () => cancelAnimationFrame(momentum.current.raf), []);
  const fitOptionsRef = useRef<FitViewOptions>({ padding: fitPadding });
  const [pending, setPending] = useState<{ source: ID; target: ID; x: number; y: number } | null>(null);
  const [edgeMenu, setEdgeMenu] = useState<{ edgeId: string; x: number; y: number } | null>(null);

  // Rebuilt nodes replace local ones, keeping measured sizes so edges never flicker.
  useEffect(() => {
    setNodes((prev) => {
      const measured = new Map(prev.map((n) => [n.id, n.measured]));
      return built.nodes.map((n) => (measured.get(n.id) ? ({ ...n, measured: measured.get(n.id) } as AtlasFlowNode) : n));
    });
  }, [built.nodes]);

  const onNodesChange = useCallback((changes: NodeChange<AtlasFlowNode>[]) => {
    const relevant = changes.filter((c) => c.type === 'position' || c.type === 'dimensions');
    if (relevant.length) setNodes((nds) => applyNodeChanges(relevant, nds));
  }, []);

  // Elastic neighbours: while a node is dragged, the nodes it connects to lean after it on
  // springs, then settle back to their own places. Only the dragged node's position is saved.
  const spring = useRef<Spring>({ dragId: null, origin: { x: 0, y: 0 }, dx: 0, dy: 0, items: new Map(), raf: 0 });
  const edgesRef = useRef(built.edges);
  edgesRef.current = built.edges;
  const runSpring = useCallback(() => {
    const s = spring.current;
    if (s.raf) return;
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(0.032, (now - last) / 1000);
      last = now;
      let moving = s.dragId !== null;
      for (const it of s.items.values()) {
        const tx = s.dragId ? s.dx * it.w : 0;
        const ty = s.dragId ? s.dy * it.w : 0;
        it.vx += ((tx - it.ox) * 170 - it.vx * 17) * dt;
        it.vy += ((ty - it.oy) * 170 - it.vy * 17) * dt;
        it.ox += it.vx * dt;
        it.oy += it.vy * dt;
        if (Math.abs(it.ox - tx) + Math.abs(it.oy - ty) > 0.25 || Math.abs(it.vx) + Math.abs(it.vy) > 0.5) moving = true;
      }
      if (!moving) for (const it of s.items.values()) it.ox = it.oy = 0;
      const items = s.items;
      setNodes((nds) =>
        nds.map((n) => {
          const it = items.get(n.id);
          return it ? { ...n, position: { x: it.bx + it.ox, y: it.by + it.oy } } : n;
        }),
      );
      if (moving) s.raf = requestAnimationFrame(step);
      else {
        s.raf = 0;
        s.items = new Map();
      }
    };
    s.raf = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(spring.current.raf), []);

  const onNodeDragStart = useCallback(
    (_: unknown, node: AtlasFlowNode) => {
      setDragging(true);
      setProbe(null);
      if (!living || reduced) return;
      const s = spring.current;
      // A new drag while the last one is still settling: those neighbours go straight home,
      // and their home (not their current, displaced position) is what the new drag starts from.
      const settling = s.items;
      if (settling.size)
        setNodes((nds) => nds.map((n) => (settling.has(n.id) ? { ...n, position: { x: settling.get(n.id)!.bx, y: settling.get(n.id)!.by } } : n)));
      const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
      s.items = new Map();
      for (const e of edgesRef.current) {
        const other = e.source === node.id ? e.target : e.target === node.id ? e.source : null;
        const n = other ? byId.get(other) : undefined;
        // Hubs are anchors: they never lean toward a dragged satellite.
        if (!n || n.type === 'hub' || isBackdrop(n) || s.items.has(n.id)) continue;
        const home = settling.get(n.id);
        s.items.set(n.id, { bx: home?.bx ?? n.position.x, by: home?.by ?? n.position.y, w: node.type === 'hub' ? 0.32 : 0.2, ox: 0, oy: 0, vx: 0, vy: 0 });
      }
      s.dragId = node.id;
      s.origin = { ...node.position };
      s.dx = s.dy = 0;
      if (s.items.size) runSpring();
    },
    [living, reduced, runSpring],
  );

  const onNodeDrag = useCallback((_: unknown, node: AtlasFlowNode) => {
    const s = spring.current;
    if (s.dragId !== node.id) return;
    s.dx = node.position.x - s.origin.x;
    s.dy = node.position.y - s.origin.y;
  }, []);

  const onNodeDragStop = useCallback(
    (_: unknown, __: AtlasFlowNode, dragged: AtlasFlowNode[]) => {
      setDragging(false);
      spring.current.dragId = null;
      const positions = Object.fromEntries(dragged.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }]));
      if (savePositions) savePositions(positions);
      else setPositions(layer, positions);
    },
    [layer, setPositions, savePositions],
  );

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const rect = wrapper.current?.getBoundingClientRect();
    setPending({ source: c.source, target: c.target, x: pointer.current.x - (rect?.left ?? 0), y: pointer.current.y - (rect?.top ?? 0) });
  }, []);

  const isValidConnection = useCallback((c: Connection | SemanticEdge) => {
    const bad = (id: string | null | undefined) => !id || BACKDROP_IDS.has(id) || id.startsWith('pat');
    return c.source !== c.target && !bad(c.source) && !bad(c.target);
  }, []);

  // One-shot "focus this node" requests from the inspector, search or palette.
  useEffect(() => {
    if (!focusRequest || Date.now() - focusRequest.at > FOCUS_REQUEST_TTL) return;
    const n = nodes.find((x) => x.id === focusRequest.id);
    if (!n) return;
    // Wait a frame so an initial fit (on a freshly mounted canvas) does not override the focus.
    const raf = requestAnimationFrame(() => {
      const zoom = Math.max(rf.getZoom(), 0.9);
      fitted.current = false;
      rf.setCenter(n.position.x + occludedRight / 2 / zoom, n.position.y, { zoom, duration: 500 });
    });
    return () => cancelAnimationFrame(raf);
    // Only react to new requests, not to node changes.
  }, [focusRequest]);

  // Follow the selection when it lands off-screen (e.g. drilling down in the panel).
  useEffect(() => {
    if (!selectedId || !wrapper.current) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (!n) return;
    const { x, y, zoom } = rf.getViewport();
    const rect = wrapper.current.getBoundingClientRect();
    // Centre within the visible area between any side panels.
    const centre = (z: number) => n.position.x + (occludedRight - occludedLeft) / 2 / z;
    if (travelled.current === selectedId) {
      // Keyboard travel: the camera flies to each node in turn.
      travelled.current = null;
      fitted.current = false;
      rf.setCenter(centre(zoom), n.position.y, { zoom, duration: reduced ? 0 : 560, ease: easeInOutCubic });
      return;
    }
    if (living && n.type === 'hub') {
      // Navigating to an area: a gentle glide that brings its marker and sector into view.
      const target = Math.min(1.05, Math.max(zoom, 0.78));
      fitted.current = false;
      rf.setCenter(centre(target), n.position.y, { zoom: target, duration: reduced ? 0 : 900, ease: easeInOutCubic });
      return;
    }
    const sx = n.position.x * zoom + x;
    const sy = n.position.y * zoom + y;
    const margin = 80;
    if (sx < occludedLeft + margin || sx > rect.width - occludedRight - margin || sy < margin || sy > rect.height - margin) {
      fitted.current = false;
      rf.setCenter(centre(zoom), n.position.y, { zoom, duration: reduced ? 0 : 600, ease: easeInOutCubic });
    }
  }, [selectedId]);

  // Side panels opening or closing change the visible area. A view that is still the automatic fit
  // refits when room is given back (so closing the panel never leaves the map pushed to one side); a
  // view you have moved stays where you put it, except that the overview's own toggle keeps its centre.
  const occlusion = useRef({ left: occludedLeft, right: occludedRight });
  useEffect(() => {
    const prev = occlusion.current;
    occlusion.current = { left: occludedLeft, right: occludedRight };
    const dL = occludedLeft - prev.left;
    const dR = occludedRight - prev.right;
    if (!dL && !dR) return;
    if (fitted.current) {
      // Opening the inspector leaves the view alone (shrinking the map to fit beside it would make
      // everything tiny); closing it, or toggling the overview, refits to the room there is.
      if (dR <= 0) rf.fitView({ ...fitOptionsRef.current, duration: reduced ? 0 : 420 });
    } else if (dL && !dR) {
      const vp = rf.getViewport();
      rf.setViewport({ ...vp, x: vp.x + dL / 2 }, { duration: reduced ? 0 : 420 });
    }
  }, [occludedLeft, occludedRight]);

  const refitted = useRef(refitKey);
  useEffect(() => {
    if (refitted.current === refitKey) return;
    refitted.current = refitKey;
    fitted.current = true;
    // Once nodes rebuilt for the same change are in place (they arrive a render later).
    const timer = setTimeout(() => rf.fitView({ ...fitOptionsRef.current, duration: reduced ? 0 : 500 }), 60);
    return () => clearTimeout(timer);
  }, [refitKey]);

  // The network thinks: every few seconds a signal leaves one node (a domain in Orbit, a
  // well-connected thought in Mind) and travels up to three links outward, one hop at a time,
  // firing each node it reaches. Origins are weighted by attention, so the system keeps coming
  // back to what you have been looking at; with a selection it stays in that neighbourhood.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    if (!living || reduced) return;
    let timer = 0;
    let cycle = 0;
    const steps = new Set<number>();
    const schedule = () => {
      timer = window.setTimeout(fire, 7000 + Math.random() * 5000);
    };
    const fire = () => {
      if (!document.hidden) {
        // Signals travel only along possible reasons your notes show: never along links, summaries or hunches.
        const edges = edgesRef.current.filter((e) => !e.data?.dim && carriesInfluence(e.data));
        const adj = new Map<ID, { id: ID; structural: boolean }[]>();
        const link = (a: ID, b: ID, structural: boolean) => {
          if (!adj.has(a)) adj.set(a, []);
          adj.get(a)!.push({ id: b, structural });
        };
        const degree = new Map<ID, number>();
        for (const e of edges) {
          const structural = isStructural(e);
          link(e.source, e.target, structural);
          link(e.target, e.source, structural);
          if (!structural) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
        }
        const origins = [...degree.keys()].filter((id) => degree.get(id)! >= 2);
        const pool = selectedRef.current ? origins.filter((h) => edges.some((e) => (e.source === h || e.target === h) && e.data?.active)) : origins;
        const weights = pool.map((id) => 1 + 4 * space.attention(id));
        let r = Math.random() * weights.reduce((a, b) => a + b, 0);
        const origin = pool.find((_, i) => (r -= weights[i]) <= 0) ?? pool[0];
        if (origin) {
          cycle++;
          // Breadth-first, a few branches per node, relationships before structure.
          const visited = new Set<ID>([origin]);
          const hops: { origin: ID; reached: ID[] }[][] = [];
          let frontier = [origin];
          for (let hop = 0; hop < 3 && frontier.length && visited.size < 14; hop++) {
            const step: { origin: ID; reached: ID[] }[] = [];
            const next: ID[] = [];
            for (const from of frontier) {
              const options = (adj.get(from) ?? [])
                .filter((o) => !visited.has(o.id))
                .sort((a, b) => Number(a.structural) - Number(b.structural) || Math.random() - 0.5);
              const reached = [...new Set(options.slice(0, hop === 0 ? 5 : 2).map((o) => o.id))];
              reached.forEach((id) => visited.add(id));
              if (reached.length) {
                step.push({ origin: from, reached });
                next.push(...reached);
              }
              if (visited.size >= 14) break;
            }
            if (step.length) hops.push(step);
            frontier = next.slice(0, 4);
          }
          hops.forEach((step, hop) => {
            const t = window.setTimeout(() => {
              steps.delete(t);
              for (const s of step) waveBus.emit({ ...s, at: Date.now(), strength: 0.8 * 0.72 ** hop, kind: 'cascade', hop });
            }, hop * HOP_MS);
            steps.add(t);
          });
        }
      }
      schedule();
    };
    timer = window.setTimeout(fire, 2600);
    return () => {
      clearTimeout(timer);
      for (const t of steps) clearTimeout(t);
    };
  }, [living, reduced, layer, space]);

  // Hovering a node for a moment opens a quick look at it (pointer devices only).
  useEffect(() => {
    if (!hovered || hovered === selectedId || dragging || !canHover) {
      setProbe(null);
      return;
    }
    const t = setTimeout(() => setProbe(hovered), 380);
    return () => clearTimeout(t);
  }, [hovered, selectedId, dragging, canHover]);

  // Arrow keys travel along connections: to the linked node that lies most nearly in that
  // direction, or failing that the nearest node that way. With nothing selected, start near the middle.
  const travel = useCallback(
    (dx: number, dy: number) => {
      const all = nodesRef.current.filter((n) => !isBackdrop(n));
      const current = all.find((n) => n.id === selectedRef.current);
      let next: AtlasFlowNode | undefined;
      if (!current) {
        const rect = wrapper.current?.getBoundingClientRect();
        if (!rect) return;
        const { x, y, zoom } = rf.getViewport();
        const cx = (rect.width / 2 + (occludedLeft - occludedRight) / 2 - x) / zoom;
        const cy = (rect.height / 2 - y) / zoom;
        let best = Infinity;
        for (const n of all) {
          const d = Math.hypot(n.position.x - cx, n.position.y - cy);
          if (d < best) [best, next] = [d, n];
        }
      } else {
        const pick = (pool: AtlasFlowNode[]) => {
          let best = Infinity;
          let found: AtlasFlowNode | undefined;
          for (const n of pool) {
            const vx = n.position.x - current.position.x;
            const vy = n.position.y - current.position.y;
            const dist = Math.hypot(vx, vy) || 1;
            const cos = (vx * dx + vy * dy) / dist;
            if (cos < 0.35) continue;
            const score = dist * (1 + 1.6 * (1 - cos));
            if (score < best) [best, found] = [score, n];
          }
          return found;
        };
        const linked = new Set(edgesRef.current.flatMap((e) => (e.source === current.id ? [e.target] : e.target === current.id ? [e.source] : [])));
        next = pick(all.filter((n) => linked.has(n.id))) ?? pick(all.filter((n) => n.id !== current.id));
      }
      if (!next) return;
      travelled.current = next.id;
      setProbe(null);
      onSelect(next.id);
    },
    [rf, onSelect, occludedLeft, occludedRight],
  );

  // Hover highlights a node's direct connections without rebuilding the graph.
  const edges = useMemo(() => {
    if (!hovered) return built.edges;
    return built.edges.map((e) =>
      e.source === hovered || e.target === hovered ? { ...e, className: cn(e.className, 'is-hover'), zIndex: 1, data: { ...e.data!, hover: true } } : e,
    );
  }, [built.edges, hovered]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'f') {
        fitted.current = true;
        rf.fitView({ ...fitOptionsRef.current, duration: 400 });
      } else if (e.key === '=' || e.key === '+') rf.zoomIn({ duration: 200 });
      else if (e.key === '-') rf.zoomOut({ duration: 200 });
      else if (e.key === 'Enter' && document.activeElement?.classList.contains('react-flow__node')) {
        const id = document.activeElement.getAttribute('data-id');
        if (id && !BACKDROP_IDS.has(id)) onSelect(id);
      }
    };
    // Arrows are taken in the capture phase so React Flow's own "nudge the focused node" never runs.
    const onArrow = (e: KeyboardEvent) => {
      const dir = ARROWS[e.key];
      if (!dir || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const active = document.activeElement;
      if (active && active !== document.body && !active.closest('.react-flow')) return;
      if (!wrapper.current?.isConnected) return;
      e.preventDefault();
      e.stopPropagation();
      travel(dir[0], dir[1]);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keydown', onArrow, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keydown', onArrow, true);
    };
  }, [rf, onSelect, travel]);

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : undefined;
  const helix = built.nodes.some((n) => n.type === 'helix');

  const labelsFor = useMemo(() => new Map(built.nodes.map((n) => [n.id, n])), [built.nodes]);
  // Fit to the content, not to decorative backdrops such as the orbit rings. The helix's box is
  // its content: the whole chain, with room for the names beside it.
  const fitOptions = useMemo(
    () => ({
      padding: fitPadding,
      minZoom: fitMinZoom,
      nodes: built.nodes.filter((n) => n.type !== 'rings' && n.type !== 'figure').map((n) => ({ id: n.id })),
    }),
    [built.nodes, fitPadding, fitMinZoom],
  );
  fitOptionsRef.current = fitOptions;

  // The zoom-out limit follows the room there is: side panels opening give a little more.
  const viewWidth = useStore((s) => s.width);
  const viewHeight = useStore((s) => s.height);
  // Panning stops before it loses the content: at the widest zoom it can slide about a third of the
  // view either way, never out of it.
  const { minZoom, translateExtent } = useMemo((): { minZoom: number; translateExtent?: CoordinateExtent } => {
    const box = zoomOutToFit ? contentBox(built.nodes) : null;
    const room = viewWidth - occludedLeft - occludedRight;
    if (!box || room <= 0 || !viewHeight) return { minZoom: MIN_ZOOM };
    const floor = Math.min(1, Math.max(MIN_ZOOM, Math.min(room / box.width, viewHeight / box.height) * zoomOutToFit!));
    const mx = (viewWidth / floor) * 0.35;
    const my = (viewHeight / floor) * 0.35;
    return {
      minZoom: floor,
      translateExtent: [
        [box.x - mx, box.y - my],
        [box.x + box.width + mx, box.y + box.height + my],
      ],
    };
  }, [zoomOutToFit, built.nodes, viewWidth, viewHeight, occludedLeft, occludedRight]);
  extentRef.current = translateExtent;

  return (
    <MotionContext.Provider value={motion}>
      <SpaceContext.Provider value={space}>
        <div
          ref={wrapper}
          className={cn(
            'relative h-full w-full',
            living && 'atlas-living',
            living && nodes.length > SPACE_MAX_NODES && 'atlas-dense',
            depthOn && 'atlas-3d',
            revealing && 'atlas-reveal',
            helix && 'lens-helix',
          )}
          onPointerMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
        >
          <EdgeMarkers />
          {living && <SpaceField reduced={reduced} camera={space.camera} lite={!depthOn} />}
          {/* Viewfinder: registration marks framing the free part of the view. */}
          {living && isDesktop && (
            <div
              ref={finder}
              className="ticks pointer-events-none absolute z-[1] transition-[left,right] duration-200 [--tick-color:rgb(236_232_223/0.24)] [--tick:16px]"
              style={{ left: occludedLeft + 14, right: occludedRight + 14, top: 58, bottom: 14 }}
              aria-hidden
            />
          )}
          <ReactFlow<AtlasFlowNode, SemanticEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            nodeOrigin={[0.5, 0.5]}
            onNodesChange={onNodesChange}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, n) => !isBackdrop(n) && onSelect(n.id)}
            onNodeDoubleClick={(_, n) => onNodeDoubleClick?.(n.id)}
            onNodeMouseEnter={(_, n) => !isBackdrop(n) && setHovered(n.id)}
            onNodeMouseLeave={() => setHovered(null)}
            onPaneClick={() => {
              setEdgeMenu(null);
              setPending(null);
              onSelect(null);
            }}
            onEdgeClick={(e, edge) => {
              const rect = wrapper.current?.getBoundingClientRect();
              setEdgeMenu({ edgeId: edge.id, x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) });
            }}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            connectionMode={ConnectionMode.Loose}
            onMoveStart={onMoveStart}
            onMove={onMove}
            onMoveEnd={onMoveEnd}
            defaultViewport={initialViewport}
            fitView={!initialViewport}
            fitViewOptions={fitOptions}
            minZoom={minZoom}
            translateExtent={translateExtent}
            maxZoom={2.4}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            selectNodesOnDrag={false}
            nodesDraggable={draggable}
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements={nodes.length > 160}
          >
            {!living && <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgb(236 232 223 / 0.07)" />}
            {selectedNode && (
              <ViewportPortal>
                <Reticle key={selectedNode.id} node={selectedNode} />
              </ViewportPortal>
            )}
            {minimap && isDesktop && (
              <MiniMap
                pannable
                zoomable
                position="bottom-right"
                style={{ width: 148, height: 104, marginRight: occludedRight + 16, marginBottom: 16 }}
                nodeColor={(n) => MINIMAP_COLORS[n.type ?? ''] ?? '#3a424c'}
                nodeStrokeWidth={0}
                maskColor="rgb(10 12 15 / 0.72)"
                ariaLabel="Minimap"
              />
            )}
          </ReactFlow>
          {pending && (
            <RelationPicker
              x={pending.x}
              y={pending.y}
              source={labelsFor.get(pending.source)}
              target={labelsFor.get(pending.target)}
              sourceId={pending.source}
              targetId={pending.target}
              onClose={() => setPending(null)}
            />
          )}
          {probe && !pending && !edgeMenu && <NodeProbe id={probe} occludedRight={occludedRight} hint={t('Click to open · arrow keys travel along links')} />}
          {edgeMenu && <EdgePopover edgeId={edgeMenu.edgeId} x={edgeMenu.x} y={edgeMenu.y} edges={built.edges} onClose={() => setEdgeMenu(null)} />}
          {children}
        </div>
      </SpaceContext.Provider>
    </MotionContext.Provider>
  );
}
