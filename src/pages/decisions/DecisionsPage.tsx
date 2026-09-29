import { ArrowRight, Plus, RefreshCw, Split } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PatternCandidate } from '../../ai/types';
import { hrefFor } from '../../app/router';
import { ConfidenceMeter, EstimateTag } from '../../components/evidence/Confidence';
import { StanceMark } from '../../components/evidence/EvidenceRow';
import { SourceLink } from '../../components/evidence/SourceLink';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/primitives';
import { computeConfidence } from '../../domain/confidence';
import { OUTCOME_RATING_LABEL } from '../../domain/constants';
import { decisionHorizon, patternCode, sortedDecisions } from '../../domain/selectors';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { detectDecisionPatterns } from '../../state/operations';
import { toast, useUI } from '../../state/uiStore';

const HORIZON = { immediate: 'Near-term', long_term: 'Long-term', neutral: 'Mixed' } as const;
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
        eyebrow="Records · Decisions"
        title="Decision log"
        help="decisions"
        description="Each decision with its options, what you expected and what actually happened. Comparing the two shows how you decide."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => openCapture('decision')}>
            Log decision
          </Button>
        }
      />

      <DecisionPatterns count={decisions.length} />

      <section className="mt-8" aria-labelledby="log-title">
        <h2 id="log-title" className="label mb-2">
          Log · {decisions.length}
        </h2>
        {decisions.length === 0 ? (
          <EmptyState
            icon={Split}
            title="No decisions logged"
            action={
              <Button variant="primary" icon={Plus} onClick={() => openCapture('decision')}>
                Log a decision
              </Button>
            }
          >
            Log decisions as you make them, with the options you weighed. Come back later to record what happened.
          </EmptyState>
        ) : (
          <div className="overflow-x-auto rounded-[10px] border border-line">
            <table className="w-full min-w-[720px] text-left text-[13px]">
              <thead className="border-b border-line bg-surface">
                <tr className="text-[11px] tracking-[0.06em] text-ink-3 uppercase">
                  <th className="px-3 py-2 font-mono font-normal">#</th>
                  <th className="px-3 py-2 font-mono font-normal">Date</th>
                  <th className="px-3 py-2 font-mono font-normal">Decision</th>
                  <th className="px-3 py-2 font-mono font-normal">Drivers</th>
                  <th className="px-3 py-2 font-mono font-normal">Outcome</th>
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
                          className="text-left text-ink hover:underline"
                          onClick={(e) => (e.stopPropagation(), openEntity({ kind: 'decision', id: d.id }))}
                        >
                          {d.title}
                        </button>
                        <div className="mt-0.5 line-clamp-1 text-[12px] text-ink-3">Chose: {d.chosenAction || '—'}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="text-[12px] text-ink-2">{d.optimizingFor.join(', ') || '—'}</div>
                        {d.optimizingFor.length > 0 && <div className="mt-0.5 text-[11px] text-ink-3">{HORIZON[h]}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-[12px]">
                        {d.actualOutcome ? (
                          <span className="text-ink-2">{d.outcomeRating ? OUTCOME_RATING_LABEL[d.outcomeRating] : 'Reviewed'}</span>
                        ) : (
                          <span className="text-counter">Awaiting outcome</span>
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
    <section className="mt-6 rounded-[12px] border border-line bg-surface" aria-labelledby="dp-title">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <h2 id="dp-title" className="label text-ink-2!">
            Decision patterns
          </h2>
          <p className="mt-0.5 text-[12px] text-ink-3">
            Proposed from the drivers and outcomes you recorded. Adding one to the model makes it part of the Mind graph.
          </p>
        </div>
        <Button size="sm" variant="ghost" icon={RefreshCw} loading={busy} onClick={run} disabled={count < MIN_DECISIONS}>
          Re-analyse
        </Button>
      </header>
      {count < MIN_DECISIONS ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">
          Decision patterns need at least {MIN_DECISIONS} logged decisions; there {count === 1 ? 'is' : 'are'} {count}. Record the drivers for each so there is
          something to compare.
        </p>
      ) : candidates === null ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">Analysing decisions…</p>
      ) : visible.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-ink-3">No recurring decision pattern with enough evidence. That is a result too.</p>
      ) : (
        <ul className="divide-y divide-line">
          {visible.map((c) => {
            const confidence = computeConfidence([
              ...c.supporting.map(() => ({ stance: 'supports' as const, weight: 1 })),
              ...c.counter.map(() => ({ stance: 'counters' as const, weight: 1 })),
            ]);
            const existing = c.existingPatternId ? data.patterns[c.existingPatternId] : undefined;
            return (
              <li key={c.signature} className="px-4 py-4">
                <div className="label">Decision pattern · {c.chain.join(' → ')}</div>
                <p className="mt-1.5 text-[16px] leading-snug text-ink">“{c.statement}”</p>
                <p className="mt-1 text-[12.5px] text-ink-2">{c.observation}</p>
                <dl className="mt-3 grid grid-cols-3 gap-4 sm:max-w-[560px]">
                  <div>
                    <dt className="label">Evidence</dt>
                    <dd className="num mt-0.5 text-[13.5px] text-ink">{c.supporting.length} decisions</dd>
                  </div>
                  <div>
                    <dt className="label">Confidence</dt>
                    <dd className="mt-0.5">
                      <ConfidenceMeter value={confidence} size="sm" />
                    </dd>
                  </div>
                  <div>
                    <dt className="label">Counter-evidence</dt>
                    <dd className="num mt-0.5 text-[13.5px] text-ink">{c.counter.length} decisions</dd>
                  </div>
                </dl>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <RefList title="Supporting" stance="supports" items={c.supporting} />
                  <RefList title="Counter" stance="counters" items={c.counter} />
                </div>
                <div className="mt-3 flex flex-wrap items-start gap-2 text-[12.5px] text-ink-2">
                  <span className="text-ink-3">Possible interpretation:</span>
                  <span className="min-w-0 flex-1">{c.interpretation.statement}</span>
                  <EstimateTag value={c.interpretation.confidence} />
                </div>
                <div className="mt-3.5 flex flex-wrap gap-2">
                  {existing ? (
                    <a href={hrefFor('patterns', existing.id)} className="inline-flex items-center gap-1.5 text-[12.5px] text-accent hover:underline">
                      In the model as {patternCode(existing.code)} <ArrowRight size={12} aria-hidden />
                    </a>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          const id = adopt(c);
                          const p = useAtlas.getState().data.patterns[id];
                          toast(`Added as ${p ? patternCode(p.code) : 'a pattern'}. It now appears in Patterns and the Mind graph.`, {
                            tone: 'success',
                            action: { label: 'Open', run: () => (window.location.hash = hrefFor('patterns', id)) },
                          });
                          void run();
                        }}
                      >
                        Add to model
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setHidden([...hidden, c.signature])}>
                        Not now
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
