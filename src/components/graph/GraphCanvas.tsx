import {
  applyNodeChanges,
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
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
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { isTyping } from '../../lib/dom';
import { FOCUS_REQUEST_TTL, useUI } from '../../state/uiStore';
import { EdgePopover } from './EdgePopover';
import { HubNodeView } from './nodes/HubNode';
import { ItemNodeView } from './nodes/ItemNode';
import { MindNodeView } from './nodes/MindNode';
import { PatternNodeView } from './nodes/PatternNode';
import { RingsNodeView } from './nodes/RingsNode';
import { RelationPicker } from './RelationPicker';
import { EdgeMarkers, SemanticEdgeView } from './SemanticEdge';
import { StarField } from './StarField';

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
   * The living graph: starfield, breathing, flow pulses, periodic activity,
   * staged reveal and camera glides to selected hubs.
   */
  living?: boolean;
  children?: ReactNode;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

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
  // The staged reveal runs once per mount, then the class is removed so later changes appear immediately.
  const [revealing, setRevealing] = useState(living && !reduced);
  useEffect(() => {
    if (!revealing) return;
    const t = setTimeout(() => setRevealing(false), 1700);
    return () => clearTimeout(t);
  }, [revealing]);

  const [nodes, setNodes] = useState<AtlasFlowNode[]>(built.nodes);
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

  const onNodeDragStop = useCallback(
    (_: unknown, __: AtlasFlowNode, dragged: AtlasFlowNode[]) => {
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

  // Periodic system activity: every so often a soft wave leaves one domain along its
  // relationships and faintly reaches the domains at the other end.
  const edgesRef = useRef(built.edges);
  edgesRef.current = built.edges;
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
        const hubs = [...new Set(edges.flatMap((e) => [e.source, e.target]).filter((id) => id.startsWith('domain:')))];
        // While something is selected, activity stays inside its neighbourhood.
        const pool = selectedRef.current ? hubs.filter((h) => edges.some((e) => (e.source === h || e.target === h) && e.data?.active)) : hubs;
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
  }, [living, reduced]);

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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rf, onSelect]);

  const labelsFor = useMemo(() => new Map(built.nodes.map((n) => [n.id, n])), [built.nodes]);
  // Fit to the content, not to decorative backdrops such as the orbit rings.
  const fitOptions = useMemo(
    () => ({ padding: fitPadding, minZoom: fitMinZoom, nodes: built.nodes.filter((n) => n.type !== 'rings').map((n) => ({ id: n.id })) }),
    [built.nodes, fitPadding, fitMinZoom],
  );
  fitOptionsRef.current = fitOptions;

  return (
    <MotionContext.Provider value={motion}>
      <div
        ref={wrapper}
        className={cn('relative h-full w-full', living && 'atlas-living', living && nodes.length > 160 && 'atlas-dense', revealing && 'atlas-reveal')}
        onPointerMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
        onPointerUp={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
      >
        <EdgeMarkers />
        {living && <StarField reduced={reduced} />}
        <ReactFlow<AtlasFlowNode, SemanticEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodeOrigin={[0.5, 0.5]}
          onNodesChange={onNodesChange}
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
          onMoveEnd={(_, vp) => persistViewport && setViewport(layer, vp)}
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
        {edgeMenu && <EdgePopover edgeId={edgeMenu.edgeId} x={edgeMenu.x} y={edgeMenu.y} edges={built.edges} onClose={() => setEdgeMenu(null)} />}
        {children}
      </div>
    </MotionContext.Provider>
  );
}
