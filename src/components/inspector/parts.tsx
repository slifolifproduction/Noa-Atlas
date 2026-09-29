import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { computeConfidence, pct } from '../../domain/confidence';
import { CATEGORY_META, DOMAIN_META, hubKey, isHubId } from '../../domain/constants';
import { decisionCode, displayNode, entryCode, patternCode } from '../../domain/selectors';
import type { EntityRef, ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { CATEGORY_ICONS, DOMAIN_ICONS, PatternIcon } from '../icons';

export function refForNode(id: ID): EntityRef {
  if (isHubId(id)) return { kind: 'domain', id: hubKey(id) };
  if (useAtlas.getState().data.patterns[id]) return { kind: 'pattern', id };
  return { kind: 'node', id };
}

export function nodeIcon(id: ID) {
  const data = useAtlas.getState().data;
  if (isHubId(id)) return DOMAIN_ICONS[hubKey(id)];
  if (data.patterns[id]) return PatternIcon;
  const n = data.nodes[id];
  if (n?.category) return CATEGORY_ICONS[n.category];
  if (n?.domain) return DOMAIN_ICONS[n.domain];
  return PatternIcon;
}

/** A clickable reference to another node; opening it pushes onto the panel trail. */
export function NodeChip({ id, className }: { id: ID; className?: string }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const d = displayNode(data, id);
  if (!d) return null;
  const Icon = nodeIcon(id);
  return (
    <button
      type="button"
      onClick={() => open(refForNode(id))}
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-[2px] border border-line bg-ink/[0.025] px-1.5 py-[3px] text-left text-[12.5px] leading-[17px] text-ink-2 transition-colors hover:border-line-strong hover:text-ink',
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

export function PatternRow({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const p = data.patterns[id];
  if (!p) return null;
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
          <span className="block text-[13px] leading-snug text-ink-2 group-hover:text-ink">{p.chain.join(' → ')}</span>
        </span>
        <span className="num shrink-0 pt-[1px] text-[12px] text-ink-2">{pct(computeConfidence(p.evidence))}</span>
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

export function KindEyebrow({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  if (isHubId(id)) return <span className="label">Domain</span>;
  const n = data.nodes[id];
  if (!n) return null;
  const parts = [n.domain ? DOMAIN_META[n.domain].label : null, n.category ? CATEGORY_META[n.category].label : null].filter(Boolean);
  return <span className="label">{[...new Set(parts)].join(' · ')}</span>;
}

export function Muted({ children }: { children: ReactNode }) {
  return <p className="text-[12.5px] leading-relaxed text-ink-3">{children}</p>;
}
