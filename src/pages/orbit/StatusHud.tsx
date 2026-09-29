import { ArrowRight, PanelLeftClose } from 'lucide-react';
import type { ReactNode } from 'react';
import { hrefFor } from '../../app/router';
import { computeConfidence, pct } from '../../domain/confidence';
import { currentAction, currentExperiment, experimentProgress, modelCounts, navigationProgress, pathCode, sortedPatterns } from '../../domain/selectors';
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
 * The overview, kept to four things: what to do now, where you are, your
 * plan, and what keeps happening. Everything opens in place.
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
  const empty = modelCounts(data).records === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-4">
        <span className="label text-ink-2!">Overview</span>
        {onClose && <IconButton icon={PanelLeftClose} label="Hide the overview (View menu brings it back)" size="sm" onClick={onClose} />}
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
            <p className="text-[12.5px] text-ink-3">Not described yet. Do it in Plan → Options.</p>
          )}
        </Block>

        <Block title="My plan" href={hrefFor('navigation')}>
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
              {exp && expProgress && (
                <button type="button" className={cn(rowBtn, 'mt-2 items-center')} onClick={() => open({ kind: 'experiment', id: exp.id })}>
                  <span className="label shrink-0">Testing</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2 group-hover:text-ink" title={exp.hypothesis}>
                    {exp.title}
                  </span>
                  <span className="num shrink-0 text-[11px] text-ink-3">
                    {expProgress.day}/{expProgress.total}d
                  </span>
                </button>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-ink-3">No direction chosen yet. Compare your options in Plan.</p>
          )}
        </Block>

        <Block title="Patterns" href={hrefFor('patterns')}>
          {patterns.length ? (
            <ul>
              {patterns.map((p) => (
                <li key={p.id}>
                  <button type="button" className={rowBtn} onClick={() => open({ kind: 'pattern', id: p.id })}>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2 group-hover:text-ink" title={p.chain.join(' → ')}>
                      {p.chain.join(' → ')}
                    </span>
                    <span className="num shrink-0 text-[11.5px] text-ink-2">{pct(computeConfidence(p.evidence))}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-3">{empty ? 'Patterns appear once there are a few notes to compare.' : 'No active patterns.'}</p>
          )}
        </Block>
      </div>
    </div>
  );
}
