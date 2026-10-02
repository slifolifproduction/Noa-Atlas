import { ArrowRight, Check, Ellipsis, Play, Plus, SkipForward, Trash, X } from 'lucide-react';
import { ExperimentIcon, PLACE_ICONS } from '../../components/icons';
import { claimCode } from '../../domain/claims';
import { useState, type ReactNode } from 'react';
import { hrefFor } from '../../app/router';
import { ResultModal } from '../../components/experiments/ResultModal';
import { PAGE_FRAME, PageHeader } from '../../components/shell/PageHeader';
import { Button, buttonClass, IconButton } from '../../components/ui/Button';
import { EmptyState, Progress } from '../../components/ui/primitives';
import { EditableLine } from '../../components/ui/InlineEdit';
import { EXPERIMENT_OUTCOME_LABEL, EXPERIMENT_STATUS_LABEL } from '../../domain/constants';
import { currentAction, experimentCode, experimentProgress, navigationProgress, pathCode, patternCode } from '../../domain/selectors';
import type { Experiment, NavAction, NavActionStatus } from '../../domain/types';
import { addDays, formatDate, relativeDays, todayISO, useToday } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { NewExperimentModal } from './NewExperimentModal';
import { OwnQuests } from './OwnQuests';
import { useSimple } from '../../components/ui/Detail';
import { t } from '../../i18n';

export function NavigationPage() {
  const nav = useAtlas((s) => s.data.navigation);
  const hasTests = useAtlas((s) => Object.keys(s.data.experiments).length > 0);
  const [creating, setCreating] = useState(false);
  // In simple view the tests column waits until there is a test to show (one is designed from a reason).
  const tests = !useSimple() || hasTests;
  return (
    <div className={PAGE_FRAME}>
      <PageHeader
        view="navigation"
        help="navigation"
        description={t("Your chosen direction, broken down into a goal, this month's targets and this week's steps.")}
        actions={
          nav && (
            <a href={hrefFor('paths')} className={buttonClass('ghost')}>
              {t('Change direction →')}
            </a>
          )
        }
      />
      <div className={cn('mt-6 grid gap-8', tests ? 'lg:grid-cols-[minmax(0,1fr)_380px]' : 'max-w-[900px]')}>
        <div className="min-w-0">
          {nav ? (
            <Route />
          ) : (
            <EmptyState
              icon={PLACE_ICONS.ahead}
              title={t('No direction chosen')}
              action={
                <a href={hrefFor('paths')} className={buttonClass('primary', 'md', 'gap-2')}>
                  <ArrowRight size={14} aria-hidden />
                  {t('See your options')}
                </a>
              }
            >
              {t(
                'Your plan starts from an option you choose. Choosing one drafts a 12-month goal, an experiment, 30-day targets and this week’s steps, all of which you can edit.',
              )}
            </EmptyState>
          )}
          <OwnQuests />
        </div>
        {tests && (
          <aside aria-label={t('Experiments')}>
            <ExperimentsColumn onCreate={() => setCreating(true)} />
          </aside>
        )}
      </div>
      {creating && <NewExperimentModal onClose={() => setCreating(false)} />}
    </div>
  );
}

/* ------------------------------------------------------------ route */

function Waypoint({ label, progress, children, last, current }: { label: string; progress?: number; children: ReactNode; last?: boolean; current?: boolean }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <li className="relative grid grid-cols-[28px_minmax(0,1fr)] gap-x-4">
      <div className="relative flex justify-center">
        {!last && <span className="absolute top-5 bottom-[-6px] w-px bg-line-strong" aria-hidden />}
        <svg width="20" height="20" className="relative mt-0.5" aria-hidden>
          <circle cx="10" cy="10" r={r} fill="var(--color-canvas)" stroke={current ? 'var(--color-accent)' : 'rgb(236 232 223 / 0.2)'} strokeWidth="1.5" />
          {progress !== undefined && progress > 0 && (
            <circle
              cx="10"
              cy="10"
              r={r}
              fill="none"
              stroke={current ? 'var(--color-accent)' : 'var(--color-ink-2)'}
              strokeWidth="2"
              strokeDasharray={`${Math.min(1, progress) * c} ${c}`}
              transform="rotate(-90 10 10)"
              strokeLinecap="round"
            />
          )}
          {current && <circle cx="10" cy="10" r="3" fill="var(--color-accent)" />}
        </svg>
      </div>
      <div className={cn('pb-7', last && 'pb-0')}>
        <div className="label mb-1.5">{label}</div>
        {children}
      </div>
    </li>
  );
}

