import { ArrowRight, Plus, RefreshCw, Split } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PatternCandidate } from '../../ai/types';
import { hrefFor } from '../../app/router';
import { StanceMark } from '../../components/evidence/EvidenceRow';
import { SourceLink } from '../../components/evidence/SourceLink';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/primitives';
import { OUTCOME_RATING_LABEL } from '../../domain/constants';
import { decisionHorizon, patternCode, sortedDecisions } from '../../domain/selectors';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { detectDecisionPatterns } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';
import { t, tn } from '../../i18n';

const HORIZON = {
  get immediate() {
    return t('Near-term');
  },
  get long_term() {
    return t('Long-term');
  },
  get neutral() {
    return t('Mixed');
  },
};
const MIN_DECISIONS = 5;

export function DecisionsPage() {
  const data = useAtlas((s) => s.data);
  const openCapture = useUI((s) => s.openCapture);
  const openEntity = useUI((s) => s.openEntity);
  const top = useUI((s) => s.inspector[s.inspector.length - 1]);
  const decisions = sortedDecisions(data);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        view="decisions"
        help="decisions"
        description={t(
          'Each decision as a branch point: the options you saw, the one you lived, what you expected and what followed. How it turned out and how well it was decided are judged apart.',
        )}
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openCapture('decision')}>
            {t('Log decision')}
          </Button>
        }
      />

      <DecisionPatterns count={decisions.length} />

      <section className="mt-8" aria-labelledby="log-title">
        <h2 id="log-title" className="label mb-2">
          {t('Log')} · {decisions.length}
        </h2>
        {decisions.length === 0 ? (
          <EmptyState
            icon={Split}
            title={t('No decisions logged')}
            action={
              <Button variant="primary" icon={Plus} onClick={() => openCapture('decision')}>
                {t('Log a decision')}
              </Button>
            }
          >
            {t('Log decisions as you make them, with the options you weighed. Come back later to record what happened.')}
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-[2px] border border-line">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-line bg-surface">
                <tr className="text-[11px] tracking-[0.06em] text-ink-3 uppercase">
                  <th className="px-3 py-2 font-mono font-normal">#</th>
                  <th className="px-3 py-2 font-mono font-normal">{t('Date')}</th>
                  <th className="px-3 py-2 font-mono font-normal">{t('Decision')}</th>
                  <th className="px-3 py-2 font-mono font-normal">{t('Drivers')}</th>
                  <th className="px-3 py-2 font-mono font-normal">{t('Outcome')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {decisions.map((d) => {
                  const h = decisionHorizon(d);
                  const active = top?.kind === 'decision' && top.id === d.id;
                  return (
                    <tr
                      key={d.id}
                      onClick={() => openEntity({ kind: 'decision', id: d.id })}
                      className={cn('cursor-pointer align-top transition-colors', active ? 'bg-raised' : 'hover:bg-surface')}
                    >
                      <td className="num px-3 py-2.5 text-[12px] text-ink-3">{String(d.seq).padStart(2, '0')}</td>
                      <td className="num px-3 py-2.5 text-[12px] whitespace-nowrap text-ink-2">{formatDate(d.date)}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          className="display text-left text-[16px] leading-[1.2] text-ink hover:underline"
                          onClick={(e) => (e.stopPropagation(), openEntity({ kind: 'decision', id: d.id }))}
                        >
                          {d.title}
                        </button>
                        <div className="mt-0.5 line-clamp-1 text-[12px] text-ink-3">{t('Chose: {option}', { option: d.chosenAction || '—' })}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[12px] text-ink-2">{d.optimizingFor.map((x) => t(x)).join(', ') || '—'}</div>
                        {d.optimizingFor.length > 0 && <div className="mt-0.5 text-[11px] text-ink-3">{HORIZON[h]}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px]">
                        {d.actualOutcome ? (
                          <span className="text-ink-2">{d.outcomeRating ? OUTCOME_RATING_LABEL[d.outcomeRating] : t('Reviewed')}</span>
                        ) : (
                          <span className="text-counter">{t('Awaiting outcome')}</span>
                        )}
                        {d.enacted && d.enacted !== 'yes' && (
                          <div className="mt-0.5 text-[11px] text-ink-3">{d.enacted === 'partly' ? t('Partly carried out') : t('Not carried out')}</div>
                        )}
                        {d.options.length > 1 && (
                          <div className="mt-0.5 text-[11px] text-ink-3">{tn(d.options.length - 1, '{n} branch not taken', '{n} branches not taken')}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function DecisionPatterns({ count }: { count: number }) {
  const data = useAtlas((s) => s.data);
  const adopt = useAtlas((s) => s.adoptCandidate);
  const busy = useUI((s) => s.busy['decision-patterns']);
  const [candidates, setCandidates] = useState<PatternCandidate[] | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const signatureKey = Object.values(data.decisions)
    .map((d) => `${d.id}:${d.optimizingFor.join(',')}:${d.outcomeRating ?? ''}`)
    .join('|');

  const run = async () => setCandidates(await detectDecisionPatterns());
  useEffect(() => {
    if (count >= MIN_DECISIONS) void run();
  }, [signatureKey, count]);

  const visible = (candidates ?? []).filter((c) => !hidden.includes(c.signature));

  return (
    <section className="mt-6 rounded-[2px] border border-line bg-surface" aria-labelledby="dp-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 id="dp-title" className="label text-ink-2!">
            {t('Decision patterns')}
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-3">
            {t('Regularities proposed from the drivers and outcomes you recorded. A pattern only says what keeps happening; why is a separate question.')}
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} onClick={run} disabled={count < MIN_DECISIONS}>
          {t('Re-analyse')}
        </Button>
      </header>
      {count < MIN_DECISIONS ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">
          {tn(
            count,
            'Decision patterns need at least {min} logged decisions; there is {n}. Record the drivers for each so there is something to compare.',
            'Decision patterns need at least {min} logged decisions; there are {n}. Record the drivers for each so there is something to compare.',
            { min: MIN_DECISIONS },
          )}
        </p>
      ) : candidates === null ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">{t('Analysing decisions…')}</p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">{t('No recurring decision pattern with enough evidence. That is a result too.')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((c) => {
            const existing = c.existingPatternId ? data.patterns[c.existingPatternId] : undefined;
            return (
              <li key={c.signature} className="px-4 py-4">
                <div className="label">
                  {t('Decision pattern')} · {c.steps.join(' → ')}
                </div>
                <p className="display mt-1.5 text-[17px] leading-[1.2] text-ink">“{c.statement}”</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{c.observation}</p>
                <dl className="mt-3 grid grid-cols-2 gap-4 sm:max-w-[420px]">
                  <div>
                    <dt className="label">{t('Instances')}</dt>
                    <dd className="num mt-0.5 text-[13.5px] text-ink">{tn(c.supporting.length, '{n} decision', '{n} decisions')}</dd>
                  </div>
                  <div>
                    <dt className="label">{t('Counter-cases')}</dt>
                    <dd className="num mt-0.5 text-[13.5px] text-ink">{tn(c.counter.length, '{n} decision', '{n} decisions')}</dd>
                  </div>
                </dl>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <RefList title={t('Supporting')} stance="supports" items={c.supporting} />
                  <RefList title={t('Counter')} stance="counters" items={c.counter} />
                </div>
                {c.explanation && (
                  <div className="mt-3 flex flex-wrap items-start gap-2 text-[12.5px] text-ink-2">
                    <span className="text-ink-3">{t('A question to explore:')}</span>
                    <span className="min-w-0 flex-1">{c.explanation}</span>
                  </div>
                )}
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {existing ? (
                    <a
                      href={hrefFor('patterns', existing.id)}
                      className="inline-flex items-center gap-1.5 text-[12.5px] text-ink underline decoration-ink-3/50 underline-offset-[3px] hover:decoration-ink"
                    >
                      {t('In the model as {code}', { code: patternCode(existing.code) })} <ArrowRight size={12} aria-hidden />
                    </a>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          const id = adopt(c);
                          const p = useAtlas.getState().data.patterns[id];
                          toast(t('Added as {code}. It now appears in Patterns.', { code: p ? patternCode(p.code) : t('a pattern') }), {
                            tone: 'success',
                            action: { label: t('Open'), run: () => (window.location.hash = hrefFor('patterns', id)) },
                          });
                          void run();
                        }}
                      >
                        {t('Add to model')}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHidden([...hidden, c.signature])}>
                        {t('Not now')}
                      </Button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RefList({ title, stance, items }: { title: string; stance: 'supports' | 'counters'; items: { decisionId: string; excerpt: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <StanceMark stance={stance} />
        <span className="text-[11.5px] text-ink-3">{title}</span>
      </div>
      <ul className="space-y-0.5 pl-6">
        {items.map((i) => (
          <li key={i.decisionId}>
            <SourceLink source={{ kind: 'decision', id: i.decisionId }} showTitle />
          </li>
        ))}
      </ul>
    </div>
  );
}
