import { ArrowUpRight, Play } from 'lucide-react';
import { ExperimentIcon } from '../icons';
import { useState } from 'react';
import { navigate } from '../../app/router';
import { EXPERIMENT_STATUS_LABEL, expectSentence, stateSentence } from '../../domain/constants';
import { testCheck } from '../../domain/expect';
import { testSideEffects } from '../../domain/ledger';
import { mapElements } from '../../domain/selectors';
import { experimentCode, experimentProgress, pathCode, patternCode } from '../../domain/selectors';
import type { ID } from '../../domain/types';
import { addDays, formatDate, todayISO, useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { ResultModal } from '../experiments/ResultModal';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { Progress } from '../ui/primitives';
import { ExpectationLine, FactorReadingPicker, Proposals } from './Changes';
import { ClaimRow, Muted, NodeChip, PanelSection } from './parts';
import { KnowledgeTag } from '../evidence/Status';
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
  const [checking, setChecking] = useState(false);
  const addExpectation = useAtlas((s) => s.addExpectation);
  useToday();
  if (!x) return null;
  const prog = experimentProgress(x);
  const check = testCheck(data, x);
  const sideEffects = testSideEffects(data, x);
  const claim = x.claimId ? data.claims[x.claimId] : undefined;
  const factorChoices = [
    ...new Set([
      ...(claim ? [claim.to] : []),
      ...x.measures.map((m) => m.factor).filter((f): f is ID => Boolean(f)),
      ...mapElements(data)
        .filter((n) => n.kind === 'state' || n.kind === 'behaviour')
        .map((n) => n.id),
    ]),
  ];
  const name = (f: ID) => data.nodes[f]?.label ?? '';

  return (
    <div>
      <div className="px-4 pt-4 pb-4">
        <div className="flex items-center gap-2">
          <ExperimentIcon size={14} className="text-ink-3" aria-hidden />
          <span className="label">
            {experimentCode(x.code)} · {EXPERIMENT_STATUS_LABEL[x.status]}
          </span>
          <span className="ml-auto">
            <KnowledgeTag kind={x.status === 'proposed' ? 'imagined' : x.result ? 'tested' : 'recorded'} />
          </span>
        </div>
        <h2 className="mt-2 display text-[21px] leading-[1.2] text-ink">{x.title}</h2>
        <div className="mt-3 space-y-2.5">
          <div>
            <div className="label">{t('The idea being tested')}</div>
            <p className="mt-0.5 text-[13.5px] text-ink">{x.hypothesis}</p>
          </div>
          <div>
            <div className="label">{t('What changes on purpose')}</div>
            <p className="mt-0.5 text-[13px] text-ink-2">{x.design}</p>
          </div>
          {x.prediction && (
            <div>
              <div className="label">{t('Prediction, written before starting')}</div>
              <p className="mt-0.5 text-[13px] text-ink-2">{x.prediction}</p>
            </div>
          )}
          {x.criteria && (
            <div>
              <div className="label">{t('It did not work if')}</div>
              <p className="mt-0.5 text-[13px] text-ink-2">{x.criteria}</p>
            </div>
          )}
          {x.baseline && (
            <div>
              <div className="label">{t('Before')}</div>
              <p className="mt-0.5 text-[13px] text-ink-2">{x.baseline}</p>
            </div>
          )}
        </div>
        {x.status === 'running' && (
          <div className="mt-3.5">
            <div className="mb-1 flex justify-between text-[12px] text-ink-3">
              <span className="num">{t('Day {d} of {total}', { d: prog.day, total: prog.total })}</span>
              <span className="num">{t('ends {date}', { date: formatDate(prog.endDate) })}</span>
            </div>
            <Progress value={prog.ratio} label={t('How far along the experiment is')} color="var(--color-ink)" />
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
            {t('Open the plan')}
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

      <PanelSection title={t('The prediction, as a check')}>
        {check.expectation ? (
          <>
            <button type="button" className="w-full text-left" onClick={() => open({ kind: 'occurrence', id: check.expectation!.occurrence.id })}>
              <ExpectationLine view={check.expectation} />
            </button>
            <p className="mt-1 text-[11.5px] text-ink-3">
              {check.lockedBefore === false
                ? t('Written down after the test began. The result will count as a time it happened, not as a test.')
                : t('Written down before the test began, so the result can count as a test.')}
            </p>
          </>
        ) : checking ? (
          <FactorReadingPicker
            factorIds={factorChoices}
            submitLabel={t('Write it down')}
            onPick={(factor, reads) => {
              const from = x.startDate ?? todayISO();
              addExpectation({
                factor,
                reads,
                from,
                until: addDays(from, Math.max(1, x.durationDays - 1)),
                label: expectSentence(name(factor), reads),
                basis: x.claimId ? [x.claimId] : [],
                source: { kind: 'experiment', id: x.id },
                excerpt: x.prediction,
              });
              setChecking(false);
            }}
          />
        ) : (
          <>
            <Muted>{t('The prediction is in words. Saying which element should move, and which way, lets the Atlas check it against what you record.')}</Muted>
            <Button size="sm" variant="ghost" className="mt-1.5" onClick={() => setChecking(true)}>
              {t('Make it checkable')}
            </Button>
          </>
        )}
        {sideEffects.length > 0 && (
          <div className="mt-3">
            <div className="mb-1 text-[11.5px] text-ink-3">{t('What else should move, if the model is right')}</div>
            <Proposals items={sideEffects} source={{ kind: 'experiment', id: x.id }} />
          </div>
        )}
        {check.fromExtreme && (
          <p className="mt-2 text-[12px] text-ink-2">
            {t('It began just after {what} ({date}). Things tend to drift back toward usual from there, so some of the change may have come anyway.', {
              what: stateSentence(name(check.fromExtreme.factor), check.fromExtreme.reads),
              date: formatDate(check.fromExtreme.date),
            })}
          </p>
        )}
      </PanelSection>

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
                <td className="py-1.5 pr-2 text-ink-2">
                  {m.label}
                  {m.factor ? (
                    <span className="mt-0.5 block">
                      <NodeChip id={m.factor} className="py-0 text-[11px]" />
                    </span>
                  ) : (
                    <select
                      className="mt-0.5 block w-full bg-transparent text-[11px] text-ink-3"
                      value=""
                      aria-label={t('Which element it measures')}
                      onChange={(e) =>
                        e.target.value && update(id, { measures: x.measures.map((y) => (y.id === m.id ? { ...y, factor: e.target.value } : y)) })
                      }
                    >
                      <option value="">{t('Link to an element…')}</option>
                      {factorChoices.map((f) => (
                        <option key={f} value={f}>
                          {name(f)}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="num py-1.5 pr-2 text-ink-3">{m.baseline ?? '—'}</td>
                <td className="num py-1.5 pr-2 text-ink-3">{m.target ?? '—'}</td>
                <td className="num py-1.5 text-ink">{m.result ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {check.window.some((w) => w.states.length) && (
          <div className="mt-2.5">
            <div className="label mb-1">{t('Recorded during the test')}</div>
            <ul className="space-y-0.5 text-[12px] text-ink-2">
              {check.window
                .filter((w) => w.states.length)
                .map((w) => (
                  <li key={w.measureId}>{w.states.map((st) => `${stateSentence(name(st.factor), st.reads)} (${formatDate(st.date)})`).join('; ')}</li>
                ))}
            </ul>
          </div>
        )}
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
          {x.result.sideEffects && (
            <p className="mt-2 text-[13px] text-ink-2">
              <span className="text-ink-3">{t('Also changed:')} </span>
              {x.result.sideEffects}
            </p>
          )}
        </PanelSection>
      )}

      {x.claimId && (
        <PanelSection title={t('The reason it tests')}>
          <ul className="-mx-1.5">
            <ClaimRow id={x.claimId} />
          </ul>
        </PanelSection>
      )}

      {(x.patternIds.length > 0 || x.pathIds.length > 0 || x.questionIds.length > 0) && (
        <PanelSection title={t('Also bears on')}>
          <div className="flex flex-wrap gap-1.5">
            {x.patternIds.map((pid) =>
              data.patterns[pid] ? (
                <button
                  key={pid}
                  type="button"
                  onClick={() => open({ kind: 'pattern', id: pid })}
                  className="rounded-[2px] border border-line px-1.5 py-[3px] text-[12.5px] text-ink-2 hover:text-ink"
                >
                  {patternCode(data.patterns[pid].code)}
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