function Route() {
  const data = useAtlas((s) => s.data);
  const nav = data.navigation!;
  const update = useAtlas((s) => s.updateNavigation);
  const toggleTarget = useAtlas((s) => s.toggleTarget);
  const addTarget = useAtlas((s) => s.addTarget);
  const deleteTarget = useAtlas((s) => s.deleteTarget);
  const open = useUI((s) => s.openEntity);
  useToday();
  const progress = navigationProgress(nav);
  const path = data.paths[nav.pathId];
  const exp = nav.experimentId ? data.experiments[nav.experimentId] : undefined;
  const simple = useSimple();
  const expProgress = exp ? experimentProgress(exp) : undefined;
  const action = currentAction(nav);
  const [newTarget, setNewTarget] = useState('');
  const monthsTotal = Math.max(1, Math.round((new Date(nav.objective.targetDate).getTime() - new Date(nav.committedAt).getTime()) / (30.4 * 86_400_000)));
  const monthNow = Math.min(monthsTotal, Math.max(1, Math.ceil(progress.objectiveRatio * monthsTotal)));

  return (
    <ol aria-label={t('Route')} className="min-w-0">
      <Waypoint label={t('Current position')} progress={1}>
        <EditableLine
          value={nav.position}
          onSave={(position) => update({ position })}
          className="display text-[18px] leading-[1.2] text-ink"
          placeholder={t('Where are you on this route?')}
        />
        {path && (
          <p className="mt-1 text-[12px] text-ink-3">
            {t('Direction: {path} · chosen {date}', { path: `${pathCode(path.code)} · ${path.title}`, date: formatDate(nav.committedAt, { year: true }) })}
          </p>
        )}
      </Waypoint>

      <Waypoint label={t('12-month objective')} progress={progress.objectiveRatio}>
        <EditableLine
          value={nav.objective.title}
          onSave={(title) => update({ objective: { ...nav.objective, title } })}
          className="display text-[21px] leading-[1.2] text-ink"
        />
        <EditableLine
          value={nav.objective.description}
          onSave={(description) => update({ objective: { ...nav.objective, description } })}
          className="mt-1 text-[13px] text-ink-2"
          multiline
        />
        <div className="mt-2 flex max-w-[420px] items-center gap-3">
          <Progress value={progress.objectiveRatio} />
          <span className="num shrink-0 text-[11.5px] text-ink-3">
            {t('month {n} of {total} · by {date}', { n: monthNow, total: monthsTotal, date: formatDate(nav.objective.targetDate, { year: true }) })}
          </span>
        </div>
      </Waypoint>

      {(!simple || exp) && (
        <Waypoint label={t('90-day strategic experiment')} progress={expProgress?.ratio}>
          {exp && expProgress ? (
            <button
              type="button"
              onClick={() => open({ kind: 'experiment', id: exp.id })}
              className="block w-full rounded-[2px] border border-line bg-surface px-3.5 py-3 text-left hover:border-line-strong"
            >
              <div className="flex items-center gap-2">
                <span className="num text-[11.5px] text-ink-3">{experimentCode(exp.code)}</span>
                <span className="text-[13px] font-medium text-ink">{exp.title}</span>
                <span className="ml-auto text-[11px] text-ink-3">{EXPERIMENT_STATUS_LABEL[exp.status]}</span>
              </div>
              <p className="mt-1 text-[13px] text-ink-2">{exp.hypothesis}</p>
              {exp.status === 'running' && (
                <div className="mt-2 flex items-center gap-3">
                  <Progress value={expProgress.ratio} color="var(--color-ink)" />
                  <span className="num shrink-0 text-[11.5px] text-ink-3">{t('day {d} of {total}', { d: expProgress.day, total: expProgress.total })}</span>
                </div>
              )}
            </button>
          ) : (
            <SelectExperiment />
          )}
        </Waypoint>
      )}

      <Waypoint label={t('Next milestone')} progress={Math.max(0, 1 - progress.daysToMilestone / 60)}>
        <EditableLine value={nav.milestone.title} onSave={(title) => update({ milestone: { ...nav.milestone, title } })} className="text-[14px] text-ink" />
        <p className="num mt-0.5 text-[12px] text-ink-3">
          {formatDate(nav.milestone.due, { year: true })} · {relativeDays(nav.milestone.due)}
        </p>
      </Waypoint>

      <Waypoint
        label={t('30-day targets · {done} of {total}', { done: progress.targetsDone, total: progress.targetsTotal })}
        progress={progress.targetsTotal ? progress.targetsDone / progress.targetsTotal : 0}
      >
        <ul className="space-y-1">
          {nav.targets.map((tg) => (
            <li key={tg.id} className="group flex items-center gap-2.5">
              <button
                type="button"
                role="checkbox"
                aria-checked={tg.done}
                onClick={() => toggleTarget(tg.id)}
                className={cn(
                  'flex h-4 w-4 shrink-0 items-center justify-center rounded-[2px] border',
                  tg.done ? 'border-ink-2 bg-ink-2 text-canvas' : 'border-line-strong hover:border-ink-3',
                )}
                aria-label={tg.title}
              >
                {tg.done && <Check size={11} strokeWidth={3} aria-hidden />}
              </button>
              <span className={cn('min-w-0 flex-1 text-[13.5px]', tg.done ? 'text-ink-3 line-through decoration-ink-3/50' : 'text-ink')}>{tg.title}</span>
              <span className="num shrink-0 text-[11.5px] text-ink-3">{formatDate(tg.due)}</span>
              <button
                type="button"
                className="shrink-0 rounded-[2px] p-0.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
                aria-label={t('Remove {name}', { name: tg.title })}
                onClick={() => deleteTarget(tg.id)}
              >
                <X size={12} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex max-w-[420px] gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newTarget.trim()) return;
            addTarget(newTarget.trim(), addDays(todayISO(), 30));
            setNewTarget('');
          }}
        >
          <input
            className="field py-1 text-[12.5px]"
            value={newTarget}
            onChange={(e) => setNewTarget(e.target.value)}
            placeholder={t('Add a 30-day target')}
            aria-label={t('New target')}
          />
          <IconButton icon={Plus} label={t('Add target')} type="submit" />
        </form>
      </Waypoint>

      <Waypoint
        label={t('This week · {done} of {total} done', { done: progress.weekDone, total: progress.weekActions.length })}
        progress={progress.weekActions.length ? progress.weekDone / progress.weekActions.length : 0}
      >
        <WeeklyActions week={progress.week} actions={progress.weekActions} />
      </Waypoint>

      <Waypoint label={t('Next action')} current last>
        {action ? (
          <NextAction action={action} />
        ) : (
          <p className="text-[13px] text-ink-3">{t('Nothing left this week. Add an action above, or review the week.')}</p>
        )}
      </Waypoint>
    </ol>
  );
}

