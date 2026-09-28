import type { FitViewOptions } from '@xyflow/react';
import { Brain, Eye, EyeOff, Plus, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AddNodeModal } from '../../components/graph/AddNodeModal';
import { GraphCanvas } from '../../components/graph/GraphCanvas';
import { GraphSearch, ToolGroup, ZoomControls } from '../../components/graph/GraphToolbar';
import { RelationSwatch } from '../../components/graph/Legend';
import { CATEGORY_ICONS, PatternIcon } from '../../components/icons';
import { INSPECTOR_WIDTH } from '../../components/inspector/Inspector';
import { refForNode } from '../../components/inspector/parts';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState, Segmented } from '../../components/ui/primitives';
import { CATEGORIES, RELATION_META } from '../../domain/constants';
import type { ID, MindCategory, RelationType } from '../../domain/types';
import { buildMind, mindLinks, mindMembers } from '../../graph/build';
import { mindLayout } from '../../graph/layout';
import { selectionFor } from '../../graph/selection';
import { useIsDesktop, useIsMobile } from '../../hooks/useMediaQuery';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI, type MindView } from '../../state/uiStore';

const RAIL_WIDTH = 236;
const MIND_RELATIONS: RelationType[] = ['causes', 'influences', 'supports', 'conflicts', 'contradicts', 'derived_from', 'examines', 'depends_on'];
const ALL_MEMBERS = { hiddenCategories: [] as MindCategory[], showInferred: true, showPatterns: true };

export function MindPage() {
  const data = useAtlas((s) => s.data);
  const inspector = useUI((s) => s.inspector);
  const stored = useUI((s) => s.layouts.mind.positions);
  const view = useUI((s) => s.mindView);
  const setMindView = useUI((s) => s.setMindView);
  const setPositions = useUI((s) => s.setPositions);
  const resetLayout = useUI((s) => s.resetLayout);
  const openEntity = useUI((s) => s.openEntity);
  const closeInspector = useUI((s) => s.closeInspector);
  const requestFocus = useUI((s) => s.requestFocus);
  const isDesktop = useIsDesktop();
  const isMobile = useIsMobile();
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Lay out every mind node (not just the visible ones) so filtering never reshuffles the map.
  const computed = useMemo(() => {
    const { nodeIds, patternIds } = mindMembers(data, ALL_MEMBERS);
    return mindLayout(data, { nodeIds, patternIds, links: mindLinks(data) }, stored);
  }, [data, stored]);
  useEffect(() => {
    if (Object.keys(computed).length) setPositions('mind', computed);
  }, [computed, setPositions]);
  const positions = useMemo(() => ({ ...stored, ...computed }), [stored, computed]);

  const selectedId = selectionFor(inspector, 'mind', data);
  const built = useMemo(() => buildMind(data, { positions, view, selectedId, query }), [data, positions, view, selectedId, query]);
  const onSelect = useCallback((id: ID | null) => (id ? openEntity(refForNode(id)) : closeInspector()), [openEntity, closeInspector]);

  const counts = useMemo(() => {
    const c = Object.fromEntries(CATEGORIES.map((x) => [x.key, 0])) as Record<MindCategory, number>;
    for (const n of Object.values(data.nodes)) if (n.category) c[n.category]++;
    return c;
  }, [data.nodes]);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  const occluded = isDesktop && inspector.length ? INSPECTOR_WIDTH : 0;
  const railVisible = isDesktop;
  const padding = useMemo(
    (): FitViewOptions['padding'] => (isMobile ? 0.08 : { top: '64px', bottom: '32px', left: `${(railVisible ? RAIL_WIDTH + 24 : 12) + 16}px`, right: `${occluded + 24}px` }),
    [isMobile, railVisible, occluded],
  );

  const filters = <MindFilters view={view} setView={setMindView} counts={counts} />;

  return (
    <div className="relative h-full overflow-hidden">
      <GraphCanvas layer="mind" built={built} selectedId={selectedId} onSelect={onSelect} occludedRight={occluded} fitPadding={padding} fitMinZoom={isMobile ? 0.6 : undefined} minimap>
        {railVisible && (
          <div className="absolute top-3 bottom-3 left-3 z-10 flex flex-col overflow-hidden rounded-[10px] border border-line bg-surface/[0.96] backdrop-blur-md" style={{ width: RAIL_WIDTH }}>
            <div className="border-b border-line px-4 pt-3 pb-3">
              <div className="label">02 · Mind</div>
              <div className="mt-0.5 text-[15px] font-medium tracking-[-0.01em] text-ink">How am I thinking?</div>
              <p className="mt-1 text-[12px] leading-snug text-ink-3">{total} nodes. Dashed borders: inferred or untested.</p>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{filters}</div>
          </div>
        )}

        <div className="absolute top-3 z-10 flex flex-wrap items-center justify-end gap-1.5" style={{ right: occluded + 12, left: isMobile ? 12 : undefined }}>
          {!isDesktop && (
            <Button size="sm" icon={SlidersHorizontal} onClick={() => setFiltersOpen(true)} className="mr-auto bg-surface/95">
              Filters
            </Button>
          )}
          <GraphSearch
            query={query}
            onQuery={setQuery}
            matches={built.matches}
            onPick={(id) => {
              openEntity(refForNode(id));
              requestFocus('mind', id);
            }}
          />
          <div title={selectedId ? 'Show only what is near the selection' : 'Select a node to focus on its neighbourhood'}>
            <Segmented<MindView['focusDepth']>
              label="Neighbourhood"
              size="sm"
              value={selectedId ? view.focusDepth : 0}
              onChange={(focusDepth) => setMindView({ focusDepth })}
              options={[
                { value: 0, label: 'All' },
                { value: 1, label: '1 hop' },
                { value: 2, label: '2 hops' },
              ]}
            />
          </div>
          <ToolGroup>
            <IconButton icon={RotateCcw} size="sm" label="Reset layout" onClick={() => resetLayout('mind')} />
            <IconButton icon={Plus} size="sm" label="Add to Mind" onClick={() => setAdding(true)} />
          </ToolGroup>
          {!isMobile && <ZoomControls padding={padding} />}
        </div>

        {total === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-6">
            <EmptyState
              icon={Brain}
              title="Your Mind graph is empty"
              className="max-w-[380px] bg-surface/95"
              action={
                <Button size="sm" variant="primary" icon={Plus} onClick={() => setAdding(true)}>
                  Add a belief or question
                </Button>
              }
            >
              Start with one belief you act on, one assumption you have never tested, and one open question. Connections come next.
            </EmptyState>
          </div>
        )}
      </GraphCanvas>

      {!isDesktop && filtersOpen && (
        <div className="absolute inset-0 z-30 flex animate-fade-in flex-col bg-surface">
          <div className="flex h-11 items-center justify-between border-b border-line pr-2 pl-4">
            <span className="label">Filters</span>
            <IconButton icon={X} label="Close filters" size="sm" onClick={() => setFiltersOpen(false)} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{filters}</div>
        </div>
      )}
      {adding && <AddNodeModal layer="mind" onClose={() => setAdding(false)} />}
    </div>
  );
}

