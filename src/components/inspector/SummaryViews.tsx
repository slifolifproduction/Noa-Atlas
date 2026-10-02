import { ArrowUpRight } from 'lucide-react';
import { navigate } from '../../app/router';
import { PATTERN_KIND_LABEL } from '../../domain/constants';
import { pathCode, patternCode, patternStats, patternTitle } from '../../domain/selectors';
import type { ID } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { KnowledgeTag, RegularityTag } from '../evidence/Status';
import { Button } from '../ui/Button';
import { ClaimRow, Muted, NodeChip, PanelSection } from './parts';
import { t } from '../../i18n';

/**
 * A pattern describes what keeps happening. Why it happens is a separate
 * question, answered (tentatively) by the claims that may explain it.
 */
export function PatternView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const close = useUI((s) => s.closeInspector);
  const p = data.patterns[id];
  if (!p) return null;
  const stats = patternStats(data, p);
  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="label">
            {patternCode(p.code)} · {PATTERN_KIND_LABEL[p.kind]}
          </span>
          <span className="ml-auto">
            <KnowledgeTag kind="observed" />
          </span>
        </div>
        <h2 className="mt-2 display text-[21px] leading-[1.2] text-ink">{patternTitle(p)}</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-2">{p.observation}</p>
        {p.setAside && <p className="mt-2 text-[12px] text-ink-3">{t('Set aside by you. Kept for reference.')}</p>}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
          <div>
            <dt className="text-ink-3">{t('Regularity')}</dt>
            <dd>
              <RegularityTag regularity={stats.regularity} />
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t('Instances')}</dt>
            <dd className="num text-ink-2">
              {t('{n} in {w} separate weeks', { n: stats.instances, w: stats.episodes })}
              {stats.counter > 0 && ` · ${t('{c} counter-cases', { c: stats.counter })}`}
            </dd>
          </div>
          <div>
            <dt className="text-ink-3">{t('First seen')}</dt>
            <dd className="num text-ink-2">{formatDate(stats.firstObserved)}</dd>
          </div>
          <div>
            <dt className="text-ink-3">{t('Last seen')}</dt>
            <dd className="num text-ink-2">{formatDate(stats.lastObserved)}</dd>
          </div>
        </dl>
        <Button
          size="sm"
          className="mt-4"
          icon={ArrowUpRight}
          onClick={() => {
            close();
            navigate('patterns', id);
          }}
        >
          {t('Open full evidence')}
        </Button>
      </div>
      <PanelSection title={t('Why it may happen')} count={p.explainedBy.length}>
        {p.explainedBy.length ? (
          <ul className="-mx-1.5">
            {p.explainedBy.map((c) => (
              <ClaimRow key={c} id={c} />
            ))}
          </ul>
        ) : (
          <Muted>{t('No explanation attached yet. A repeat only says what keeps happening; link the reasons that may explain it on the Repeats page.')}</Muted>
        )}
      </PanelSection>
      {p.nodeIds.length > 0 && (
        <PanelSection title={t('Involves')} count={p.nodeIds.length}>
          <div className="flex flex-wrap gap-1.5">
            {p.nodeIds.map((n) => (
              <NodeChip key={n} id={n} />
            ))}
          </div>
        </PanelSection>
      )}
    </div>
  );
}

/** A possible direction: not history, and only as solid as the claims it relies on. */
export function PathView({ id }: { id: ID }) {
  const path = useAtlas((s) => s.data.paths[id]);
  const close = useUI((s) => s.closeInspector);
  if (!path) return null;
  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <span className="label">{pathCode(path.code)}</span>
          <span className="ml-auto">
            <KnowledgeTag kind="imagined" />
          </span>
        </div>
        <h2 className="mt-2 display text-[21px] leading-[1.2] text-ink">{path.title}</h2>
        <p className="mt-2 text-[13px] text-ink-2">{path.objective}</p>
        {path.summary && <p className="mt-1.5 text-[12.5px] text-ink-3">{path.summary}</p>}
        <Button
          size="sm"
          className="mt-4"
          icon={ArrowUpRight}
          onClick={() => {
            close();
            navigate('paths');
          }}
        >
          {t('Compare options')}
        </Button>
      </div>
      <PanelSection title={t('Relies on')} count={path.assumptionIds.length}>
        {path.assumptionIds.length ? (
          <ul className="-mx-1.5">
            {path.assumptionIds.map((c) => (
              <ClaimRow key={c} id={c} />
            ))}
          </ul>
        ) : (
          <Muted>{t('No reasons attached. What would have to be true for this option to work?')}</Muted>
        )}
      </PanelSection>
    </div>
  );
}
