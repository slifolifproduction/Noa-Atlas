import { Minus, Plus, X } from 'lucide-react';
import { resolveSource } from '../../domain/selectors';
import type { Evidence } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { SourceLink } from './SourceLink';
import { t } from '../../i18n';

export function StanceMark({ stance }: { stance: Evidence['stance'] }) {
  const supports = stance === 'supports';
  const Icon = supports ? Plus : Minus;
  return (
    <span
      className="mt-[2px] inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[2px] border"
      style={{ borderColor: supports ? 'rgb(116 198 154 / 0.45)' : 'rgb(232 162 92 / 0.5)', color: supports ? 'var(--color-support)' : 'var(--color-counter)' }}
      title={supports ? t('Supporting evidence') : t('Counter-evidence')}
      aria-label={supports ? t('Supports') : t('Counters')}
    >
      <Icon size={11} strokeWidth={2.4} aria-hidden />
    </span>
  );
}

/** One piece of evidence: stance, source, date, and the exact passage. */
export function EvidenceRow({ evidence, onRemove }: { evidence: Evidence; onRemove?: () => void }) {
  const data = useAtlas((s) => s.data);
  const src = resolveSource(data, evidence.source);
  return (
    <li className="group flex gap-2.5 py-2">
      <StanceMark stance={evidence.stance} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <SourceLink source={evidence.source} />
          <span className="num text-[11px] text-ink-3">{formatDate(src.date)}</span>
          {evidence.weight > 1 && (
            <span className="num text-[11px] text-ink-3" title={t('Experiment results count double')}>
              ×{evidence.weight}
            </span>
          )}
          <span className="text-[11px] text-ink-3">· {evidence.addedBy === 'user' ? t('added by you') : t('proposed by analysis')}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">“{evidence.excerpt}”</p>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="h-6 w-6 shrink-0 rounded-[2px] text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
          aria-label={t('Remove this evidence')}
          title={t('Remove this evidence')}
        >
          <X size={13} className="mx-auto" aria-hidden />
        </button>
      )}
    </li>
  );
}
