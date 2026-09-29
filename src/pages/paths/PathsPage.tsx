import { Check, Pencil, Plus } from 'lucide-react';
import { AssumptionIcon, ExperimentIcon, PLACE_ICONS } from '../../components/icons';
import { StatusBadge } from '../../components/evidence/Status';
import { claimCode, claimSentence, claimStatus } from '../../domain/claims';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/primitives';
import { EXPERIMENT_STATUS_LABEL, SKILL_STATUS_LABEL } from '../../domain/constants';
import { experimentCode, pathCode, patternCode, patternStats, patternTitle } from '../../domain/selectors';
import { RegularityTag } from '../../components/evidence/Status';
import type { SkillStatus, StrategicPath } from '../../domain/types';
import { formatDate } from '../../lib/dates';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { adoptExperimentDraft, commitDirection } from '../../state/operations';
import { useUI } from '../../state/uiStore';
import { CurrentStateEditor } from './CurrentStateEditor';
import { PathEditor } from './PathEditor';
import { t } from '../../i18n';

const ROWS: { key: keyof StrategicPath | 'experiments' | 'patterns' | 'assumptions'; label: string; hint: string }[] = [
  {
    key: 'requirements',
    get label() {
      return t('Requirements');
    },
    get hint() {
      return t('What must be true');
    },
  },
  {
    key: 'dependencies',
    get label() {
      return t('Dependencies');
    },
    get hint() {
      return t('What it relies on');
    },
  },
  {
    key: 'skills',
    get label() {
      return t('Skills');
    },
    get hint() {
      return t('Have · developing · gap');
    },
  },
  {
    key: 'capital',
    get label() {
      return t('Capital');
    },
    get hint() {
      return t('Money needed');
    },
  },
  {
    key: 'time',
    get label() {
      return t('Time');
    },
    get hint() {
      return t('Horizon and load');
    },
  },
  {
    key: 'risks',
    get label() {
      return t('Risks');
    },
    get hint() {
      return t('What could go wrong');
    },
  },
  {
    key: 'tradeoffs',
    get label() {
      return t('Trade-offs');
    },
    get hint() {
      return t('What you get, what you give');
    },
  },
  {
    key: 'opportunityCosts',
    get label() {
      return t('Opportunity costs');
    },
    get hint() {
      return t('What it rules out');
    },
  },
  {
    key: 'unknowns',
    get label() {
      return t('Unknowns');
    },
    get hint() {
      return t('What you do not know yet');
    },
  },
  {
    key: 'assumptions',
    get label() {
      return t('Relies on');
    },
    get hint() {
      return t('Claims that must hold, and how well they do');
    },
  },
  {
    key: 'patterns',
    get label() {
      return t('Patterns in play');
    },
    get hint() {
      return t('From your evidence');
    },
  },
  {
    key: 'experiments',
    get label() {
      return t('Tests');
    },
    get hint() {
      return t('Ways to find out');
    },
  },
];

const SKILL_MARK: Record<SkillStatus, string> = { have: '●', developing: '◐', gap: '○' };

export function PathsPage() {
  const data = useAtlas((s) => s.data);
  const addPath = useAtlas((s) => s.addPath);
  const paths = Object.values(data.paths).sort((a, b) => a.code.localeCompare(b.code));
  const [editing, setEditing] = useState<string | null>(null);
  const [editingState, setEditingState] = useState(false);

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 md:px-6 md:py-6">
      <PageHeader
        view="paths"
        help="paths"
        description={t('Your options side by side, described the same way. They are never ranked: the choice is yours.')}
        actions={
          <Button icon={Plus} onClick={() => setEditing(addPath())}>
            {t('New path')}
          </Button>
        }
      />

      {paths.length === 0 ? (
        <div className="mt-6 grid gap-6 md:grid-cols-[280px_1fr]">
          <CurrentStateCell onEdit={() => setEditingState(true)} />
          <EmptyState icon={PLACE_ICONS.plan} title={t('No paths yet')}>
            {t(
              'Describe two or three genuinely different directions. The same questions are asked of each (requirements, capital, time, risks, unknowns) so they can be compared without a verdict.',
            )}
          </EmptyState>
        </div>
      ) : (
        <PathMatrix paths={paths} onEdit={setEditing} onEditState={() => setEditingState(true)} />
      )}

      {editing && data.paths[editing] && <PathEditor path={data.paths[editing]} onClose={() => setEditing(null)} />}
      {editingState && <CurrentStateEditor onClose={() => setEditingState(false)} />}
    </div>
  );
}