function MindFilters({ view, setView, counts }: { view: MindView; setView(p: Partial<MindView>): void; counts: Record<MindCategory, number> }) {
  const hidden = new Set(view.hiddenCategories);
  const hiddenRel = new Set(view.hiddenRelations);
  const isolated = CATEGORIES.filter((c) => !hidden.has(c.key)).length === 1;
  return (
    <div className="pb-3">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <span className="label">Categories</span>
        {hidden.size > 0 && (
          <button type="button" className="text-[11.5px] text-accent hover:underline" onClick={() => setView({ hiddenCategories: [] })}>
            Show all
          </button>
        )}
      </div>
      <ul className="px-2">
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICONS[c.key];
          const on = !hidden.has(c.key);
          const only = isolated && on;
          return (
            <li key={c.key} className="group flex items-center">
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setView({ hiddenCategories: on ? [...hidden, c.key] : [...hidden].filter((k) => k !== c.key) })}
                className={cn('flex min-w-0 flex-1 items-center gap-2.5 rounded-[6px] px-2 py-[5px] text-left transition-colors hover:bg-white/[0.04]', !on && 'opacity-45')}
                title={c.description}
              >
                <Icon size={13} color={c.color} strokeWidth={1.9} aria-hidden />
                <span className="flex-1 truncate text-[12.5px] text-ink-2">{c.plural}</span>
                <span className="num text-[11px] text-ink-3">{counts[c.key]}</span>
              </button>
              <button
                type="button"
                onClick={() => setView({ hiddenCategories: only ? [] : CATEGORIES.filter((x) => x.key !== c.key).map((x) => x.key) })}
                className={cn('ml-0.5 rounded px-1.5 py-0.5 text-[10.5px] text-ink-3 hover:bg-white/[0.05] hover:text-ink', only ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                aria-label={only ? 'Show all categories' : `Show only ${c.plural}`}
              >
                {only ? 'all' : 'only'}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 border-t border-line px-4 pt-3 pb-1">
        <span className="label">Relationships</span>
      </div>
      <ul className="px-2">
        {MIND_RELATIONS.map((r) => {
          const on = !hiddenRel.has(r);
          return (
            <li key={r}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => setView({ hiddenRelations: on ? [...hiddenRel, r] : [...hiddenRel].filter((x) => x !== r) })}
                className={cn('flex w-full items-center gap-2.5 rounded-[6px] px-2 py-[5px] text-left hover:bg-white/[0.04]', !on && 'opacity-40')}
                title={RELATION_META[r].description}
              >
                <RelationSwatch relation={r} width={24} />
                <span className="text-[12.5px] text-ink-2">{RELATION_META[r].label}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 border-t border-line px-4 pt-3 pb-1">
        <span className="label">Show</span>
      </div>
      <div className="px-2">
        <ToggleRow on={view.showPatterns} onClick={() => setView({ showPatterns: !view.showPatterns })} icon={<PatternIcon size={13} className="text-ink-2" aria-hidden />}>
          Detected patterns
        </ToggleRow>
        <ToggleRow on={view.showInferred} onClick={() => setView({ showInferred: !view.showInferred })} icon={view.showInferred ? <Eye size={13} className="text-ink-2" aria-hidden /> : <EyeOff size={13} className="text-ink-3" aria-hidden />}>
          Inferred nodes
        </ToggleRow>
      </div>
    </div>
  );
}

function ToggleRow({ on, onClick, icon, children }: { on: boolean; onClick(): void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cn('flex w-full items-center gap-2.5 rounded-[6px] px-2 py-[5px] text-left hover:bg-white/[0.04]', !on && 'opacity-45')}>
      {icon}
      <span className="flex-1 text-[12.5px] text-ink-2">{children}</span>
      <span className={cn('h-3.5 w-6 rounded-full p-[2px] transition-colors', on ? 'bg-accent/60' : 'bg-white/10')} aria-hidden>
        <span className={cn('block h-2.5 w-2.5 rounded-full bg-ink transition-transform', on && 'translate-x-2.5')} />
      </span>
    </button>
  );
}
