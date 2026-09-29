import { Check } from 'lucide-react';
import { KNOWLEDGE_HINT, KNOWLEDGE_LABEL, REGULARITY_HINT, REGULARITY_LABEL, STATUS_LADDER, STATUS_META } from '../../domain/constants';
import type { ClaimStatus, Knowledge, Regularity } from '../../domain/types';
import { cn } from '../../lib/cn';
import { t } from '../../i18n';
import { StatusSwatch } from '../graph/Legend';

/** A claim's derived status: its line style and its name. Never a number. */
export function StatusBadge({ status, className }: { status: ClaimStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap', className)} title={m.description}>
      <StatusSwatch status={status} width={18} />
      <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-2 uppercase">{m.label}</span>
    </span>
  );
}

/**
 * The ladder a claim climbs: proposed → plausible → supported → tested. Each
 * rung names what it takes, so the status always explains itself.
 */
export function StatusLadder({ status }: { status: ClaimStatus }) {
  const off = status === 'weakened' || status === 'retired';
  const rank = STATUS_META[status].rank;
  return (
    <div>
      <ol className="grid grid-cols-4 gap-1" aria-label={t('How well supported')}>
        {STATUS_LADDER.map((s) => {
          const reached = !off && STATUS_META[s].rank <= rank;
          const current = s === status;
          return (
            <li key={s} className="min-w-0" title={STATUS_META[s].description}>
              <div className={cn('h-[3px] rounded-full', reached ? 'bg-ink-2' : 'bg-ink/[0.08]', current && 'bg-ink')} />
              <div className={cn('mt-1 flex items-center gap-1 truncate text-[11px]', current ? 'text-ink' : reached ? 'text-ink-2' : 'text-ink-3')}>
                {reached && !current && <Check size={10} aria-hidden />}
                {STATUS_META[s].label}
              </div>
            </li>
          );
        })}
      </ol>
      {off && (
        <p className="mt-1.5 text-[12px] text-ink-2">
          <StatusBadge status={status} /> <span className="text-ink-3">— {STATUS_META[status].description}</span>
        </p>
      )}
    </div>
  );
}

/** Where something comes from, as a quiet mark: your words, seen in your notes, suggested, imagined… */
export function KnowledgeTag({ kind, className }: { kind: Knowledge; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-[11.5px] whitespace-nowrap text-ink-3', className)} title={KNOWLEDGE_HINT[kind]}>
      <span
        className={cn('h-1.5 w-1.5 rounded-full', kind === 'suggested' || kind === 'imagined' ? 'border border-dashed border-ink-3' : 'bg-ink-3')}
        aria-hidden
      />
      {KNOWLEDGE_LABEL[kind]}
    </span>
  );
}

/** A pattern's regularity, derived from when its instances fell. */
export function RegularityTag({ regularity }: { regularity: Regularity }) {
  return (
    <span className="font-mono text-[10.5px] tracking-[0.08em] text-ink-2 uppercase" title={REGULARITY_HINT[regularity]}>
      {REGULARITY_LABEL[regularity]}
    </span>
  );
}