function CurrentStateCell({ onEdit, wide }: { onEdit(): void; wide?: boolean }) {
  const state = useAtlas((s) => s.data.currentState);
  return (
    <div className="rounded-[2px] border border-line-strong bg-raised px-4 py-3.5">
      <div className="flex items-center justify-between">
        <span className="label text-ink-2!">{t('Current state · you are here')}</span>
        <button type="button" onClick={onEdit} className="rounded-[2px] p-1 text-ink-3 hover:text-ink" aria-label={t('Edit current state')}>
          <Pencil size={13} aria-hidden />
        </button>
      </div>
      {state.position ? (
        <div className={cn('mt-1.5 grid gap-x-8 gap-y-3', wide && 'lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]')}>
          <div>
            <p className="display text-[17px] leading-[1.2] text-ink">{state.position}</p>
            {state.summary && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{state.summary}</p>}
            <p className="mt-2 text-[11px] text-ink-3">{t('Updated {date}', { date: formatDate(state.updatedAt) })}</p>
          </div>
          {state.constraints.length > 0 && (
            <div>
              <div className="label mb-1">{t('Constraints')}</div>
              <List items={state.constraints} />
            </div>
          )}
          {state.assets.length > 0 && (
            <div>
              <div className="label mb-1">{t('Assets')}</div>
              <List items={state.assets} />
            </div>
          )}
        </div>
      ) : (
        <p className="mt-2 text-[12.5px] text-ink-3">{t('Where are you starting from? Describe your position, constraints and assets.')}</p>
      )}
    </div>
  );
}

