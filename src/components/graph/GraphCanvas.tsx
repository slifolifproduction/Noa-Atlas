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
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { useUI } from '../../state/uiStore';
import { EdgePopover } from './EdgePopover';
import { HubNodeView } from './nodes/HubNode';
import { ItemNodeView } from './nodes/ItemNode';
import { MindNodeView } from './nodes/MindNode';
import { PatternNodeView } from './nodes/PatternNode';
import { RingsNodeView } from './nodes/RingsNode';
import { RelationPicker } from './RelationPicker';
import { EdgeMarkers, SemanticEdgeView } from './SemanticEdge';

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
  children?: ReactNode;
}

export function GraphCanvas(props: GraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

function Canvas({ layer, built, selectedId, onSelect, onNodeDoubleClick, occludedRight = 0, minimap, fitPadding = 0.12, fitMinZoom, draggable = true, children }: GraphCanvasProps) {
  const rf = useReactFlow<AtlasFlowNode, SemanticEdge>();
  const wrapper = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0 });
  const setPositions = useUI((s) => s.setPositions);
  const setViewport = useUI((s) => s.setViewport);
  const focusRequest = useUI((s) => s.focusRequest);
  const [initialViewport] = useState<Viewport | undefined>(() => useUI.getState().layouts[layer].viewport);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

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
    if (!focusRequest || focusRequest.layer !== layer) return;
    const n = nodes.find((x) => x.id === focusRequest.id);
    if (!n) return;
    const zoom = Math.max(rf.getZoom(), 0.9);
    rf.setCenter(n.position.x + occludedRight / 2 / zoom, n.position.y, { zoom, duration: 500 });
    // Only react to new requests, not to node changes.
  }, [focusRequest]);

  // Follow the selection when it lands off-screen (e.g. drilling down in the panel).
  useEffect(() => {
    if (!selectedId || !wrapper.current) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (!n) return;
    const { x, y, zoom } = rf.getViewport();
    const rect = wrapper.current.getBoundingClientRect();
    const sx = n.position.x * zoom + x;
    const sy = n.position.y * zoom + y;
    const margin = 80;
    if (sx < margin || sx > rect.width - occludedRight - margin || sy < margin || sy > rect.height - margin) {
      rf.setCenter(n.position.x + occludedRight / 2 / zoom, n.position.y, { zoom, duration: 450 });
    }
  }, [selectedId]);

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
    <div
      ref={wrapper}
      className="relative h-full w-full"
      onPointerMove={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
      onPointerUp={(e) => (pointer.current = { x: e.clientX, y: e.clientY })}
    >
      <EdgeMarkers />
      <ReactFlow<AtlasFlowNode, SemanticEdge>
        nodes={nodes}
        edges={built.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodeOrigin={[0.5, 0.5]}
        onNodesChange={onNodesChange}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={(_, n) => n.id !== '__rings' && onSelect(n.id)}
        onNodeDoubleClick={(_, n) => onNodeDoubleClick?.(n.id)}
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
        onMoveEnd={(_, vp) => setViewport(layer, vp)}
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
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="rgb(255 255 255 / 0.07)" />
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
  );
}
