import { Circle, Minus, Plus, X } from 'lucide-react';
import { EVIDENCE_KIND_HINT, EVIDENCE_KIND_LABEL } from '../../domain/constants';
import { resolveSource } from '../../domain/selectors';
import type { Evidence } from '../../domain/types';
import { daysBetween, formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { SourceLink } from './SourceLink';
import { t } from '../../i18n';

/** For, against, or neither: the outcome happening without the cause bears on the outcome, not on this explanation. */
export function StanceMark({ stance }: { stance: Evidence['stance'] }) {
  const supports = stance === 'supports';
  const neutral = stance === 'neutral';
  const Icon = supports ? Plus : neutral ? Circle : Minus;
  return (
    <span
      className="mt-[2px] inline-flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[2px] border"
      style={{
        borderColor: supports ? 'rgb(116 198 154 / 0.45)' : neutral ? 'var(--color-line-strong)' : 'rgb(232 162 92 / 0.5)',
        color: supports ? 'var(--color-support)' : neutral ? 'var(--color-ink-3)' : 'var(--color-counter)',
      }}
      title={supports ? t('Supporting evidence') : neutral ? t('Neither for nor against: another route to the outcome') : t('Counter-evidence')}
      aria-label={supports ? t('Supports') : neutral ? t('Another route') : t('Counters')}
    >
      <Icon size={11} strokeWidth={2.4} aria-hidden />
    </span>
  );
}

/** One piece of evidence: stance, source, date, and the exact passage. */
export function EvidenceRow({ evidence, onRemove }: { evidence: Evidence; onRemove?: () => void }) {
  const data = useAtlas((s) => s.data);
  const src = resolveSource(data, evidence.source);
  const cause = evidence.cause ? resolveSource(data, evidence.cause) : undefined;
  return (
    <li className="group flex gap-2.5 py-2">
      <StanceMark stance={evidence.stance} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <SourceLink source={evidence.source} />
          <span className="num text-[11px] text-ink-3">{formatDate(src.date)}</span>
          {evidence.kind && (
            <span className="font-mono text-[10.5px] tracking-wide text-ink-2 uppercase" title={EVIDENCE_KIND_HINT[evidence.kind]}>
              {EVIDENCE_KIND_LABEL[evidence.kind]}
            </span>
          )}
          <span className="text-[11px] text-ink-3">· {evidence.addedBy === 'user' ? t('added by you') : t('proposed by analysis')}</span>
        </div>
        {cause?.date && src.date && (
          <p className="mt-0.5 text-[11.5px] text-ink-3">
            {t('First')} <SourceLink source={evidence.cause!} /> ({formatDate(cause.date)}), {t('{n} days later', { n: daysBetween(cause.date, src.date) })}:
          </p>
        )}
        <p className="mt-0.5 text-[13px] leading-snug text-ink-2">“{evidence.excerpt}”</p>
        {evidence.note && <p className="mt-0.5 text-[12px] text-ink-3">{evidence.note}</p>}
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
