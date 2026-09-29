import type { FitViewOptions } from '@xyflow/react';
import { ChevronRight, CircleHelp, Eye, EyeOff, Filter, Plus, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddNodeModal } from '../../components/graph/AddNodeModal';
import { GraphCanvas } from '../../components/graph/GraphCanvas';
import { GraphSearch, ViewMenu } from '../../components/graph/GraphToolbar';
import { Legend, StatusSwatch } from '../../components/graph/Legend';
import { ClaimIcon, LoopIcon } from '../../components/icons';
import { refForNode } from '../../components/inspector/parts';
import { Button, IconButton } from '../../components/ui/Button';
import { HelpCard, pageHelp, useGraphHelp } from '../../components/ui/HowItWorks';
import { MenuItem, MenuLabel, MenuSeparator } from '../../components/ui/Menu';
import { EmptyState } from '../../components/ui/primitives';
import { claimStatus } from '../../domain/claims';
import { AREAS, CLAIM_STATUSES, STATUS_META } from '../../domain/constants';
import { findLoops, type Loop } from '../../domain/loops';
import type { AreaKey, ClaimStatus, ID } from '../../domain/types';
import { buildNetwork, networkLinks, networkMembers } from '../../graph/build';
import { networkLayout } from '../../graph/layout';
import { selectionFor } from '../../graph/selection';
import { useInspectorWidth, useIsDesktop, useIsMobile } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI, type NetworkView } from '../../state/uiStore';
import { t, tn } from '../../i18n';

const RAIL_WIDTH = 248;
const EVERYTHING = { hiddenStatuses: [] as ClaimStatus[], hiddenAreas: [] as AreaKey[], showSuggested: true };

/**
 * Connections: what is claimed to affect what. Every line is a claim with a
 * status derived from its evidence; loops appear where claims close a circle.
 * Declared links live on Orbit, so this page only shows influence.
 */
