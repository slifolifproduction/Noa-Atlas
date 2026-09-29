import { ArrowUpRight, Play } from 'lucide-react';
import { ExperimentIcon } from '../icons';
import { useState } from 'react';
import { navigate } from '../../app/router';
import { EXPERIMENT_STATUS_LABEL } from '../../domain/constants';
import { experimentCode, experimentProgress, pathCode, patternCode } from '../../domain/selectors';
import type { ID } from '../../domain/types';
import { formatDate, todayISO, useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { ResultModal } from '../experiments/ResultModal';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Progress } from '../ui/primitives';
import { NodeChip, PanelSection } from './parts';
import { t } from '../../i18n';

export function ExperimentView({ id }: { id: ID }) {
  const data = useAtlas((s) => s.data);
  const x = data.experiments[id];
  const update = useAtlas((s) => s.updateExperiment);
  const remove = useAtlas((s) => s.deleteExperiment);
  const open = useUI((s) => s.openEntity);
  const back = useUI((s) => s.back);
  const close = useUI((s) => s.closeInspector);
  const [recording, setRecording] = useState(false);
  useToday();
  if (!x) return null;
  const prog = experimentProgress(x);

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <ExperimentIcon size={14} className="text-ink-3" aria-hidden />
          <span className="label">
            {experimentCode(x.code)} · {EXPERIMENT_STATUS_LABEL[x.status]}
          </span>
        </div>
        <h2 className="mt-2 display text-[21px] leading-[1.2] text-ink">{x.title}</h2>
        <div className="mt-3 space-y-2.5">
          <div>
            <div className="label">{t('Hypothesis')}</div>
            <p className="mt-0.5 text-[13.5px] text-ink">{x.hypothesis}</p>
          </div>
          <div>
            <div className="label">{t('Experiment')}</div>
            <p className="mt-0.5 text-[13px] text-ink-2">{x.design}</p>
          </div>
        </div>
        {x.status === 'running' && (
          <div className="mt-3.5">
            <div className="mb-1 flex justify-between text-[12px] text-ink-3">
              <span className="num">{t('Day {d} of {total}', { d: prog.day, total: prog.total })}</span>
              <span className="num">{t('ends {date}', { date: formatDate(prog.endDate) })}</span>
            </div>
            <Progress value={prog.ratio} color="var(--color-ink)" />
          </div>
        )}
        <div className="mt-3.5 flex flex-wrap items-center gap-1.5">
          {x.status === 'proposed' && (
            <Button size="sm" variant="primary" icon={Play} onClick={() => update(id, { status: 'running', startDate: todayISO() })}>
              {t('Start today')}
            </Button>
          )}
          {x.status === 'running' && (
            <Button size="sm" variant="primary" onClick={() => setRecording(true)}>
              {t('Record result')}
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            icon={ArrowUpRight}
            onClick={() => {
              close();
              navigate('navigation');
            }}
          >
            {t('My plan')}
          </Button>
          <span className="ml-auto">
            <ConfirmButton
              onConfirm={() => {
                remove(id);
                back();
              }}
            />
          </span>
        </div>
      </div>

      <PanelSection title={t('Measure')} count={x.measures.length}>
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11px] text-ink-3">
              <th className="pb-1 font-normal">{t('Measure')}</th>
              <th className="pb-1 font-normal">{t('Baseline')}</th>
              <th className="pb-1 font-normal">{t('Target')}</th>
              <th className="pb-1 font-normal">{t('Result')}</th>
            </tr>
          </thead>
          <tbody className="align-top">
            {x.measures.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="py-1.5 pr-2 text-ink-2">{m.label}</td>
                <td className="num py-1.5 pr-2 text-ink-3">{m.baseline ?? '—'}</td>
                <td className="num py-1.5 pr-2 text-ink-3">{m.target ?? '—'}</td>
                <td className="num py-1.5 text-ink">{m.result ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </PanelSection>

      {x.result && (
        <PanelSection title={t('Result')}>
          <p className="text-[13px] text-ink">{x.result.summary}</p>
          {x.result.learning && (
            <p className="mt-2 text-[13px] text-ink-2">
              <span className="text-ink-3">{t('Learning:')} </span>
              {x.result.learning}
            </p>
          )}
        </PanelSection>
      )}

      {(x.patternLinks.length > 0 || x.pathIds.length > 0 || x.questionIds.length > 0) && (
        <PanelSection title={t('Tests')}>
          <div className="flex flex-wrap gap-1.5">
            {x.patternLinks.map((l) =>
              data.patterns[l.patternId] ? (
                <button
                  key={l.patternId}
                  type="button"
                  onClick={() => open({ kind: 'pattern', id: l.patternId })}
                  className="rounded-[2px] border border-line px-1.5 py-[3px] text-[12.5px] text-ink-2 hover:text-ink"
                >
                  {patternCode(data.patterns[l.patternId].code)}
                </button>
              ) : null,
            )}
            {x.pathIds.map((p) =>
              data.paths[p] ? (
                <button
                  key={p}
                  type="button"
                  onClick={() => open({ kind: 'path', id: p })}
                  className="rounded-[2px] border border-line px-1.5 py-[3px] text-[12.5px] text-ink-2 hover:text-ink"
                >
                  {pathCode(data.paths[p].code)} · {data.paths[p].title}
                </button>
              ) : null,
            )}
            {x.questionIds.map((q) => (
              <NodeChip key={q} id={q} />
            ))}
          </div>
        </PanelSection>
      )}
      {recording && <ResultModal experiment={x} onClose={() => setRecording(false)} />}
    </div>
  );
}
