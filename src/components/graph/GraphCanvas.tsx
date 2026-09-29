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
import { MAX_ACTIVE_PULSES, MAX_IDLE_PULSES, MotionContext, waveBus, type MotionSettings } from '../../graph/motion';
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
      occludedLeft,
      occludedRight,
      intensity: isDesktop ? 1 : 0.55,
      adaptive: spaceMode === 'auto',
    });
  }, [space, spaceOn, depthOn, built.nodes, occludedLeft, occludedRight, isDesktop, spaceMode]);
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

  // Periodic system activity: every so often a soft wave leaves one domain (Orbit) or one
  // well-connected thought (Mind) along its relationships and faintly reaches the other ends.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  useEffect(() => {
    if (!living || reduced) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(fire, 9000 + Math.random() * 7000);
    };
    const fire = () => {
      if (!document.hidden) {
        const edges = edgesRef.current.filter((e) => !e.data?.dim && e.data?.relation !== 'part_of');
        const degree = new Map<ID, number>();
        for (const e of edges) for (const id of [e.source, e.target]) degree.set(id, (degree.get(id) ?? 0) + 1);
        const origins = [...degree.keys()].filter((id) => (layer === 'orbit' ? id.startsWith('domain:') : degree.get(id)! >= 2));
        // While something is selected, activity stays inside its neighbourhood.
        const pool = selectedRef.current ? origins.filter((h) => edges.some((e) => (e.source === h || e.target === h) && e.data?.active)) : origins;
        const origin = pool[Math.floor(Math.random() * pool.length)];
        if (origin) {
          const reached = edges.filter((e) => e.source === origin || e.target === origin).map((e) => (e.source === origin ? e.target : e.source));
          waveBus.emit({ origin, reached, at: Date.now(), strength: 0.6 });
        }
      }
      schedule();
    };
    timer = window.setTimeout(fire, 2600);
    return () => clearTimeout(timer);
  }, [living, reduced, layer]);

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
          {living && <SpaceField reduced={reduced} camera={space.camera} />}
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
          {edgeMenu && <EdgePopover edgeId={edgeMenu.edgeId} x={edgeMenu.x} y={edgeMenu.y} edges={built.edges} onClose={() => setEdgeMenu(null)} />}
          {children}
        </div>
      </SpaceContext.Provider>
    </MotionContext.Provider>
  );
}
