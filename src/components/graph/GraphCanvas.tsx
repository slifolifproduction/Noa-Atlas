import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useStoreApi,
  ViewportPortal,
  type Connection,
  type NodeChange,
  type NodeTypes,
  type EdgeTypes,
  type Viewport,
  type FitViewOptions,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { GraphLayer, ID } from '../../domain/types';
import type { BuiltGraph } from '../../graph/build';
import type { AtlasFlowNode, SemanticEdge } from '../../graph/types';
import { HOP_MS, MAX_ACTIVE_PULSES, MAX_IDLE_PULSES, MotionContext, waveBus, type MotionSettings } from '../../graph/motion';
import { SPACE_MAX_NODES, SpaceContext, SpaceEngine, spaceHealth } from '../../graph/space';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { isTyping } from '../../lib/dom';
import { FOCUS_REQUEST_TTL, toast, useUI } from '../../state/uiStore';
import { EdgePopover } from './EdgePopover';
import { HubNodeView } from './nodes/HubNode';
import { ItemNodeView } from './nodes/ItemNode';
import { MindNodeView } from './nodes/MindNode';
import { PatternNodeView } from './nodes/PatternNode';
import { RingsNodeView } from './nodes/RingsNode';
import { RelationPicker } from './RelationPicker';
import { NodeProbe } from './NodeProbe';
import { Reticle } from './Reticle';
import { EdgeMarkers, SemanticEdgeView } from './SemanticEdge';
import { SpaceField } from './SpaceField';

const nodeTypes: NodeTypes = {
  hub: HubNodeView,
  item: ItemNodeView,
  mind: MindNodeView,
  pattern: PatternNodeView,
  rings: RingsNodeView,
};
const edgeTypes: EdgeTypes = { semantic: SemanticEdgeView };

const MINIMAP_COLORS: Record<string, string> = { hub: '#5b6572', item: '#3a424c', mind: '#48515c', pattern: '#8a8579' };

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
  children?: ReactNode;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const ARROWS: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

/** The latest signal the network sent, for the live readout. */
interface Signal {
  cycle: number;
  origin: ID;
  first: ID[];
  hops: number;
  nodes: number;
  focus: ID | null;
}