export function NetworkPage() {
  const data = useAtlas((s) => s.data);
  const inspector = useUI((s) => s.inspector);
  const stored = useUI((s) => s.layouts.network.positions);
  const view = useUI((s) => s.networkView);
  const setNetworkView = useUI((s) => s.setNetworkView);
  const setPositions = useUI((s) => s.setPositions);
  const resetLayout = useUI((s) => s.resetLayout);
  const openEntity = useUI((s) => s.openEntity);
  const closeInspector = useUI((s) => s.closeInspector);
  const requestFocus = useUI((s) => s.requestFocus);
  const isDesktop = useIsDesktop();
  const panelWidth = useInspectorWidth();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const help = useGraphHelp('network');

  // Lay out every element any claim touches (not just the visible ones) so filtering never reshuffles the map.
  const computed = useMemo(() => {
    const { nodeIds } = networkMembers(data, EVERYTHING);
    return networkLayout(data, nodeIds, networkLinks(data), stored);
  }, [data, stored]);
  useEffect(() => {
    if (Object.keys(computed).length) setPositions('network', computed);
  }, [computed, setPositions]);
  const positions = useMemo(() => ({ ...stored, ...computed }), [stored, computed]);

  const selectedId = selectionFor(inspector, 'network', data);
  const built = useMemo(() => buildNetwork(data, { positions, view, selectedId, query }), [data, positions, view, selectedId, query]);
  const onSelect = useCallback((id: ID | null) => (id ? openEntity(refForNode(id)) : closeInspector()), [openEntity, closeInspector]);

  const loops = useMemo(() => findLoops(data), [data]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(CLAIM_STATUSES.map((x) => [x.key, 0])) as Record<ClaimStatus, number>;
    for (const claim of Object.values(data.claims)) if (claim.state === 'adopted') c[claimStatus(data, claim)]++;
    return c;
  }, [data]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const suggested = Object.values(data.claims).filter((c) => c.state === 'suggested').length;

  const occluded = inspector.length ? panelWidth : 0;
  const railVisible = isDesktop;
  const padding = useMemo(
    (): FitViewOptions['padding'] =>
      isMobile ? 0.08 : { top: '64px', bottom: '32px', left: `${(railVisible ? RAIL_WIDTH + 24 : 12) + 16}px`, right: `${occluded + 24}px` },
    [isMobile, railVisible, occluded],
  );

  const filters = (
    <NetworkFilters
      view={view}
      setView={setNetworkView}
      counts={counts}
      suggested={suggested}
      loops={loops}
      onLoop={(loop) => {
        const on = view.loopId === loop.id;
        setNetworkView({ loopId: on ? undefined : loop.id });
        if (!on) openEntity({ kind: 'loop', id: loop.id });
      }}
    />
  );

  return (
    <div className="relative h-full overflow-hidden">
      <GraphCanvas
        layer="network"
        built={built}
        selectedId={selectedId}
        onSelect={onSelect}
        occludedRight={occluded}
        persistViewport={!isMobile}
        fitPadding={padding}
        fitMinZoom={isMobile ? 0.6 : undefined}
        occludedLeft={railVisible ? RAIL_WIDTH + 24 : 0}
        minimap
        living
      >
        {railVisible && (
          <div
            className="ticks absolute top-3 bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-[2px] border border-line bg-surface/[0.9] backdrop-blur-md"
            style={{ width: RAIL_WIDTH }}
          >
            <div className="border-b border-line px-4 pt-3 pb-2.5">
              <div className="label text-ink-2!">{t('What affects what')}</div>
              <p className="mt-1 text-[12px] leading-snug text-ink-3">
                {tn(
                  total,
                  '{n} claim. Each line is a hypothesis; its style shows how well the record supports it.',
                  '{n} claims. Each line is a hypothesis; its style shows how well the record supports it.',
                )}
              </p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{filters}</div>
          </div>
        )}

        <div className="absolute top-3 z-10 flex flex-wrap items-center justify-end gap-1.5" style={{ right: occluded + 12, left: isMobile ? 12 : undefined }}>
          {!isDesktop && (
            <Button size="sm" icon={Filter} onClick={() => setFiltersOpen(true)} className="mr-auto bg-surface/95">
              {t('Filter')}
            </Button>
          )}
          <GraphSearch
            query={query}
            onQuery={setQuery}
            matches={built.matches}
            onPick={(id) => {
              openEntity(refForNode(id));
              requestFocus('network', id);
            }}
          />
          <Button
            size="sm"
            icon={Plus}
            onClick={() => setAdding(true)}
            title={t('Add an element; drag from one element to another to make a claim')}
            className="bg-surface/95"
          >
            {t('Add')}
          </Button>
          <ViewMenu padding={padding}>
            <MenuLabel>{t('Around the selected element')}</MenuLabel>
            {(
              [
                [0, t('Everything'), t('Show the whole network')],
                [1, t('Only direct effects'), t('What acts on it and what it acts on')],
                [2, t('Wider'), t('Also what acts on those')],
              ] as const
            ).map(([depth, label, hint]) => (
              <MenuItem
                key={depth}
                radio
                checked={(selectedId ? view.focusDepth : 0) === depth}
                hint={depth && !selectedId ? t('Select an element first') : hint}
                disabled={depth > 0 && !selectedId}
                onSelect={() => setNetworkView({ focusDepth: depth })}
              >
                {label}
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem icon={RotateCcw} hint={t('Put every card back where it started')} onSelect={() => resetLayout('network')}>
              {t('Reset layout')}
            </MenuItem>
            <MenuItem icon={CircleHelp} onSelect={help.toggle}>
              {help.shown ? t('Hide how this page works') : t('How this page works')}
            </MenuItem>
          </ViewMenu>
        </div>

        {help.shown && (
          <div className="absolute top-14 z-20 w-[min(360px,calc(100%-24px))] animate-rise" style={{ right: occluded + 12 }}>
            <HelpCard floating items={pageHelp('network') ?? []} onDone={help.close} />
          </div>
        )}

        {!isMobile && (
          <div className="absolute bottom-6 z-10 transition-[right] duration-200" style={{ right: occluded + 172 }}>
            <Legend />
          </div>
        )}

        {total + suggested === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <EmptyState icon={ClaimIcon} title={t('No claims yet')} className="max-w-[400px] bg-surface/95">
              {t(
                'A claim says one thing changes another: "taking on more work lowers my progress". Make one by dragging from one element to another on Orbit, or from a note that explains a cause in your own words.',
              )}
            </EmptyState>
          </div>
        )}
      </GraphCanvas>

      {!isDesktop && filtersOpen && (
        <div className="absolute inset-0 z-30 flex animate-fade-in flex-col bg-surface">
          <div className="flex h-11 items-center justify-between border-b border-line pr-2 pl-4">
            <span className="label">{t('What to show')}</span>
            <IconButton icon={X} label={t('Close')} size="sm" onClick={() => setFiltersOpen(false)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{filters}</div>
        </div>
      )}
      {adding && <AddNodeModal layer="network" onClose={() => setAdding(false)} />}
    </div>
  );
}

function NetworkFilters({
  view,
  setView,
  counts,
  suggested,
  loops,
  onLoop,
}: {
  view: NetworkView;
  setView(p: Partial<NetworkView>): void;
  counts: Record<ClaimStatus, number>;
  suggested: number;
  loops: Loop[];
  onLoop(loop: Loop): void;
}) {
  const hidden = new Set(view.hiddenStatuses);
  const hiddenAreas = new Set(view.hiddenAreas);
  const [more, setMore] = useState(hiddenAreas.size > 0);
  return (
    <div className="pb-3">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="label">{t('Loops')}</span>
        {view.loopId && (
          <button type="button" className="text-[11.5px] text-accent hover:underline" onClick={() => setView({ loopId: undefined })}>
            {t('Clear')}
          </button>
        )}
      </div>
      {loops.length ? (
        <ul className="px-2">
          {loops.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                aria-pressed={view.loopId === l.id}
                onClick={() => onLoop(l)}
                className={cn(
                  'flex w-full items-start gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]',
                  view.loopId === l.id && 'bg-ink/[0.06]',
                )}
              >
                <LoopIcon size={13} className="mt-[3px] shrink-0 text-ink-2" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink-2">
                    {l.name ?? (l.type === 'reinforcing' ? t('A reinforcing loop') : t('A balancing loop'))}
                  </span>
                  <span className="block text-[11px] text-ink-3">
                    {l.type === 'reinforcing' ? t('Reinforcing') : t('Balancing')} · {tn(l.claimIds.length, '{n} link', '{n} links')} ·{' '}
                    {t('weakest: {status}', { status: STATUS_META[l.weakest].label.toLowerCase() })}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 text-[12px] text-ink-3">{t('None yet. A loop appears when claims close a circle.')}</p>
      )}

      <div className="mt-2 flex items-center justify-between border-t border-line px-4 pt-3 pb-1">
        <span className="label">{t('How well supported')}</span>
        {hidden.size > 0 && (
          <button type="button" className="text-[11.5px] text-accent hover:underline" onClick={() => setView({ hiddenStatuses: [] })}>
            {t('Show all')}
          </button>
        )}
      </div>
      <ul className="px-2">
        {CLAIM_STATUSES.map((s) => {
          const on = !hidden.has(s.key);
          return (
            <li key={s.key}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setView({ hiddenStatuses: on ? [...hidden, s.key] : [...hidden].filter((k) => k !== s.key) })}
                className={cn('flex w-full items-center gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]', !on && 'opacity-45')}
                title={s.description}
              >
                <StatusSwatch status={s.key} width={24} />
                <span className="flex-1 truncate text-[12.5px] text-ink-2">{s.label}</span>
                <span className="num text-[11px] text-ink-3">{counts[s.key]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-2">
        <ToggleRow
          on={view.showSuggested}
          onClick={() => setView({ showSuggested: !view.showSuggested })}
          icon={view.showSuggested ? <Eye size={13} className="text-ink-2" aria-hidden /> : <EyeOff size={13} className="text-ink-3" aria-hidden />}
          count={suggested}
        >
          {t('Proposals from the analysis')}
        </ToggleRow>
      </div>

      <div className="mt-2 border-t border-line px-2 pt-2">
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore(!more)}
          className="flex w-full items-center gap-2 rounded-[2px] px-2 py-[5px] text-left text-[12.5px] text-ink-2 hover:bg-ink/[0.04] hover:text-ink"
        >
          <ChevronRight size={13} className={cn('text-ink-3 transition-transform', more && 'rotate-90')} aria-hidden />
          <span className="flex-1">{t('Areas of life')}</span>
          {hiddenAreas.size > 0 && <span className="num text-[11px] text-accent">{t('{n} off', { n: hiddenAreas.size })}</span>}
        </button>
      </div>
      {more && (
        <ul className="px-2">
          {AREAS.map((a) => {
            const on = !hiddenAreas.has(a.key);
            return (
              <li key={a.key}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => setView({ hiddenAreas: on ? [...hiddenAreas, a.key] : [...hiddenAreas].filter((k) => k !== a.key) })}
                  className={cn('flex w-full items-center gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]', !on && 'opacity-45')}
                >
                  <span className="h-3 w-[2px] shrink-0" style={{ background: a.color }} aria-hidden />
                  <span className="flex-1 truncate text-[12.5px] text-ink-2">{a.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ToggleRow({ on, onClick, icon, count, children }: { on: boolean; onClick(): void; icon: React.ReactNode; count?: number; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn('flex w-full items-center gap-2.5 rounded-[2px] px-2 py-[5px] text-left hover:bg-ink/[0.04]', !on && 'opacity-45')}
    >
      {icon}
      <span className="flex-1 text-[12.5px] text-ink-2">{children}</span>
      {count !== undefined && <span className="num text-[11px] text-ink-3">{count}</span>}
      <span className={cn('h-3.5 w-6 rounded-full p-[2px] transition-colors', on ? 'bg-accent/60' : 'bg-ink/10')} aria-hidden>
        <span className={cn('block h-2.5 w-2.5 rounded-full bg-ink transition-transform', on && 'translate-x-2.5')} />
      </span>
    </button>
  );
}
