import { resolveSource } from '../../domain/selectors';
import type { SourceRef } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';

/** "Entry #12" as a link that opens the record in the inspector, without leaving the page. */
export function SourceLink({ source, showTitle, className }: { source: SourceRef; showTitle?: boolean; className?: string }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const r = resolveSource(data, source);
  if (!r.exists) return <span className="num text-[12px] text-ink-3 line-through">{r.code}</span>;
  return (
    <button
      type="button"
      onClick={() => open({ kind: source.kind, id: source.id })}
      className={cn('group inline-flex min-w-0 items-baseline gap-1.5 text-left', className)}
      title={`${r.code} · ${r.title} · ${formatDate(r.date)}`}
    >
      <span className="num shrink-0 text-[11.5px] tracking-[0.02em] text-ink-2 underline decoration-ink-3/40 underline-offset-[3px] group-hover:text-ink group-hover:decoration-ink">
        {r.code}
      </span>
      {showTitle && <span className="truncate text-[12.5px] text-ink-2 group-hover:text-ink">{r.title}</span>}
    </button>
  );
}