const nodeLabel = (n: AtlasFlowNode | undefined): string =>
  !n ? '' : n.type === 'pattern' ? `Pattern ${String(n.data.code).padStart(2, '0')}` : 'label' in n.data ? String(n.data.label) : '';

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
  fitMinZoom,
  draggable = true,
  persistViewport = true,
  occludedLeft = 0,
  living = false,
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
  const idleShare = Math.min(1, MAX_IDLE_PULSES / Math.max(1, built.edges.filter((e) => !e.data?.secondary && e.data?.relation !== 'part_of').length));
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
  const spaceMode = useUI((s) => s.spaceMode);
  const [degraded, setDegraded] = useState(spaceHealth.degraded);
  useEffect(() => {
    space.onDegrade = () => {
      setDegraded(true);
      toast('Depth paused to keep this device smooth. Settings → Space can turn it back on.');
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

  // Momentum: a thrown pan keeps drifting and slows down, as things do in space.
  const momentum = useRef({ dragging: false, samples: [] as { t: number; x: number; y: number }[], raf: 0 });
  const onMoveStart = useCallback((e: MouseEvent | TouchEvent | null) => {
    if (!e) return;
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
        rf.setViewport({ x, y, zoom: vp.zoom });
        if (Math.hypot(vx, vy) > 0.02) m.raf = requestAnimationFrame(step);
        else {
          m.raf = 0;
          if (persistViewport) setViewport(layer, rf.getViewport());
        }
      };
      m.raf = requestAnimationFrame(step);
    },
    [persistViewport, setViewport, layer, living, reduced, rf],
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
        if (!n || n.type === 'hub' || n.type === 'rings' || s.items.has(n.id)) continue;
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
      setPositions(layer, Object.fromEntries(dragged.map((n) => [n.id, { x: Math.round(n.position.x), y: Math.round(n.position.y) }])));
    },
    [layer, setPositions],
  );

  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target || c.source === c.target) return;
    const rect = wrapper.current?.getBoundingClientRect();
    setPending({ source: c.source, target: c.target, x: pointer.current.x - (rect?.left ?? 0), y: pointer.current.y - (rect?.top ?? 0) });
  }, []);

  const isValidConnection = useCallback((c: Connection | SemanticEdge) => {
    const bad = (id: string | null | undefined) => !id || id === '__rings' || id.startsWith('pat');
    return c.source !== c.target && !bad(c.source) && !bad(c.target);
  }, []);

  // One-shot "focus this node" requests from the inspector, search or palette.
  useEffect(() => {
    if (!focusRequest || focusRequest.layer !== layer || Date.now() - focusRequest.at > FOCUS_REQUEST_TTL) return;
    const n = nodes.find((x) => x.id === focusRequest.id);
    if (!n) return;
    // Wait a frame so an initial fit (on a freshly mounted canvas) does not override the focus.
    const raf = requestAnimationFrame(() => {
      const zoom = Math.max(rf.getZoom(), 0.9);
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
      rf.setCenter(centre(zoom), n.position.y, { zoom, duration: reduced ? 0 : 560, ease: easeInOutCubic });
      return;
    }
    if (living && n.type === 'hub') {
      // Navigating to a region: a gentle glide that brings the domain and its satellites into view.
      const target = Math.min(1.05, Math.max(zoom, 0.78));
      rf.setCenter(centre(target), n.position.y, { zoom: target, duration: reduced ? 0 : 900, ease: easeInOutCubic });
      return;
    }
    const sx = n.position.x * zoom + x;
    const sy = n.position.y * zoom + y;
    const margin = 80;
    if (sx < occludedLeft + margin || sx > rect.width - occludedRight - margin || sy < margin || sy > rect.height - margin) {
      rf.setCenter(centre(zoom), n.position.y, { zoom, duration: reduced ? 0 : 600, ease: easeInOutCubic });
    }
  }, [selectedId]);

  // The network thinks: every few seconds a signal leaves one node (a domain in Orbit, a
  // well-connected thought in Mind) and travels up to three links outward, one hop at a time,
  // firing each node it reaches. Origins are weighted by attention, so the system keeps coming
  // back to what you have been looking at; with a selection it stays in that neighbourhood.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const [signal, setSignal] = useState<Signal | null>(null);
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
        const edges = edgesRef.current.filter((e) => !e.data?.dim);
        const adj = new Map<ID, { id: ID; structural: boolean }[]>();
        const link = (a: ID, b: ID, structural: boolean) => {
          if (!adj.has(a)) adj.set(a, []);
          adj.get(a)!.push({ id: b, structural });
        };
        const degree = new Map<ID, number>();
        for (const e of edges) {
          const structural = e.data?.relation === 'part_of';
          link(e.source, e.target, structural);
          link(e.target, e.source, structural);
          if (!structural) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
        }
        const origins = [...degree.keys()].filter((id) => (layer === 'orbit' ? id.startsWith('domain:') : degree.get(id)! >= 2));
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
          setSignal({ cycle, origin, first: hops[0]?.flatMap((s) => s.reached) ?? [], hops: hops.length, nodes: visited.size, focus: space.topAttention() });
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
      const all = nodesRef.current.filter((n) => n.type !== 'rings');
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
      if (e.key === 'f') rf.fitView({ ...fitOptionsRef.current, duration: 400 });
      else if (e.key === '=' || e.key === '+') rf.zoomIn({ duration: 200 });
      else if (e.key === '-') rf.zoomOut({ duration: 200 });
      else if (e.key === 'Enter' && document.activeElement?.classList.contains('react-flow__node')) {
        const id = document.activeElement.getAttribute('data-id');
        if (id && id !== '__rings') onSelect(id);
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

  const labelsFor = useMemo(() => new Map(built.nodes.map((n) => [n.id, n])), [built.nodes]);
  // Fit to the content, not to decorative backdrops such as the orbit rings.
  const fitOptions = useMemo(
    () => ({ padding: fitPadding, minZoom: fitMinZoom, nodes: built.nodes.filter((n) => n.type !== 'rings').map((n) => ({ id: n.id })) }),
    [built.nodes, fitPadding, fitMinZoom],
  );
  fitOptionsRef.current = fitOptions;

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
          )}
          onPointerMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
          onPointerUp={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
        >
          <EdgeMarkers />
          {living && <SpaceField reduced={reduced} camera={space.camera} lite={!depthOn} />}
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
            onNodeClick={(_, n) => n.id !== '__rings' && onSelect(n.id)}
            onNodeDoubleClick={(_, n) => onNodeDoubleClick?.(n.id)}
            onNodeMouseEnter={(_, n) => n.id !== '__rings' && setHovered(n.id)}
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
            minZoom={0.12}
            maxZoom={2.4}
            deleteKeyCode={null}
            selectionKeyCode={null}
            multiSelectionKeyCode={null}
            selectNodesOnDrag={false}
            nodesDraggable={draggable}
            zoomOnDoubleClick={false}
            onlyRenderVisibleElements={nodes.length > 160}
          >
            {!living && <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgb(255 255 255 / 0.07)" />}
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
          {probe && !pending && !edgeMenu && <NodeProbe id={probe} occludedRight={occludedRight} hint="Click to open · arrow keys travel along links" />}
          {signal && isDesktop && labelsFor.has(signal.origin) && built.edges.some((e) => e.data?.relation !== 'part_of') && (
            <SignalReadout key={signal.cycle} signal={signal} labelOf={(id) => nodeLabel(labelsFor.get(id))} left={occludedLeft} right={occludedRight} />
          )}
          {edgeMenu && <EdgePopover edgeId={edgeMenu.edgeId} x={edgeMenu.x} y={edgeMenu.y} edges={built.edges} onClose={() => setEdgeMenu(null)} />}
          {children}
        </div>
      </SpaceContext.Provider>
    </MotionContext.Provider>
  );
}

/**
 * What the network is doing right now, in words: where the last signal left from, what it
 * reached first, how far it travelled, and where attention has built up.
 */
function SignalReadout({ signal, labelOf, left, right }: { signal: Signal; labelOf(id: ID): string; left: number; right: number }) {
  const first = signal.first.map(labelOf).filter(Boolean);
  return (
    <div
      className="atlas-readout pointer-events-none absolute bottom-3 z-10 max-w-[min(520px,55%)] -translate-x-1/2 animate-fade-in truncate rounded-[6px] bg-canvas/70 px-2 py-1 font-mono text-[10.5px] tracking-wide text-ink-3"
      style={{ left: `calc(${left}px + (100% - ${left + right}px) / 2)` }}
      title="The map links your notes in the background. This shows the connection it is following right now."
    >
      <span className="atlas-live-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" aria-hidden />
      <span className="text-ink-2">Live</span> · following <span className="text-ink-2">{labelOf(signal.origin)}</span>
      {first.length > 0 && (
        <>
          {' '}
          → {first.slice(0, 3).join(', ')}
          {first.length > 3 ? ` +${first.length - 3}` : ''}
        </>
      )}
      {signal.focus && (
        <>
          {' '}
          · you often look at <span className="text-ink-2">{labelOf(signal.focus)}</span>
        </>
      )}
    </div>
  );
}
