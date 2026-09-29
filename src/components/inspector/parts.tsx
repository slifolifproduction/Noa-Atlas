import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { claimCode, claimSentence, claimStatus } from '../../domain/claims';
import { AREA_META, areaHubKey, isAreaHubId, KIND_META, LAYER_META, layerOf, OCCURRENCE_KIND_LABEL, YOU_ID } from '../../domain/constants';
import type { HistoryItem } from '../../domain/history';
import { decisionCode, displayNode, entryCode, patternCode, patternStats, patternTitle } from '../../domain/selectors';
import type { EntityRef, ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { RegularityTag, StatusBadge } from '../evidence/Status';
import { AREA_ICONS, ClaimIcon, HISTORY_ICONS, KIND_ICONS, PatternIcon } from '../icons';
import { t } from '../../i18n';

export function refForNode(id: ID): EntityRef {
  if (id === YOU_ID) return { kind: 'area', id: 'self' };
  if (isAreaHubId(id)) return { kind: 'area', id: areaHubKey(id) };
  if (useAtlas.getState().data.patterns[id]) return { kind: 'pattern', id };
  return { kind: 'node', id };
}

export function nodeIcon(id: ID) {
  const data = useAtlas.getState().data;
  if (id === YOU_ID) return AREA_ICONS.self;
  if (isAreaHubId(id)) return AREA_ICONS[areaHubKey(id)];
  if (data.patterns[id]) return PatternIcon;
  const n = data.nodes[id];
  return n ? KIND_ICONS[n.kind] : PatternIcon;
}

/** A clickable reference to an element or area; opening it pushes onto the panel trail. */
export function NodeChip({ id, className }: { id: ID; className?: string }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const d = displayNode(data, id);
  if (!d) return null;
  const Icon = nodeIcon(id);
  const suggested = d.node && !d.node.adopted;
  return (
    <button
      type="button"
      onClick={() => open(refForNode(id))}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-[2px] border bg-ink/[0.025] px-1.5 py-[3px] text-left text-[12.5px] leading-[17px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink',
        suggested ? 'border-dashed border-line-strong' : 'border-line',
        className,
      )}
      title={`${d.kindLabel}: ${d.label}`}
    >
      <Icon size={12} strokeWidth={1.9} color={d.color} className="shrink-0" aria-hidden />
      <span className="truncate">{d.label}</span>
    </button>
  );
}

/** Row linking to a raw record: "Entry #12 · Mar 9 — Title". */
export function RecordRow({ kind, id, meta }: { kind: 'entry' | 'decision'; id: ID; meta?: ReactNode }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const rec = kind === 'entry' ? data.entries[id] : data.decisions[id];
  if (!rec) return null;
  const code = kind === 'entry' ? entryCode(rec.seq) : decisionCode(rec.seq);
  return (
    <li>
      <button
        type="button"
        onClick={() => open({ kind, id })}
        className="group flex w-full items-baseline gap-2 rounded-[2px] px-1.5 py-1 text-left hover:bg-ink/[0.035]"
      >
        <span className="num w-[84px] shrink-0 text-[11px] tracking-[0.04em] text-ink-3">{code}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink-2 group-hover:text-ink">{rec.title}</span>
        {meta}
        <span className="num shrink-0 text-[11px] text-ink-3">{formatDate(rec.date)}</span>
      </button>
    </li>
  );
}

/** One moment on the timeline: an event, action, reading, decision, note, test or step. */
export function HistoryRow({ item }: { item: HistoryItem }) {
  const open = useUI((s) => s.openEntity);
  const Icon = HISTORY_ICONS[item.kind];
  const target = item.ref;
  return (
    <li>
      <button
        type="button"
        disabled={!target}
        onClick={() => target && open(target)}
        className="group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1 text-left enabled:hover:bg-ink/[0.035]"
      >
        <span className="num w-[62px] shrink-0 pt-[1px] text-[11px] text-ink-3">{formatDate(item.date)}</span>
        <Icon size={12} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
        <span className={cn('min-w-0 flex-1 text-[12.5px] leading-snug', item.mode === 'actual' ? 'text-ink-2 group-hover:text-ink' : 'text-ink-3 italic')}>
          {item.label}
          <span className="ml-1.5 font-mono text-[10px] tracking-wide text-ink-3 uppercase not-italic">
            {OCCURRENCE_KIND_LABEL[item.kind as keyof typeof OCCURRENCE_KIND_LABEL] ?? ''}
          </span>
        </span>
      </button>
    </li>
  );
}

export function PatternRow({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const p = data.patterns[id];
  if (!p) return null;
  const stats = patternStats(data, p);
  return (
    <li>
      <button
        type="button"
        onClick={() => open({ kind: 'pattern', id })}
        className="group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink/[0.035]"
      >
        <PatternIcon size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="label block">{patternCode(p.code)}</span>
          <span className="block text-[13px] leading-snug text-ink-2 group-hover:text-ink">{patternTitle(p)}</span>
        </span>
        <span className="shrink-0 pt-[1px]">
          <RegularityTag regularity={stats.regularity} />
        </span>
        <ChevronRight size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
      </button>
    </li>
  );
}

/** A claim as a sentence, hedged by its status, with the status beside it. */
export function ClaimRow({ id, className }: { id: ID; className?: string }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const c = data.claims[id];
  if (!c) return null;
  const status = claimStatus(data, c);
  return (
    <li className={className}>
      <button
        type="button"
        onClick={() => open({ kind: 'claim', id })}
        className={cn(
          'group flex w-full items-start gap-2 rounded-[2px] px-1.5 py-1.5 text-left hover:bg-ink/[0.035]',
          c.state === 'suggested' && 'opacity-80',
        )}
      >
        <ClaimIcon size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="label">{claimCode(c.code)}</span>
            <StatusBadge status={status} />
            {c.state === 'suggested' && <span className="font-mono text-[10px] tracking-wide text-ink-3 uppercase">{t('suggested')}</span>}
          </span>
          <span className="mt-0.5 block text-[13px] leading-snug text-ink-2 group-hover:text-ink">{claimSentence(data, c, status)}</span>
        </span>
        <ChevronRight size={13} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
      </button>
    </li>
  );
}

export function PanelSection({ title, count, children, aside }: { title: string; count?: number; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-t border-line px-4 pt-3 pb-3.5">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="label">
          {title}
          {count !== undefined && <span className="num ml-1.5 text-ink-3">{count}</span>}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** "Belief · Work · What I hold": what an element is and where it sits. */
export function KindEyebrow({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  if (id === YOU_ID) return <span className="label">{t('You')}</span>;
  if (isAreaHubId(id)) return <span className="label">{t('Area of life')}</span>;
  const n = data.nodes[id];
  if (!n) return null;
  const parts = [KIND_META[n.kind].label, AREA_META[n.area].label, n.area === 'self' ? null : LAYER_META[layerOf(n.kind)].label];
  return <span className="label">{parts.filter(Boolean).join(' · ')}</span>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-ink-3">{children}</p>;
}