function NextAction({ action }: { action: NavAction }) {
  const setStatus = useAtlas((s) => s.setActionStatus);
  const target = useAtlas((s) => s.data.navigation?.targets.find((x) => x.id === action.targetId));
  return (
    <div className="rounded-[2px] border border-accent/35 bg-accent-dim/40 px-4 py-3.5">
      <p className="text-[17px] leading-snug font-medium text-ink">{action.title}</p>
      {target && <p className="mt-1 text-[12.5px] text-ink-2">{t('Toward: {target}', { target: target.title })}</p>}
      <div className="mt-3 flex gap-2">
        <Button size="sm" variant="primary" icon={Check} onClick={() => setStatus(action.id, 'done')}>
          {t('Done')}
        </Button>
        <Button size="sm" variant="ghost" icon={SkipForward} onClick={() => setStatus(action.id, 'skipped')}>
          {t('Skip')}
        </Button>
      </div>
    </div>
  );
}

function WeeklyActions({ week, actions }: { week: string; actions: NavAction[] }) {
  const nav = useAtlas((s) => s.data.navigation!);
  const setStatus = useAtlas((s) => s.setActionStatus);
  const setCurrent = useAtlas((s) => s.setCurrentAction);
  const addAction = useAtlas((s) => s.addAction);
  const deleteAction = useAtlas((s) => s.deleteAction);
  const [title, setTitle] = useState('');
  const [menu, setMenu] = useState<string | null>(null);
  const current = currentAction(nav);
  const next: Record<NavActionStatus, NavActionStatus> = { todo: 'done', done: 'todo', skipped: 'todo' };
  return (
    <div>
      <p className="mb-1.5 text-[11.5px] text-ink-3">{t('Week of {date}', { date: formatDate(week) })}</p>
      <ul className="space-y-1">
        {actions.map((a) => (
          <li key={a.id} className="group relative flex items-center gap-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={a.status === 'done'}
              onClick={() => setStatus(a.id, next[a.status])}
              className={cn(
                'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                a.status === 'done'
                  ? 'border-ink-2 bg-ink-2 text-canvas'
                  : a.status === 'skipped'
                    ? 'border-dashed border-ink-3'
                    : 'border-line-strong hover:border-ink-3',
              )}
              aria-label={a.title}
            >
              {a.status === 'done' && <Check size={10} strokeWidth={3} aria-hidden />}
            </button>
            <span
              className={cn(
                'min-w-0 flex-1 text-[13.5px]',
                a.status === 'done' && 'text-ink-3 line-through decoration-ink-3/50',
                a.status === 'skipped' && 'text-ink-3',
                a.status === 'todo' && 'text-ink',
              )}
            >
              {a.title}
              {a.status === 'skipped' && <span className="ml-1.5 text-[11px]">{t('skipped')}</span>}
            </span>
            {current?.id === a.id && <span className="shrink-0 rounded-[2px] border border-accent/40 px-1 text-[10.5px] text-accent">{t('next')}</span>}
            <button
              type="button"
              className="shrink-0 rounded-[2px] p-0.5 text-ink-3 opacity-0 group-hover:opacity-100 hover:text-ink focus-visible:opacity-100"
              aria-label={t('More')}
              onClick={() => setMenu(menu === a.id ? null : a.id)}
            >
              <Ellipsis size={14} aria-hidden />
            </button>
            {menu === a.id && (
              <div className="absolute top-6 right-0 z-10 w-44 rounded-[2px] border border-line-strong bg-overlay p-1 shadow-xl">
                {a.status === 'todo' && (
                  <MenuItem icon={Play} onClick={() => (setCurrent(a.id), setMenu(null))}>
                    {t('Make it the next action')}
                  </MenuItem>
                )}
                {a.status === 'todo' && (
                  <MenuItem icon={SkipForward} onClick={() => (setStatus(a.id, 'skipped'), setMenu(null))}>
                    {t('Skip this week')}
                  </MenuItem>
                )}
                <MenuItem icon={Trash} onClick={() => (deleteAction(a.id), setMenu(null))}>
                  {t('Remove')}
                </MenuItem>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex max-w-[420px] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          addAction(title.trim());
          setTitle('');
        }}
      >
        <input
          className="field py-1 text-[12.5px]"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('Add an action for this week')}
          aria-label={t('New action')}
        />
        <IconButton icon={Plus} label={t('Add action')} type="submit" />
      </form>
    </div>
  );
}

function MenuItem({ icon: Icon, children, onClick }: { icon: typeof Play; children: ReactNode; onClick(): void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[2px] px-2 py-1.5 text-left text-[12.5px] text-ink-2 hover:bg-ink/[0.05] hover:text-ink"
    >
      <Icon size={13} aria-hidden />
      {children}
    </button>
  );
}

function SelectExperiment() {
  const data = useAtlas((s) => s.data);
  const update = useAtlas((s) => s.updateNavigation);
  const options = Object.values(data.experiments).filter((x) => x.status === 'running' || x.status === 'proposed');
  return (
    <div className="max-w-[420px]">
      <p className="mb-2 text-[13px] text-ink-3">{t('No strategic experiment linked. A 90-day experiment turns the objective into something testable.')}</p>
      <select className="field" value="" onChange={(e) => e.target.value && update({ experimentId: e.target.value })} aria-label={t('Link an experiment')}>
        <option value="">{t('Link an experiment…')}</option>
        {options.map((x) => (
          <option key={x.id} value={x.id}>
            {experimentCode(x.code)} · {x.title}
          </option>
        ))}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------ experiments */

function LoopStrip() {
  const steps = [t('Reason'), t('Predict'), t('Test'), t('Compare'), t('Revise')];
  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-ink-3" aria-label={t('Feedback loop')}>
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="rounded-[2px] border border-line px-1.5 py-px">{s}</span>
          {i < steps.length - 1 && <ArrowRight size={11} aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function ExperimentsColumn({ onCreate }: { onCreate(): void }) {
  const data = useAtlas((s) => s.data);
  const groups: { status: Experiment['status']; label: string }[] = [
    { status: 'running', label: t('Running') },
    { status: 'proposed', label: t('Proposed') },
    { status: 'completed', label: t('Completed') },
  ];
  const all = Object.values(data.experiments);
  return (
    <div className="lg:sticky lg:top-0">
      <div className="flex items-center justify-between">
        <h2 className="display text-[20px] text-ink">{t('Experiments')}</h2>
        <Button size="sm" icon={Plus} onClick={onCreate}>
          {t('New')}
        </Button>
      </div>
      <p className="mt-1.5 text-[12.5px] text-ink-2">
        {t('Test instead of guessing. A recorded result becomes evidence on the reason it tests, and can move its status either way.')}
      </p>
      <div className="mt-2.5">
        <LoopStrip />
      </div>
      {all.length === 0 ? (
        <EmptyState icon={ExperimentIcon} title={t('No tests yet')} className="mt-4">
          {t('Design one from any reason: open it and choose “Design a test”.')}
        </EmptyState>
      ) : (
        groups.map((g) => {
          const list = all.filter((x) => x.status === g.status).sort((a, b) => b.code - a.code);
          if (!list.length) return null;
          return (
            <section key={g.status} className="mt-5">
              <h3 className="label mb-2">
                {g.label} · {list.length}
              </h3>
              <ul className="space-y-2">
                {list.map((x) => (
                  <ExperimentCard key={x.id} experiment={x} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function ExperimentCard({ experiment: x }: { experiment: Experiment }) {
  const data = useAtlas((s) => s.data);
  const update = useAtlas((s) => s.updateExperiment);
  const open = useUI((s) => s.openEntity);
  const [recording, setRecording] = useState(false);
  const prog = experimentProgress(x);
  return (
    <li className="rounded-[2px] border border-line bg-surface px-3.5 py-3">
      <button type="button" className="block w-full text-left" onClick={() => open({ kind: 'experiment', id: x.id })}>
        <div className="flex items-center gap-2">
          <span className="num text-[11.5px] text-ink-3">{experimentCode(x.code)}</span>
          <span className="truncate text-[13px] font-medium text-ink">{x.title}</span>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{x.hypothesis}</p>
      </button>
      {x.claimId && data.claims[x.claimId] && (
        <p className="mt-1.5 text-[11.5px] text-ink-3">
          {t('Tests')} {claimCode(data.claims[x.claimId]!.code)}
          {x.patternIds.length > 0 &&
            ` · ${x.patternIds
              .map((p) => (data.patterns[p] ? patternCode(data.patterns[p].code) : null))
              .filter(Boolean)
              .join(', ')}`}
        </p>
      )}
      {x.status === 'running' && (
        <div className="mt-2.5 flex items-center gap-2.5">
          <Progress value={prog.ratio} color="var(--color-ink)" />
          <span className={cn('num shrink-0 text-[11px]', prog.overdue ? 'text-counter' : 'text-ink-3')}>
            {prog.overdue ? t('result due') : t('day {d}/{total}', { d: prog.day, total: prog.total })}
          </span>
        </div>
      )}
      {x.status === 'completed' && x.result && (
        <p className="mt-1.5 text-[12px] text-ink-2">
          <span className="text-ink-3">{t('Result:')} </span>
          {EXPERIMENT_OUTCOME_LABEL[x.result.outcome]} · {x.result.learning || x.result.summary}
        </p>
      )}
      {(x.status === 'running' || x.status === 'proposed') && (
        <div className="mt-2.5 flex gap-1.5">
          {x.status === 'running' ? (
            <Button size="sm" onClick={() => setRecording(true)}>
              {t('Record result')}
            </Button>
          ) : (
            <Button size="sm" icon={Play} onClick={() => update(x.id, { status: 'running', startDate: todayISO() })}>
              {t('Start today')}
            </Button>
          )}
        </div>
      )}
      {recording && <ResultModal experiment={x} onClose={() => setRecording(false)} />}
    </li>
  );
}
