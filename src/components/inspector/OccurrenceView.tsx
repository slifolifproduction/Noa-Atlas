import { Star } from 'lucide-react';
import { useMemo } from 'react';
import { MODE_LABEL, OCCURRENCE_KIND_LABEL } from '../../domain/constants';
import { historyItems, windowAfter, windowBefore } from '../../domain/history';
import type { ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { SourceLink } from '../evidence/SourceLink';
import { KnowledgeTag } from '../evidence/Status';
import { HISTORY_ICONS } from '../icons';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { ChangeEditor, EpisodeSection, ExpectationPanel } from './Changes';
import { MomentExplanation } from './Explanation';
import { HistoryRow, Muted, NodeChip, PanelSection } from './parts';
import { t } from '../../i18n';

/**
 * Something that happened, read from a note: when, what it concerns, and the
 * exact passage it came from. What came just before and after sits beside it,
 * as context for "why?", never as an explanation.
 */
export function OccurrenceView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const updateOccurrence = useAtlas((s) => s.updateOccurrence);
  const deleteOccurrence = useAtlas((s) => s.deleteOccurrence);
  const close = useUI((s) => s.closeInspector);
  const o = data.occurrences[id];
  const before = useMemo(
    () =>
      o
        ? windowBefore(data, o.date, 28)
            .filter((h) => h.key !== `occ:${id}`)
            .slice(0, 5)
        : [],
    [data, o, id],
  );
  const after = useMemo(() => (o ? windowAfter(data, o.until ?? o.date, 28).slice(0, 5) : []), [data, o]);
  if (!o) return null;
  const Icon = HISTORY_ICONS[o.kind];
  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-ink-2" aria-hidden />
          <span className="label">
            {OCCURRENCE_KIND_LABEL[o.kind]} · {MODE_LABEL[o.mode]}
          </span>
          <span className="ml-auto">
            <KnowledgeTag kind={o.mode === 'actual' ? 'recorded' : 'imagined'} />
          </span>
        </div>
        <h2 className="mt-2.5 display text-[21px] leading-[1.25] text-ink">{o.label}</h2>
        <p className="num mt-1 text-[12.5px] text-ink-2">
          {o.approx ? '~' : ''}
          {formatDate(o.date, { year: true })}
          {o.until ? ` – ${formatDate(o.until, { year: true })}` : ''}
          {o.value !== undefined && ` · ${t('level {v}', { v: o.value })}`}
          {o.external && ` · ${t('happened to you')}`}
        </p>
        {o.excerpt && <p className="mt-2 text-[13px] leading-snug text-ink-2">“{o.excerpt}”</p>}
        {o.source && (
          <p className="mt-1.5 text-[12px] text-ink-3">
            {t('Read from')} <SourceLink source={o.source} showTitle />
          </p>
        )}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant={o.landmark ? 'primary' : 'ghost'}
            icon={Star}
            onClick={() => updateOccurrence(id, { landmark: !o.landmark })}
            title={t('A formative episode worth keeping in view')}
          >
            {o.landmark ? t('Landmark') : t('Mark as landmark')}
          </Button>
          <span className="ml-auto">
            <ConfirmButton
              onConfirm={() => {
                deleteOccurrence(id);
                close();
              }}
            />
          </span>
        </div>
      </div>
      <PanelSection title={t('Concerns')} count={o.about.length + (o.instanceOf ? 1 : 0)}>
        {o.instanceOf && (
          <p className="mb-1.5 text-[12px] text-ink-3">
            {o.kind === 'reading' ? t('A reading of') : t('One time of')} <NodeChip id={o.instanceOf} />
          </p>
        )}
        {o.about.length ? (
          <div className="flex flex-wrap gap-1.5">
            {o.about.map((n) => (
              <NodeChip key={n} id={n} />
            ))}
          </div>
        ) : (
          !o.instanceOf && <Muted>{t('Not linked to anything on the map.')}</Muted>
        )}
      </PanelSection>
      {o.mode === 'expected' && o.expectation && (
        <PanelSection title={t('A prediction')}>
          <ExpectationPanel occurrenceId={id} />
        </PanelSection>
      )}
      {o.mode === 'actual' && (
        <PanelSection title={t('What changed')} count={o.changes?.length ?? 0}>
          <ChangeEditor occurrenceId={id} />
        </PanelSection>
      )}
      {o.mode === 'actual' && (o.instanceOf || o.about.length > 0) && (
        <PanelSection title={t('Why might this have happened?')}>
          <MomentExplanation item={historyItems(data).find((h) => h.key === `occ:${id}`)!} />
        </PanelSection>
      )}
      {o.mode === 'actual' && (
        <PanelSection title={t('Episode')}>
          <EpisodeSection occurrenceId={id} />
        </PanelSection>
      )}

      <PanelSection title={t('Just before')} count={before.length}>
        {before.length ? (
          <ul className="-mx-1.5">
            {before.map((h) => (
              <HistoryRow key={h.key} item={h} />
            ))}
          </ul>
        ) : (
          <Muted>{t('Nothing recorded in the four weeks before.')}</Muted>
        )}
      </PanelSection>
      <PanelSection title={t('Just after')} count={after.length}>
        {after.length ? (
          <ul className="-mx-1.5">
            {after.map((h) => (
              <HistoryRow key={h.key} item={h} />
            ))}
          </ul>
        ) : (
          <Muted>{t('Nothing recorded in the four weeks after.')}</Muted>
        )}
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          {t('What came before and after is context, not cause. Causes are claims, checked against more than one episode.')}
        </p>
      </PanelSection>
    </div>
  );
}
