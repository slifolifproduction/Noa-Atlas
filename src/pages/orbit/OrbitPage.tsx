import { Crosshair, FoldVertical, PanelLeftOpen, Plus, RotateCcw, UnfoldVertical } from 'lucide-react';
import type { FitViewOptions } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import { AddNodeModal } from '../../components/graph/AddNodeModal';
import { GraphCanvas } from '../../components/graph/GraphCanvas';
import { GraphSearch, ToolGroup, ZoomControls } from '../../components/graph/GraphToolbar';
import { Legend } from '../../components/graph/Legend';
import { refForNode } from '../../components/inspector/parts';
import { Button, IconButton } from '../../components/ui/Button';
import { DOMAIN_KEYS, hubKey, isHubId, ORBIT_DESKTOP, ORBIT_PORTRAIT } from '../../domain/constants';
import type { DomainKey, ID, RelationType } from '../../domain/types';
import { buildOrbit } from '../../graph/build';
import { selectionFor } from '../../graph/selection';
import { useInspectorWidth, useIsDesktop, useIsMobile } from '../../hooks/useMediaQuery';
import { todayISO } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { StatusHud } from './StatusHud';

const HUD_WIDTH = 304;

export function OrbitPage() {
  const data = useAtlas((s) => s.data);
  const inspector = useUI((s) => s.inspector);
  const stored = useUI((s) => s.layouts.orbit.positions);
  const view = useUI((s) => s.orbitView);
  const hudOpen = useUI((s) => s.hudOpen);
  const setHudOpen = useUI((s) => s.setHudOpen);
  const setOrbitView = useUI((s) => s.setOrbitView);
  const resetLayout = useUI((s) => s.resetLayout);
  const openEntity = useUI((s) => s.openEntity);
  const closeInspector = useUI((s) => s.closeInspector);
  const requestFocus = useUI((s) => s.requestFocus);
  const isDesktop = useIsDesktop();
  const panelWidth = useInspectorWidth();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [mobileHud, setMobileHud] = useState(false);

  const selectedId = selectionFor(inspector, 'orbit', data);
  // On phones the map starts simplified: hubs only, a hub's satellites appear when it is selected.
  const collapsed = useMemo(() => new Set<DomainKey>(isMobile ? DOMAIN_KEYS : view.collapsed), [isMobile, view.collapsed]);
  const today = todayISO();

  const built = useMemo(
    () =>
      buildOrbit(data, {
        // Phones get a compact portrait layout and no dragging, so desktop arrangements stay intact.
        stored: isMobile ? {} : stored,
        geometry: isMobile ? ORBIT_PORTRAIT : ORBIT_DESKTOP,
        collapsed,
        selectedId,
        focus: view.focus,
        query,
        today,
      }),
    [data, stored, isMobile, collapsed, selectedId, view.focus, query, today],
  );

  const relations = useMemo(() => {
    const seen = new Set<RelationType>(built.edges.map((e) => e.data!.relation));
    return (['supports', 'influences', 'conflicts', 'depends_on', 'derived_from', 'causes'] as RelationType[]).filter((r) => seen.has(r));
  }, [built.edges]);

  const onSelect = useCallback((id: ID | null) => (id ? openEntity(refForNode(id)) : closeInspector()), [openEntity, closeInspector]);

  const toggleHub = useCallback(
    (id: ID) => {
      if (!isHubId(id)) return;
      const key = hubKey(id);
      const set = new Set(useUI.getState().orbitView.collapsed);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      setOrbitView({ collapsed: [...set] });
    },
    [setOrbitView],
  );

  const allCollapsed = view.collapsed.length === DOMAIN_KEYS.length;
  const occluded = inspector.length ? panelWidth : 0;
  const hudVisible = isDesktop && hudOpen;
  const leftInset = hudVisible ? HUD_WIDTH + 24 : 12;
  const padding = useMemo(
    (): FitViewOptions['padding'] =>
      isMobile
        ? { top: '96px', bottom: '24px', left: '44px', right: '44px' }
        : { top: '80px', bottom: '32px', left: `${leftInset + 56}px`, right: `${occluded + 96}px` },
    [isMobile, leftInset, occluded],
  );

  return (
    <div className="relative h-full overflow-hidden">
      <GraphCanvas
        key={isMobile ? 'portrait' : 'wide'}
        layer="orbit"
        built={built}
        selectedId={selectedId}
        onSelect={onSelect}
        onNodeDoubleClick={toggleHub}
        occludedRight={occluded}
        persistViewport={!isMobile}
        fitPadding={padding}
        draggable={!isMobile}
        occludedLeft={hudVisible ? leftInset : 0}
        living
      >
        {/* Title */}
        <div className="pointer-events-none absolute top-2 z-10 hidden rounded-[6px] bg-canvas/80 px-2 py-1 lg:block" style={{ left: leftInset + 4 }}>
          <div className="label">01 · Orbit</div>
          <div className="mt-0.5 text-[15px] font-medium tracking-[-0.01em] text-ink">Where am I?</div>
        </div>

        {/* Toolbar */}
        <div
          className="absolute top-3 z-10 flex flex-wrap items-center justify-end gap-1.5 transition-[right] duration-200"
          style={{ right: occluded + 12, left: isDesktop ? undefined : 12 }}
        >
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setMobileHud(true)}
              className="mr-auto h-8 rounded-[7px] border border-line bg-surface/95 px-2.5 text-[12px] text-ink-2"
            >
              Status
            </button>
          )}
          <GraphSearch
            query={query}
            onQuery={setQuery}
            matches={built.matches}
            onPick={(id) => {
              openEntity(refForNode(id));
              requestFocus('orbit', id);
            }}
          />
          <ToolGroup>
            <IconButton
              icon={Crosshair}
              size="sm"
              label={view.focus ? 'Show everything' : 'Focus: hide what is unrelated to the selection'}
              active={view.focus}
              onClick={() => setOrbitView({ focus: !view.focus })}
            />
            {!isMobile && (
              <IconButton
                icon={allCollapsed ? UnfoldVertical : FoldVertical}
                size="sm"
                label={allCollapsed ? 'Expand all domains' : 'Collapse all domains (double-click a hub to toggle one)'}
                onClick={() => setOrbitView({ collapsed: allCollapsed ? [] : [...DOMAIN_KEYS] })}
              />
            )}
            <IconButton icon={RotateCcw} size="sm" label="Reset layout" onClick={() => resetLayout('orbit')} />
            <IconButton icon={Plus} size="sm" label="Add to Orbit" onClick={() => setAdding(true)} />
          </ToolGroup>
          {!isMobile && <ZoomControls padding={padding} />}
        </div>

        {/* Status panel (dashboard) */}
        {hudVisible ? (
          <div
            className="absolute top-3 bottom-3 left-3 z-10 animate-fade-in overflow-hidden rounded-[10px] border border-line bg-surface/[0.96] shadow-2xl backdrop-blur-md"
            style={{ width: HUD_WIDTH }}
          >
            <StatusHud onClose={() => setHudOpen(false)} />
          </div>
        ) : (
          isDesktop && (
            <div className="absolute bottom-3 left-3 z-10">
              <IconButton icon={PanelLeftOpen} label="Show status panel" onClick={() => setHudOpen(true)} className="border-line! bg-surface/95" />
            </div>
          )
        )}

        {/* First step, only on an empty atlas */}
        {Object.keys(data.entries).length === 0 && Object.keys(data.nodes).length === 0 && (
          <div
            className="absolute bottom-6 z-10 w-[min(420px,calc(100%-24px))] -translate-x-1/2 rounded-[10px] border border-line-strong bg-surface/95 px-4 py-3.5 backdrop-blur"
            style={{ left: isDesktop ? `calc(${leftInset}px + (100% - ${leftInset + occluded}px) / 2)` : '50%' }}
          >
            <div className="label">Start here</div>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">
              Select a domain and write one line about where you stand in it. Then capture something that happened this week; the map fills in from there.
            </p>
            <div className="mt-2.5 flex gap-2">
              <Button size="sm" variant="primary" icon={Plus} onClick={() => useUI.getState().openCapture('journal')}>
                Capture an entry
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEntity({ kind: 'domain', id: 'identity' })}>
                Describe your identity
              </Button>
            </div>
          </div>
        )}

        {/* Key */}
        {!isMobile && (
          <div className="absolute bottom-6 z-10 transition-[right] duration-200" style={{ right: occluded + 12 }}>
            <Legend
              relations={relations}
              extra={
                <>
                  <p className="text-[11.5px] leading-snug text-ink-3">Hub arc: share of entries in the last 60 days.</p>
                  <p className="text-[11.5px] leading-snug text-ink-3">Hub badge: active patterns involving the domain.</p>
                  <p className="text-[11.5px] leading-snug text-ink-3">Rings: self → intent → work → conditions.</p>
                </>
              }
            />
          </div>
        )}
      </GraphCanvas>

      {!isDesktop && mobileHud && (
        <div className="absolute inset-y-0 left-0 z-30 w-full animate-fade-in border-r border-line bg-surface sm:w-[360px]">
          <StatusHud onClose={() => setMobileHud(false)} />
        </div>
      )}
      {adding && (
        <AddNodeModal layer="orbit" onClose={() => setAdding(false)} defaultDomain={selectedId && isHubId(selectedId) ? hubKey(selectedId) : undefined} />
      )}
    </div>
  );
}
