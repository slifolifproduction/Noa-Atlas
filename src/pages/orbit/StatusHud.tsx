import { ArrowRight, PanelLeftClose } from 'lucide-react';
import type { ReactNode } from 'react';
import { hrefFor } from '../../app/router';
import { computeConfidence, pct } from '../../domain/confidence';
import {
  currentAction,
  currentExperiment,
  decisionCode,
  experimentCode,
  experimentProgress,
  modelCounts,
  navigationProgress,
  pathCode,
  questionNodes,
  sortedDecisions,
  sortedPatterns,
} from '../../domain/selectors';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { IconButton } from '../../components/ui/Button';
import { Progress } from '../../components/ui/primitives';
import { NextStepCard } from '../../components/shell/NextStepCard';

function Block({ title, href, children, className }: { title: string; href?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-line px-4 py-3 first:border-t-0', className)}>
      <div className="mb-1.5 flex items-center justify-between">
        <h2 className="label">{title}</h2>
        {href && (
          <a href={href} className="rounded p-0.5 text-ink-3 hover:text-ink" aria-label={`Open ${title.toLowerCase()}`}>
            <ArrowRight size={12} aria-hidden />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

const rowBtn = 'group flex w-full items-baseline gap-2 rounded-[5px] px-1 py-[3px] -mx-1 text-left hover:bg-white/[0.04]';

/**
 * The dashboard, kept deliberately small: where you are, what you are aiming
 * at, what is being tested, and what has changed. Everything opens in place.
 */
export function StatusHud({ onClose }: { onClose?: () => void }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const nav = data.navigation;
  const progress = nav ? navigationProgress(nav) : null;
  const action = currentAction(nav);
  const path = nav ? data.paths[nav.pathId] : undefined;
  const exp = currentExperiment(data);
  const expProgress = exp ? experimentProgress(exp) : null;
  const patterns = sortedPatterns(data).slice(0, 3);
  const questions = questionNodes(data)
    .filter((q) => q.status !== 'resolved')
    .slice(0, 3);
  const decisions = sortedDecisions(data).slice(0, 3);
  const counts = modelCounts(data);
  const empty = counts.records === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-4">
        <span className="label text-ink-2!">Current state</span>
        {onClose && <IconButton icon={PanelLeftClose} label="Hide status panel" size="sm" onClick={onClose} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-1">
          <NextStepCard />
        </div>
        <Block title="Where I am" href={hrefFor('paths')} className="pt-3">
          {data.currentState.position ? (
            <>
              <p className="text-[13.5px] leading-snug text-ink">{data.currentState.position}</p>
              {data.currentState.constraints.length > 0 && (
                <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{data.currentState.constraints.slice(0, 2).join(' · ')}</p>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-ink-3">Describe your current position in Paths.</p>
          )}
        </Block>

        <Block title="Active objective" href={hrefFor('navigation')}>
          {nav && progress ? (
            <>
              <p className="text-[13px] leading-snug text-ink">{nav.objective.title}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                {path ? `${pathCode(path.code)} · ${path.title}` : 'Direction'} · by {formatDate(nav.objective.targetDate)}
              </p>
              <Progress value={progress.objectiveRatio} className="mt-2" />
              {action && (
                <a
                  href={hrefFor('navigation')}
                  className="mt-2.5 flex items-start gap-2 rounded-[6px] border border-accent/25 bg-accent-dim/50 px-2.5 py-2 hover:border-accent/45"
                >
                  <span className="label mt-px shrink-0 text-accent!">Next</span>
                  <span className="text-[12.5px] leading-snug text-ink">{action.title}</span>
                </a>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-ink-3">No direction chosen yet. Compare options in Paths.</p>
          )}
        </Block>

        <Block title="Current experiment" href={hrefFor('navigation')}>
          {exp && expProgress ? (
            <button type="button" className="block w-full text-left" onClick={() => open({ kind: 'experiment', id: exp.id })}>
              <p className="text-[13px] leading-snug text-ink">
                <span className="num mr-1.5 text-[11px] text-ink-3">{experimentCode(exp.code)}</span>
                {exp.hypothesis}
              </p>
              <div className="mt-2 flex items-center gap-2.5">
                <Progress value={expProgress.ratio} color="var(--color-accent)" />
                <span className="num shrink-0 text-[11px] text-ink-3">
                  day {expProgress.day}/{expProgress.total}
                </span>
              </div>
            </button>
          ) : (
            <p className="text-[12.5px] text-ink-3">Nothing running. Patterns and paths suggest experiments.</p>
          )}
        </Block>

        <Block title="Recent patterns" href={hrefFor('patterns')}>
          {patterns.length ? (
            <ul>
              {patterns.map((p) => (
                <li key={p.id}>
                  <button type="button" className={rowBtn} onClick={() => open({ kind: 'pattern', id: p.id })}>
                    <span className="num w-[22px] shrink-0 text-[11px] text-ink-3">{String(p.code).padStart(2, '0')}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2 group-hover:text-ink" title={p.chain.join(' → ')}>
                      {p.chain.join(' → ')}
                    </span>
                    <span className="num shrink-0 text-[11.5px] text-ink-2">{pct(computeConfidence(p.evidence))}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-3">{empty ? 'Patterns appear once there are a few entries to compare.' : 'No active patterns.'}</p>
          )}
        </Block>

        <Block title="Open questions" href={hrefFor('questions')}>
          {questions.length ? (
            <ul className="space-y-0.5">
              {questions.map((q) => (
                <li key={q.id}>
                  <button type="button" className={cn(rowBtn, 'items-start')} onClick={() => open({ kind: 'node', id: q.id })}>
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
                    <span className="text-[12.5px] leading-snug text-ink-2 group-hover:text-ink">{q.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-3">No open questions.</p>
          )}
        </Block>

        <Block title="Recent decisions" href={hrefFor('decisions')}>
          {decisions.length ? (
            <ul>
              {decisions.map((d) => (
                <li key={d.id}>
                  <button type="button" className={rowBtn} onClick={() => open({ kind: 'decision', id: d.id })}>
                    <span className="num w-[22px] shrink-0 text-[11px] text-ink-3">{decisionCode(d.seq).slice(-2)}</span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2 group-hover:text-ink">{d.title}</span>
                    <span className={cn('shrink-0 text-[11px]', d.actualOutcome ? 'text-ink-3' : 'text-counter/90')}>
                      {d.actualOutcome ? formatDate(d.date) : 'awaiting outcome'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-3">No decisions logged.</p>
          )}
        </Block>

        <ModelChain />
      </div>
    </div>
  );
}

/** The product principle, made visible: records flow into a model that experiments update. */
function ModelChain() {
  const data = useAtlas((s) => s.data);
  const c = modelCounts(data);
  const steps: { label: string; value: number; href: string }[] = [
    { label: 'Records', value: c.records, href: hrefFor('journal') },
    { label: 'Evidence', value: c.evidence, href: hrefFor('patterns') },
    { label: 'Patterns', value: c.patterns, href: hrefFor('patterns') },
    { label: 'Paths', value: c.paths, href: hrefFor('paths') },
    { label: 'Tests', value: c.experiments, href: hrefFor('navigation') },
    { label: 'Updates', value: c.updates, href: hrefFor('patterns') },
  ];
  return (
    <section className="border-t border-line px-4 pt-3 pb-4">
      <h2 className="label mb-2">How the atlas learns</h2>
      <ol className="grid grid-cols-3 gap-px overflow-hidden rounded-[6px] border border-line bg-line">
        {steps.map((s) => (
          <li key={s.label} className="bg-surface">
            <a href={s.href} className="flex flex-col items-center py-1.5 hover:bg-raised" title={`${s.value} ${s.label.toLowerCase()}`}>
              <span className="num text-[13px] text-ink">{s.value}</span>
              <span className="text-[10.5px] text-ink-3">{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-[11px] leading-snug text-ink-3">
        Your notes become evidence, evidence builds patterns, patterns shape your options, and experiments test them.
      </p>
    </section>
  );
}
