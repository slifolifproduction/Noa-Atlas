import { ArrowRight, PanelLeftClose, Plus } from 'lucide-react';
import type { ReactNode } from 'react';
import { hrefFor } from '../../app/router';
import { claimCode, claimSentence } from '../../domain/claims';
import { AREA_META, REGULARITY_LABEL } from '../../domain/constants';
import {
  currentAction,
  currentExperiment,
  experimentProgress,
  modelCounts,
  navigationProgress,
  pathCode,
  patternStats,
  patternTitle,
  sortedPatterns,
  thinSpots,
} from '../../domain/selectors';
import { formatDate, useToday } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button, IconButton } from '../../components/ui/Button';
import { Progress } from '../../components/ui/primitives';
import { NextStepCard } from '../../components/shell/NextStepCard';
import { t } from '../../i18n';

function Block({ n, title, href, children, className }: { n: number; title: string; href?: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-t border-line px-4 pt-3.5 pb-4', className)}>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="label">
          <span className="mr-2 text-ink-3">{String(n).padStart(2, '0')}</span>
          {title}
        </h2>
        {href && (
          <a href={href} className="rounded-[2px] p-0.5 text-ink-3 hover:text-ink" aria-label={t('Open {name}', { name: title })}>
            <ArrowRight size={12} aria-hidden />
          </a>
        )}
      </div>
      {children}
    </section>
  );
}

const rowBtn = 'group flex w-full items-baseline gap-2 rounded-[2px] px-1 py-[3px] -mx-1 text-left hover:bg-ink/[0.04]';

/**
 * The overview, kept to a few things: what to do now, where you are, your
 * plan, what keeps happening, and where the map is still thin. Everything
 * opens in place.
 */
export function StatusHud({ onClose, start }: { onClose?: () => void; start?: { addPoint(): void; identity(): void } }) {
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
  const today = useToday();
  const thin = thinSpots(data, today);
  const thinRows: { key: string; label: string; detail: string; onClick(): void }[] = [
    ...thin.unexplained.slice(0, 2).map((n) => ({
      key: n.id,
      label: n.label,
      detail: t('no explanation yet'),
      onClick: () => open({ kind: 'node', id: n.id }),
    })),
    ...thin.untestedBeliefs.slice(0, 2).map((n) => ({
      key: n.id,
      label: n.label,
      detail: t('belief never checked'),
      onClick: () => open({ kind: 'node', id: n.id }),
    })),
    ...thin.bareClaims.slice(0, 2).map((c) => ({
      key: c.id,
      label: claimSentence(data, c),
      detail: `${claimCode(c.code)} · ${t('no evidence yet')}`,
      onClick: () => open({ kind: 'claim', id: c.id }),
    })),
    ...thin.quietAreas.map((k) => ({
      key: k,
      label: AREA_META[k].label,
      detail: t('nothing written in 60 days'),
      onClick: () => open({ kind: 'area', id: k }),
    })),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-4">
        <span className="label text-ink-2!">{t('Overview')}</span>
        <span className="num ml-auto pr-2 text-[11px] tracking-[0.1em] text-ink-3">{formatDate(today).toUpperCase()}</span>
        {onClose && <IconButton icon={PanelLeftClose} label={t('Hide the overview (View menu brings it back)')} size="sm" onClick={onClose} />}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-3 pt-3 pb-3">
          <NextStepCard />
          {start && (
            <div className="mt-3 px-1">
              <p className="text-[12.5px] leading-snug text-ink-3">
                {t('Or begin with the map itself: what you value, what you are working on, the people around you.')}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" icon={Plus} onClick={start.addPoint}>
                  {t('Add to the map')}
                </Button>
                <Button size="sm" variant="ghost" onClick={start.identity}>
                  {t('Describe yourself')}
                </Button>
              </div>
            </div>
          )}
        </div>
        <Block n={1} title={t('Where I am')} href={hrefFor('paths')}>
          {data.currentState.position ? (
            <>
              <p className="display text-[16px] leading-[1.2] text-ink">{data.currentState.position}</p>
              {data.currentState.constraints.length > 0 && (
                <p className="mt-1.5 text-[12px] leading-snug text-ink-3">{data.currentState.constraints.slice(0, 2).join(' · ')}</p>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-ink-3">{t('Not described yet. Do it in Plan → Options.')}</p>
          )}
        </Block>

        <Block n={2} title={t('My plan')} href={hrefFor('navigation')}>
          {nav && progress ? (
            <>
              <p className="display text-[15px] leading-[1.2] text-ink">{nav.objective.title}</p>
              <p className="mt-0.5 text-[11.5px] text-ink-3">
                {t('{direction} · by {date}', {
                  direction: path ? `${pathCode(path.code)} · ${path.title}` : t('Direction'),
                  date: formatDate(nav.objective.targetDate),
                })}
              </p>
              <Progress value={progress.objectiveRatio} className="mt-2" />
              {action && (
                <a href={hrefFor('navigation')} className="mt-3 flex items-start gap-2.5 border-l border-accent py-0.5 pl-2.5 hover:bg-ink/[0.03]">
                  <span className="label mt-px shrink-0 text-accent!">{t('Next')}</span>
                  <span className="text-[12.5px] leading-snug text-ink">{action.title}</span>
                </a>
              )}
              {exp && expProgress && (
                <button type="button" className={cn(rowBtn, 'mt-2 items-center')} onClick={() => open({ kind: 'experiment', id: exp.id })}>
                  <span className="label shrink-0">{t('Testing')}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2 group-hover:text-ink" title={exp.hypothesis}>
                    {exp.title}
                  </span>
                  <span className="num shrink-0 text-[11px] text-ink-3">{t('{d}/{total} days', { d: expProgress.day, total: expProgress.total })}</span>
                </button>
              )}
            </>
          ) : (
            <p className="text-[12.5px] text-ink-3">{t('No direction chosen yet. Compare your options in Plan.')}</p>
          )}
        </Block>

        <Block n={3} title={t('What keeps happening')} href={hrefFor('patterns')}>
          {patterns.length ? (
            <ul>
              {patterns.map((p) => {
                const stats = patternStats(data, p, today);
                return (
                  <li key={p.id}>
                    <button type="button" className={rowBtn} onClick={() => open({ kind: 'pattern', id: p.id })}>
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2 group-hover:text-ink" title={patternTitle(p)}>
                        {patternTitle(p)}
                      </span>
                      <span className="shrink-0 font-mono text-[10.5px] tracking-wide text-ink-3 uppercase">{REGULARITY_LABEL[stats.regularity]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-[12.5px] text-ink-3">{empty ? t('Patterns appear once there are a few notes to compare.') : t('No active patterns.')}</p>
          )}
        </Block>

        {!empty && (
          <Block n={4} title={t('Where the map is thin')}>
            {thinRows.length ? (
              <ul>
                {thinRows.map((r) => (
                  <li key={r.key}>
                    <button type="button" className={cn(rowBtn, 'flex-col gap-0')} onClick={r.onClick}>
                      <span className="w-full truncate text-[12.5px] text-ink-2 group-hover:text-ink" title={r.label}>
                        {r.label}
                      </span>
                      <span className="text-[11px] text-ink-3">{r.detail}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-3">{t('Nothing obvious: every outcome of concern has a claim, and every claim has evidence.')}</p>
            )}
          </Block>
        )}
      </div>
    </div>
  );
}
