import { CircleHelp, FoldVertical, Plus, RotateCcw, SlidersHorizontal, UnfoldVertical, X } from 'lucide-react';
import type { FitViewOptions } from '@xyflow/react';
import { useCallback, useMemo, useState } from 'react';
import { AddNodeModal } from '../../components/graph/AddNodeModal';
import { GraphCanvas } from '../../components/graph/GraphCanvas';
import { GraphSearch, ViewMenu } from '../../components/graph/GraphToolbar';
import { Legend } from '../../components/graph/Legend';
import { refForNode } from '../../components/inspector/parts';
import { useFocus } from '../../components/shell/Focus';
import { Button, IconButton } from '../../components/ui/Button';
import { MenuItem, MenuLabel, MenuSeparator } from '../../components/ui/Menu';
import { HelpCard, pageHelp, useGraphHelp } from '../../components/ui/HowItWorks';
import { focusGraphId, salientIds } from '../../domain/ask';
import { areaHubKey, isAreaHubId, LAYERS, ORBIT_DESKTOP, ORBIT_PORTRAIT, SECTOR_KEYS } from '../../domain/constants';
import type { AreaKey, ID, LayerKey, LinkType } from '../../domain/types';
import { buildOrbit, type CanvasLens } from '../../graph/build';
import { useInspectorWidth, useIsDesktop, useIsMobile } from '../../hooks/useMediaQuery';
import { useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { CausesRail } from './CausesRail';
import { StatusHud } from './StatusHud';
import { t } from '../../i18n';

const RAIL_WIDTH = 280;

/**
 * The canvas behind two lenses. Map shows what exists, from you outward;
 * Causes shows what seems to affect what, as a double helix that reads from
 * cause to effect. Switching between them keeps what you are looking at; the
 * helix is arranged on the fly and never moves anything on the map.
 */
export function OrbitPage({ lens }: { lens: CanvasLens }) {
  const data = useAtlas((s) => s.data);
  const inspectorOpen = useUI((s) => s.inspector.length > 0);
  const stored = useUI((s) => s.layouts.orbit.positions);
  const view = useUI((s) => s.orbitView);
  const causes = useUI((s) => s.networkView);
  const hudOpen = useUI((s) => s.hudOpen);
  const setHudOpen = useUI((s) => s.setHudOpen);
  const setOrbitView = useUI((s) => s.setOrbitView);
  const setNetworkView = useUI((s) => s.setNetworkView);
  const resetLayout = useUI((s) => s.resetLayout);
  const openEntity = useUI((s) => s.openEntity);
  const closeInspector = useUI((s) => s.closeInspector);
  const setFocus = useUI((s) => s.setFocus);
  const requestFocus = useUI((s) => s.requestFocus);
  const isDesktop = useIsDesktop();
  const panelWidth = useInspectorWidth();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [mobileSide, setMobileSide] = useState(false);
  const help = useGraphHelp(lens === 'map' ? 'orbit' : 'network');
  const today = useToday();

  const focus = useFocus();
  const selectedId = focusGraphId(focus);
  // On phones the map starts simplified: the centre and the area markers; an area's elements appear when it is selected.
  const collapsed = useMemo(() => new Set<AreaKey>(isMobile && lens === 'map' ? SECTOR_KEYS : view.collapsed), [isMobile, lens, view.collapsed]);
  const hiddenLayers = useMemo(() => new Set<LayerKey>(view.hiddenLayers), [view.hiddenLayers]);
  const salient = useMemo(() => salientIds(data, today), [data, today]);

  const built = useMemo(
    () =>
      buildOrbit(data, {
        lens,
        causes,
        salient,
        essentials: lens === 'map' && !view.showAll,
        // Phones get a compact portrait layout and no dragging, so desktop arrangements stay intact.
        stored: isMobile ? {} : stored,
        geometry: isMobile ? ORBIT_PORTRAIT : ORBIT_DESKTOP,
        collapsed: lens === 'map' ? collapsed : new Set(),
        hiddenLayers: lens === 'map' ? hiddenLayers : new Set(),
        showClaims: view.showClaims,
        selectedId,
        focus: lens === 'map' && view.focus,
        query,
        today,
      }),
    [data, lens, causes, salient, stored, isMobile, collapsed, hiddenLayers, view.showAll, view.showClaims, selectedId, view.focus, query, today],
  );

  const links = useMemo(() => {
    const seen = new Set<LinkType>(built.edges.flatMap((e) => (e.data?.linkType ? [e.data.linkType] : [])));
    return (['aims_at', 'motivates', 'conflicts', 'aligns', 'about', 'part_of'] as LinkType[]).filter((r) => seen.has(r));
  }, [built.edges]);

  // Tapping something makes it the subject of every lens; tapping empty space lets go.
  const onSelect = useCallback(
    (id: ID | null) => {
      if (id) return openEntity(refForNode(id));
      closeInspector();
      setFocus(null);
    },
    [openEntity, closeInspector, setFocus],
  );

  const toggleHub = useCallback(
    (id: ID) => {
      if (lens !== 'map' || !isAreaHubId(id)) return;
      const key = areaHubKey(id);
      const set = new Set(useUI.getState().orbitView.collapsed);
      if (set.has(key)) set.delete(key);
      else set.add(key);
      setOrbitView({ collapsed: [...set] });
    },
    [lens, setOrbitView],
  );

  const allCollapsed = view.collapsed.length === SECTOR_KEYS.length;
  const empty = Object.keys(data.entries).length === 0 && Object.keys(data.nodes).length === 0;
  const occluded = inspectorOpen ? panelWidth : 0;
  const sideVisible = isDesktop && (lens === 'causes' || hudOpen);
  const leftInset = sideVisible ? RAIL_WIDTH + 24 : 12;
  // On an empty atlas without the overview on screen, a start card sits at the top (clear of the
  // toasts at the bottom): fit the map below it.
  const startCard = empty && !sideVisible && lens === 'map';
  const padding = useMemo(
    (): FitViewOptions['padding'] =>
      isMobile
        ? { top: startCard ? '300px' : '112px', bottom: '24px', left: '64px', right: '64px' }
        : // The bottom leaves room for the name under the lowest area's marker.
          { top: startCard ? '230px' : '80px', bottom: '64px', left: `${leftInset + 56}px`, right: `${occluded + 96}px` },
    [isMobile, leftInset, occluded, startCard],
  );
  const selectedArea = selectedId && isAreaHubId(selectedId) ? areaHubKey(selectedId) : selectedId ? data.nodes[selectedId]?.area : undefined;

  const side =
    lens === 'causes' ? (
      <CausesRail />
    ) : (
      <StatusHud
        onClose={isDesktop ? () => setHudOpen(false) : () => setMobileSide(false)}
        start={empty ? { addPoint: () => setAdding(true), identity: () => openEntity({ kind: 'area', id: 'self' }) } : undefined}
      />
    );

  return (
    <div className="relative h-full overflow-hidden">
      <GraphCanvas
        key={`${lens}-${isMobile ? 'portrait' : 'wide'}`}
        layer="orbit"
        built={built}
        selectedId={selectedId}
        onSelect={onSelect}
        onNodeDoubleClick={toggleHub}
        occludedRight={occluded}
        persistViewport={!isMobile && lens === 'map'}
        fitPadding={padding}
        refitKey={startCard ? 'start' : 'map'}
        draggable={!isMobile && lens === 'map'}
        occludedLeft={sideVisible ? leftInset : 0}
        // The helix is one object: zooming out stops a little past the whole of it.
        zoomOutToFit={lens === 'causes' ? 0.7 : undefined}
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
              onClick={() => setMobileSide(true)}
              className="mr-auto flex h-8 items-center gap-1.5 rounded-[2px] border border-line bg-surface/95 px-2.5 text-[12px] text-ink-2"
            >
              {lens === 'causes' && <SlidersHorizontal size={12} aria-hidden />}
              {lens === 'causes' ? t('Cycles and filters') : t('Overview')}
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
          <Button size="sm" icon={Plus} onClick={() => setAdding(true)} title={t('Add something that is part of your life')} className="bg-surface/95">
            {t('Add')}
          </Button>
          <ViewMenu padding={padding}>
            {lens === 'map' ? (
              <>
                <MenuItem
                  checked={Boolean(view.showAll)}
                  hint={t('Without this, each area shows only its key elements; choose an area to open the rest.')}
                  onSelect={() => setOrbitView({ showAll: !view.showAll })}
                >
                  {t('Show every element')}
                </MenuItem>
                <MenuItem
                  checked={view.showClaims}
                  hint={t('Without this, only the possible reasons around what you are looking at show.')}
                  onSelect={() => setOrbitView({ showClaims: !view.showClaims })}
                >
                  {t('Show every possible reason')}
                </MenuItem>
                <MenuItem
                  checked={view.focus}
                  hint={t('Hide what is not linked to what you are looking at')}
                  onSelect={() => setOrbitView({ focus: !view.focus })}
                >
                  {t('Only what is linked to it')}
                </MenuItem>
                <MenuSeparator />
                {LAYERS.map((l) => (
                  <MenuItem
                    key={l.key}
                    checked={!view.hiddenLayers.includes(l.key)}
                    hint={l.description}
                    onSelect={() =>
                      setOrbitView({
                        hiddenLayers: view.hiddenLayers.includes(l.key) ? view.hiddenLayers.filter((x) => x !== l.key) : [...view.hiddenLayers, l.key],
                      })
                    }
                  >
                    {l.label}
                  </MenuItem>
                ))}
                <MenuSeparator />
                {!isMobile && (
                  <MenuItem
                    icon={allCollapsed ? UnfoldVertical : FoldVertical}
                    hint={t('Double-click one area to fold just that one')}
                    onSelect={() => setOrbitView({ collapsed: allCollapsed ? [] : [...SECTOR_KEYS] })}
                  >
                    {allCollapsed ? t('Unfold all areas') : t('Fold all areas')}
                  </MenuItem>
                )}
                {isDesktop && (
                  <MenuItem checked={hudOpen} hint={t('Something to look at, and the next step')} onSelect={() => setHudOpen(!hudOpen)}>
                    {t('Overview panel')}
                  </MenuItem>
                )}
              </>
            ) : (
              <>
                <MenuLabel>{t('Trace from what you are looking at')}</MenuLabel>
                {(
                  [
                    ['back', t('What may lead to it'), t('Back along possible reasons: what may contribute to it, and to those')],
                    ['forward', t('What it may lead to'), t('On along possible reasons: what it may contribute to, and beyond')],
                    ['both', t('Both ways'), t('What may lead to it and what it may lead to')],
                  ] as const
                ).map(([trace, label, hint]) => (
                  <MenuItem
                    key={trace}
                    radio
                    checked={Boolean(selectedId) && causes.focusDepth > 0 && (causes.trace ?? 'back') === trace}
                    hint={!selectedId ? t('Tap something first') : hint}
                    disabled={!selectedId}
                    onSelect={() => setNetworkView({ trace, focusDepth: causes.focusDepth || 2 })}
                  >
                    {label}
                  </MenuItem>
                ))}
                <MenuSeparator />
                {(
                  [
                    [0, t('Everything'), t('Every possible reason on the map')],
                    [1, t('One step'), t('Only what is directly joined by a possible reason')],
                    [2, t('Two steps'), t('Also one step further')],
                  ] as const
                ).map(([depth, label, hint]) => (
                  <MenuItem
                    key={depth}
                    radio
                    checked={(selectedId ? causes.focusDepth : 0) === depth}
                    hint={depth && !selectedId ? t('Tap something first') : hint}
                    disabled={depth > 0 && !selectedId}
                    onSelect={() => setNetworkView({ focusDepth: depth })}
                  >
                    {label}
                  </MenuItem>
                ))}
              </>
            )}
            {lens === 'map' && (
              <>
                <MenuSeparator />
                <MenuItem icon={RotateCcw} hint={t('Put everything back where it started')} onSelect={() => resetLayout('orbit')}>
                  {t('Reset layout')}
                </MenuItem>
              </>
            )}
            <MenuSeparator />
            <MenuItem icon={CircleHelp} onSelect={help.toggle}>
              {help.shown ? t('Hide how this page works') : t('How this page works')}
            </MenuItem>
          </ViewMenu>
        </div>

        {help.shown && (
          <div className="absolute top-14 z-20 w-[min(360px,calc(100%-24px))] animate-rise" style={{ right: occluded + 12 }}>
            <HelpCard floating items={pageHelp(lens === 'map' ? 'orbit' : 'network') ?? []} onDone={help.close} />
          </div>
        )}

        {/* Side: the overview on Map, cycles and filters on Causes */}
        {sideVisible && (
          <div
            className="ticks absolute top-3 bottom-3 left-3 z-10 animate-fade-in overflow-hidden rounded-[2px] border border-line bg-surface/[0.9] shadow-2xl backdrop-blur-md"
            style={{ width: RAIL_WIDTH }}
          >
            {side}
          </div>
        )}

        {/* First step, only on an empty atlas */}
        {startCard && (
          <div
            className="absolute top-[64px] z-10 w-[min(440px,calc(100%-24px))] -translate-x-1/2 rounded-[2px] border border-line-strong bg-surface/95 px-4 py-3.5 backdrop-blur max-md:top-[108px]"
            style={{ left: isDesktop ? `calc(${leftInset}px + (100% - ${leftInset + occluded}px) / 2)` : '50%' }}
          >
            <div className="label">{t('Start here')}</div>
            <p className="mt-1 text-[13px] leading-snug text-ink-2">
              {t(
                'Write about something that happened, or add what your life is made of: what you value, what you are working on, the people around you. The map fills in from there.',
              )}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <Button size="sm" variant="primary" icon={Plus} onClick={() => useUI.getState().openCapture('journal')}>
                {t('Write a note')}
              </Button>
              <Button size="sm" icon={Plus} onClick={() => setAdding(true)}>
                {t('Add to the map')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => openEntity({ kind: 'area', id: 'self' })}>
                {t('Describe yourself')}
              </Button>
            </div>
          </div>
        )}

        {/* Key */}
        {!isMobile && (
          <div className="absolute bottom-6 z-10 transition-[right] duration-200" style={{ right: occluded + 12 }}>
            {lens === 'map' ? (
              <Legend
                links={links}
                claims={view.showClaims || Boolean(selectedId)}
                extra={
                  <>
                    <p className="text-[11.5px] leading-snug text-ink-3">
                      {t('Angle: the area of life. Rings, from you outward: what you hold, what you do, what surrounds you.')}
                    </p>
                    <p className="text-[11.5px] leading-snug text-ink-3">
                      {t(
                        'Arrowed arcs between areas: possible reasons that cross from one to the other. Dotted plain arcs: links you drew, which say nothing about causes. Tap one to see what it holds.',
                      )}
                    </p>
                    <p className="text-[11.5px] leading-snug text-ink-3">
                      {t(
                        'Each area shows its key elements; +n beside its name is what is folded inside. A dashed line to another area’s marker ties an element to what is folded there.',
                      )}
                    </p>
                    <p className="text-[11.5px] leading-snug text-ink-3">{t('Second ring around a mark: something you want explained or changed.')}</p>
                  </>
                }
              />
            ) : (
              <Legend
                extra={
                  <>
                    <p className="text-[11.5px] leading-snug text-ink-3">
                      {t('Read from top to bottom: each element sits below what may lead to it. Only the step that closes a cycle arcs back up.')}
                    </p>
                    <p className="text-[11.5px] leading-snug text-ink-3">
                      {t('Two strands: you (what you hold and do) and what surrounds you. Each rung pairs the two things at the same step of the chain.')}
                    </p>
                    <p className="text-[11.5px] leading-snug text-ink-3">{t('Only what a shown reason joins is on the helix. The map keeps everything.')}</p>
                  </>
                }
              />
            )}
          </div>
        )}
      </GraphCanvas>

      {!isDesktop && mobileSide && (
        <div className="absolute inset-0 z-30 flex animate-fade-in flex-col bg-surface sm:w-[360px] sm:border-r sm:border-line">
          {lens === 'causes' && (
            <div className="flex h-11 shrink-0 items-center justify-end border-b border-line pr-2">
              <IconButton icon={X} label={t('Close')} size="sm" onClick={() => setMobileSide(false)} />
            </div>
          )}
          <div className="min-h-0 flex-1">{side}</div>
        </div>
      )}
      {adding && <AddNodeModal layer="orbit" onClose={() => setAdding(false)} defaultArea={selectedArea} />}
    </div>
  );
}