/** A comparison grid whose header row branches from the current state to each path. */
function PathMatrix({ paths, onEdit, onEditState }: { paths: StrategicPath[]; onEdit(id: string): void; onEditState(): void }) {
  const data = useAtlas((s) => s.data);
  const nav = data.navigation;
  const busy = useUI((s) => s.busy);
  const open = useUI((s) => s.openEntity);
  const grid = useRef<HTMLDivElement>(null);
  const origin = useRef<HTMLDivElement>(null);
  const heads = useRef<(HTMLDivElement | null)[]>([]);
  const [curves, setCurves] = useState<{ d: string; active: boolean }[]>([]);
  const [confirm, setConfirm] = useState<string | null>(null);

  useLayoutEffect(() => {
    const el = grid.current;
    if (!el) return;
    const measure = () => {
      const g = el.getBoundingClientRect();
      const o = origin.current?.getBoundingClientRect();
      if (!o) return;
      const sx = o.left - g.left + o.width / 2;
      const sy = o.bottom - g.top;
      setCurves(
        heads.current.map((h, i) => {
          const r = h?.getBoundingClientRect();
          if (!r) return { d: '', active: false };
          const tx = r.left - g.left + r.width / 2;
          const ty = r.top - g.top;
          const my = (sy + ty) / 2;
          return { d: `M ${sx} ${sy} C ${sx} ${my}, ${tx} ${my}, ${tx} ${ty}`, active: nav?.pathId === paths[i]?.id };
        }),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paths, nav?.pathId]);

  const cols = `minmax(150px, 190px) repeat(${paths.length}, minmax(250px, 1fr))`;

  return (
    <div className="-mx-4 mt-6 overflow-x-auto px-4 pb-4 md:-mx-6 md:px-6">
      <div ref={grid} className="relative grid min-w-max gap-x-5 lg:min-w-0" style={{ gridTemplateColumns: cols }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          {curves.map((c, i) => (
            <path
              key={i}
              d={c.d}
              fill="none"
              stroke={c.active ? 'var(--color-accent)' : 'rgb(236 232 223 / 0.2)'}
              strokeWidth={c.active ? 1.5 : 1.2}
              strokeDasharray={c.active ? undefined : '4 5'}
            />
          ))}
        </svg>

        <div className="sticky left-0 z-10 bg-canvas pt-3.5 pr-2">
          <div className="label text-ink-2!">{t('From here')}</div>
        </div>
        <div ref={origin} className="relative z-[1]" style={{ gridColumn: '2 / -1' }}>
          <CurrentStateCell onEdit={onEditState} wide />
        </div>
        <div className="col-span-full h-12" aria-hidden />

        <div className="sticky left-0 z-10 bg-canvas pt-4 pr-2">
          <div className="label text-ink-2!">{t('Options')}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-3">{t('Alphabetical, not ranked')}</div>
        </div>
        {paths.map((p, i) => {
          const isDirection = nav?.pathId === p.id;
          return (
            <div
              key={p.id}
              ref={(el) => void (heads.current[i] = el)}
              className={cn('relative z-[1] self-start rounded-[2px] border bg-surface p-4', isDirection ? 'border-accent/40' : 'border-line')}
            >
              <div className="flex items-center gap-2">
                <span className="label text-ink-2!">{pathCode(p.code)}</span>
                {isDirection && (
                  <span
                    className="rounded-[2px] border border-accent/40 px-1.5 text-[10.5px] text-accent"
                    title={t('You chose this direction; it is not a ranking')}
                  >
                    {t('Your current direction · since {date}', { date: formatDate(nav!.committedAt) })}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onEdit(p.id)}
                  className="ml-auto rounded-[2px] p-1 text-ink-3 hover:text-ink"
                  aria-label={t('Edit {name}', { name: p.title })}
                >
                  <Pencil size={13} aria-hidden />
                </button>
              </div>
              <h2 className="display mt-2 text-[20px] leading-[1.2] text-ink">{p.title}</h2>
              <p className="mt-1.5 text-[13px] leading-snug text-ink">{p.objective || <span className="text-ink-3">{t('No objective yet.')}</span>}</p>
              {p.summary && <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">{p.summary}</p>}
              <div className="mt-3">
                {isDirection ? (
                  <Button size="sm" onClick={() => navigate('navigation')}>
                    {t('Open my plan')}
                  </Button>
                ) : confirm === p.id ? (
                  <div className="space-y-2">
                    <p className="text-[12px] text-ink-2">
                      {nav
                        ? t('This replaces your current navigation plan with a draft for this path.')
                        : t('A draft navigation plan will be created for you to edit.')}
                    </p>
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="primary"
                        loading={busy[`commit:${p.id}`]}
                        onClick={async () => {
                          await commitDirection(p.id);
                          setConfirm(null);
                          navigate('navigation');
                        }}
                      >
                        {t('Choose {code}', { code: pathCode(p.code) })}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                        {t('Cancel')}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="ghost" icon={Check} onClick={() => setConfirm(p.id)}>
                    {t('Choose as direction')}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <div className="col-span-full mt-5" />

        {ROWS.map((row) => (
          <Row key={row.key} label={row.label} hint={row.hint}>
            {paths.map((p) => (
              <div key={p.id} className="border-t border-line py-3 text-[13px] leading-snug text-ink-2">
                <Cell
                  path={p}
                  row={row.key}
                  onOpenExperiment={(id) => open({ kind: 'experiment', id })}
                  onOpenPattern={(id) => open({ kind: 'pattern', id })}
                />
              </div>
            ))}
          </Row>
        ))}
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <>
      <div className="sticky left-0 z-10 border-t border-line bg-canvas py-3 pr-2">
        <div className="label text-ink-2!">{label}</div>
        <div className="mt-0.5 text-[11.5px] text-ink-3">{hint}</div>
      </div>
      {children}
    </>
  );
}

function List({ items, empty = '—', mark }: { items: string[]; empty?: string; mark?: ReactNode }) {
  if (!items.length) return <span className="text-ink-3">{empty}</span>;
  return (
    <ul className="space-y-1 text-[13px] leading-snug text-ink-2">
      {items.map((i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-ink-3" aria-hidden />
          <span className="min-w-0">{i}</span>
          {mark}
        </li>
      ))}
    </ul>
  );
}

function Cell({
  path: p,
  row,
  onOpenExperiment,
  onOpenPattern,
}: {
  path: StrategicPath;
  row: (typeof ROWS)[number]['key'];
  onOpenExperiment(id: string): void;
  onOpenPattern(id: string): void;
}) {
  const data = useAtlas((s) => s.data);
  switch (row) {
    case 'skills':
      return p.skills.length ? (
        <ul className="space-y-1">
          {p.skills.map((s) => (
            <li key={s.label} className="flex items-baseline gap-2" title={SKILL_STATUS_LABEL[s.status]}>
              <span className="w-3 shrink-0 text-center text-ink-2" aria-hidden>
                {SKILL_MARK[s.status]}
              </span>
              <span className="min-w-0 flex-1">{s.label}</span>
              <span className="text-[11px] text-ink-3">{SKILL_STATUS_LABEL[s.status]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-ink-3">—</span>
      );
    case 'capital':
    case 'time':
      return p[row] ? <span className="text-ink">{p[row]}</span> : <span className="text-ink-3">—</span>;
    case 'unknowns':
      return p.unknowns.length ? (
        <ul className="space-y-1">
          {p.unknowns.map((u) => (
            <li key={u} className="flex gap-2">
              <AssumptionIcon size={12} className="mt-[3px] shrink-0 text-ink-3" aria-hidden />
              <span>{u}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-ink-3">—</span>
      );
    case 'patterns':
      return p.patternIds.length ? (
        <ul className="space-y-1">
          {p.patternIds.map((id) => {
            const pat = data.patterns[id];
            if (!pat || pat.setAside) return null;
            return (
              <li key={id}>
                <button type="button" onClick={() => onOpenPattern(id)} className="text-left hover:text-ink">
                  <span className="num mr-1.5 text-[11.5px] text-ink-3">{patternCode(pat.code)}</span>
                  {patternTitle(pat)} <RegularityTag regularity={patternStats(data, pat).regularity} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="text-ink-3">{t('None linked')}</span>
      );
    case 'assumptions':
      return p.assumptionIds.length ? (
        <ul className="space-y-1.5">
          {p.assumptionIds.map((id) => {
            const c = data.claims[id];
            if (!c) return null;
            const status = claimStatus(data, c);
            return (
              <li key={id}>
                <button type="button" onClick={() => useUI.getState().openEntity({ kind: 'claim', id })} className="text-left hover:text-ink">
                  <span className="flex items-center gap-2">
                    <span className="num text-[11.5px] text-ink-3">{claimCode(c.code)}</span>
                    <StatusBadge status={status} />
                  </span>
                  <span className="block">{claimSentence(data, c, status)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <span className="text-ink-3">{t('None linked')}</span>
      );
    case 'experiments':
      return (
        <div className="space-y-1.5">
          {p.experimentIds.map((id) => {
            const x = data.experiments[id];
            if (!x) return null;
            return (
              <button key={id} type="button" onClick={() => onOpenExperiment(id)} className="flex w-full items-baseline gap-2 text-left hover:text-ink">
                <ExperimentIcon size={12} className="shrink-0 translate-y-[2px] text-ink-3" aria-hidden />
                <span className="num text-[11.5px] text-ink-3">{experimentCode(x.code)}</span>
                <span className="min-w-0 flex-1">{x.title}</span>
                <span className="shrink-0 text-[11px] text-ink-3">{EXPERIMENT_STATUS_LABEL[x.status]}</span>
              </button>
            );
          })}
          {p.proposedExperiments.map((idea) => (
            <div key={idea} className="flex items-start gap-2 rounded-[2px] border border-dashed border-line-strong px-2 py-1.5">
              <span className="min-w-0 flex-1 text-[12.5px]">{idea}</span>
              <button
                type="button"
                className="shrink-0 text-[11.5px] text-accent hover:underline"
                onClick={() => {
                  const id = adoptExperimentDraft(
                    {
                      title: idea,
                      hypothesis: t('Trying “{idea}” will reduce an unknown in {path}.', { idea: idea.toLowerCase(), path: pathCode(p.code) }),
                      design: idea,
                      durationDays: 30,
                      prediction: '',
                      criteria: '',
                      measures: [],
                    },
                    { pathId: p.id },
                  );
                  useAtlas.getState().updatePath(p.id, { proposedExperiments: p.proposedExperiments.filter((x) => x !== idea) });
                  onOpenExperiment(id);
                }}
              >
                {t('Design it')}
              </button>
            </div>
          ))}
          {!p.experimentIds.length && !p.proposedExperiments.length && <span className="text-ink-3">—</span>}
        </div>
      );
    default: {
      const value = p[row as keyof StrategicPath];
      return <List items={Array.isArray(value) ? (value as string[]) : []} />;
    }
  }
}
