import { CircleHelp, FoldVertical, Plus, RotateCcw, UnfoldVertical } from 'lucide-react';
import type { FitViewOptions } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import { AddNodeModal } from '../../components/graph/AddNodeModal';
import { GraphCanvas } from '../../components/graph/GraphCanvas';
import { GraphSearch, ViewMenu } from '../../components/graph/GraphToolbar';
import { Legend } from '../../components/graph/Legend';
import { refForNode } from '../../components/inspector/parts';
import { Button } from '../../components/ui/Button';
import { MenuItem, MenuSeparator } from '../../components/ui/Menu';
import { HelpCard, PAGE_HELP, useGraphHelp } from '../../components/ui/HowItWorks';
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
  const help = useGraphHelp('orbit');

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
  const empty = Object.keys(data.entries).length === 0 && Object.keys(data.nodes).length === 0;
  const occluded = inspector.length ? panelWidth : 0;
  const hudVisible = isDesktop && hudOpen;
  const leftInset = hudVisible ? HUD_WIDTH + 24 : 12;
  // On an empty atlas without the overview on screen, a start card sits at the top (clear of the
  // toasts at the bottom): fit the map below it.
  const startCard = empty && !hudVisible;
  const padding = useMemo(
    (): FitViewOptions['padding'] =>
      isMobile
        ? { top: startCard ? '300px' : '112px', bottom: '24px', left: '20px', right: '20px' }
        : { top: startCard ? '230px' : '80px', bottom: '32px', left: `${leftInset + 56}px`, right: `${occluded + 96}px` },
    [isMobile, leftInset, occluded, startCard],
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
        refitKey={startCard ? 'start' : 'map'}
        draggable={!isMobile}
        occludedLeft={hudVisible ? leftInset : 0}
        living
      >
        {/* Toolbar */}
        <div
          className="absolute top-3 z-10 flex flex-wrap items-center justify-end gap-1.5 transition-[right] duration-200"
          style={{ right: occluded + 12, left: isDesktop ? undefined : 12 }}
        >
          {!isDesktop && (
            <button
              type="button"
              onClick={() => setMobileHud(true)}
              className="mr-auto h-8 rounded-[2px] border border-line bg-surface/95 px-2.5 text-[12px] text-ink-2"
            >
              Overview
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
          <Button
            size="sm"
            icon={Plus}
            onClick={() => setAdding(true)}
            title="Add a goal, project, person, skill… to an area of life"
            className="bg-surface/95"
          >
            Add point
          </Button>
          <ViewMenu padding={padding}>
            <MenuItem checked={view.focus} hint="Hide what is not linked to the selected item" onSelect={() => setOrbitView({ focus: !view.focus })}>
              Focus on the selection
            </MenuItem>
            {!isMobile && (
              <MenuItem
                icon={allCollapsed ? UnfoldVertical : FoldVertical}
                hint="Double-click one area to fold just that one"
                onSelect={() => setOrbitView({ collapsed: allCollapsed ? [] : [...DOMAIN_KEYS] })}
              >
                {allCollapsed ? 'Unfold all areas' : 'Fold all areas'}
              </MenuItem>
            )}
            {isDesktop && (
              <MenuItem checked={hudOpen} hint="Do this next, where you are, your plan" onSelect={() => setHudOpen(!hudOpen)}>
                Overview panel
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem icon={RotateCcw} hint="Put everything back where it started" onSelect={() => resetLayout('orbit')}>
              Reset layout
            </MenuItem>
            <MenuItem icon={CircleHelp} onSelect={help.toggle}>
              {help.shown ? 'Hide how this page works' : 'How this page works'}
            </MenuItem>
          </ViewMenu>
        </div>

        {help.shown && (
          <div className="absolute top-14 z-20 w-[min(360px,calc(100%-24px))] animate-rise" style={{ right: occluded + 12 }}>
            <HelpCard floating items={PAGE_HELP.orbit} onDone={help.close} />
          </div>
        )}

        {/* Overview panel */}
        {hudVisible && (
          <div
            className="ticks absolute top-3 bottom-3 left-3 z-10 animate-fade-in overflow-hidden rounded-[2px] border border-line bg-surface/[0.9] shadow-2xl backdrop-blur-md"
            style={{ width: HUD_WIDTH }}
          >
            <StatusHud
              onClose={() => setHudOpen(false)}
              start={empty ? { addPoint: () => setAdding(true), identity: () => openEntity({ kind: 'domain', id: 'identity' }) } : undefined}
            />
          </div>
        )}

        {/* First step, only on an empty atlas */}
        {startCard && (
          <div
            className="absolute top-[64px] z-10 max-md:top-[108px] w-[min(440px,calc(100%-24px))] -translate-x-1/2 rounded-[2px] border border-line-strong bg-surface/95 px-4 py-3.5 backdrop-blur"
            style={{ left: isDesktop ? `calc(${leftInset}px + (100% - ${leftInset + occluded}px) / 2)` : '50%' }}
          >
            <div className="label">Start here</div>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">
              Write about something that happened, or add your first points: goals, projects, people, skills. The map fills in from there.
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={Plus} onClick={() => useUI.getState().openCapture('journal')}>
                Write a note
              </Button>
              <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
                Add a point
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
