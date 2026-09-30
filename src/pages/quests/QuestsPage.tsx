import { Crosshair, SkipForward } from 'lucide-react';
import { useMemo, useState } from 'react';
import { navigate } from '../../app/router';
import { PLACE_ICONS } from '../../components/icons';
import { BossEye } from '../../components/quests/BossEye';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/primitives';
import { HowItWorks } from '../../components/ui/HowItWorks';
import { VIEWS } from '../../domain/constants';
import { player, quests, XP, type Boss, type BossPart, type XpKind } from '../../domain/quests';
import { useElementWidth } from '../../hooks/useElementWidth';
import { cn } from '../../lib/cn';
import { formatDate, useToday, weekStart } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { toast } from '../../state/uiStore';
import { t, tn } from '../../i18n';

const SOURCE_LABEL: Record<XpKind, () => string> = {
  step: () => t('Steps finished'),
  target: () => t('Targets met'),
  note: () => t('Days you wrote'),
  test: () => t('Tests finished'),
  repeat: () => t('Repeats you reviewed'),
  decision: () => t('Decisions you looked back on'),
};

const KIND_LABEL = (b: Boss) => (b.kind === 'milestone' ? t('Milestone') : t('Target'));
const STATE_LABEL = (b: Boss) => (b.state === 'defeated' ? t('Beaten') : b.state === 'escaped' ? t('Got away') : t('Standing'));

/** Days to go, or since it passed, as a countdown. */
function countdown(b: Boss) {
  if (b.state === 'defeated') return t('BEATEN');
  if (b.daysLeft < 0) return tn(-b.daysLeft, 'PASSED 1 DAY AGO', 'PASSED {n} DAYS AGO');
  if (b.daysLeft === 0) return t('DUE TODAY');
  return tn(b.daysLeft, 'T–1 DAY', 'T–{n} DAYS');
}

/** A boss's strength as a bar, a segment per piece of work. */
function HpBar({ boss, className }: { boss: Boss; className?: string }) {
  return (
    <div className={cn('flex h-1.5 gap-[2px]', className)} role="img" aria-label={t('{hp} of {max} still open', { hp: boss.hp, max: boss.maxHp })}>
      {boss.parts.map((p) => (
        <span
          key={p.id}
          className={cn('min-w-[3px] flex-1 rounded-[1px]', p.done ? 'bg-ink/10' : boss.daysLeft <= 7 && boss.state === 'active' ? 'bg-accent' : 'bg-ink/80')}
        />
      ))}
    </div>
  );
}

/**
 * Quests: the plan you chose, as bosses to beat (see domain/quests.ts). The
 * boss is an eye that watches you; its strength is what is still open, and
 * the only way to bring it down is to finish something for real, which
 * finishes the same step in Ahead. Experience is counted from what the atlas
 * holds. A boss that gets away is kept on Time and can be taken on again.
 */
export function QuestsPage() {
  const data = useAtlas((s) => s.data);
  const setActionStatus = useAtlas((s) => s.setActionStatus);
  const toggleTarget = useAtlas((s) => s.toggleTarget);
  const retryDeadline = useAtlas((s) => s.retryDeadline);
  const today = useToday();
  const q = useMemo(() => quests(data, today), [data, today]);
  const me = useMemo(() => player(data, today), [data, today]);
  const [pick, setPick] = useState<string>();
  const [look, setLook] = useState<string>();
  const [hit, setHit] = useState(0);
  const [again, setAgain] = useState('');
  const [arena, arenaWidth] = useElementWidth<HTMLDivElement>(560);
  const boss = q.bosses.find((b) => b.id === pick) ?? q.current ?? q.bosses[0];

  const strike = (b: Boss, p: BossPart) => {
    if (p.done || b.state === 'escaped') return;
    const undo = p.kind === 'action' ? () => setActionStatus(p.id, 'todo') : () => toggleTarget(p.id);
    if (p.kind === 'action') setActionStatus(p.id, 'done');
    else toggleTarget(p.id);
    setHit((h) => h + 1);
    setLook(undefined);
    const xp = p.kind === 'action' ? XP.step : XP.target;
    toast(b.hp <= 1 ? t('{title} is beaten. +{xp} XP', { title: b.title, xp }) : t('Hit: {title}. +{xp} XP', { title: p.title, xp }), {
      tone: 'success',
      action: { label: t('Undo'), run: undo },
    });
  };
  const skip = (p: BossPart) => {
    setActionStatus(p.id, 'skipped');
    toast(t('Set aside: {title}. It no longer counts for or against you.', { title: p.title }), {
      action: { label: t('Undo'), run: () => setActionStatus(p.id, 'todo') },
    });
  };

  // A short header: the eye is the page, and it should be in view from the start.
  const header = (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <h1 className="label text-ink-2">{VIEWS.quests.label}</h1>
        <p className="mt-1.5 max-w-[72ch] text-[13px] leading-snug text-ink-2">{VIEWS.quests.blurb}</p>
        <HowItWorks page="quests" className="mt-2" />
      </div>
      <Button variant="ghost" icon={PLACE_ICONS.ahead} onClick={() => navigate('navigation')}>
        {t('Open the plan')}
      </Button>
    </div>
  );

  if (!boss) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-6 md:py-6">
        {header}
        <EmptyState
          icon={PLACE_ICONS.quests}
          title={t('No boss yet')}
          className="mt-6"
          action={
            <Button variant="primary" onClick={() => navigate('paths')}>
              {t('Choose a direction in Ahead')}
            </Button>
          }
        >
          {t(
            'Bosses come from the plan you choose in Ahead: its milestone, each target with a date, and this week’s steps. Choose a direction there, and they appear here.',
          )}
        </EmptyState>
      </div>
    );
  }

  const open = boss.parts.filter((p) => !p.done);
  const done = boss.parts.filter((p) => p.done);
  const urgent = boss.state === 'active' && boss.daysLeft <= 7;
  const week = weekStart(today);
  const eyeSize = Math.max(260, Math.min(500, arenaWidth - 24));
  const others = q.bosses.filter((b) => b.id !== boss.id);
  const pace = Math.round(boss.forecast.pace * 10) / 10;

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-5 md:px-6 md:py-6">
      {header}

      {/* The arena: the boss, and what brings it down. */}
      <section className="quest-arena ticks relative mt-4 overflow-hidden rounded-[2px] border border-line">
        <div className="relative z-[1] grid lg:grid-cols-[minmax(0,1fr)_minmax(300px,390px)]">
          <div ref={arena} className="flex min-w-0 flex-col items-center px-3 pt-4 pb-5">
            <div className="w-full px-1">
              <div className={cn('label', urgent && 'text-accent')}>
                {KIND_LABEL(boss)} · {STATE_LABEL(boss)}
              </div>
              <h2 className="display mt-1 text-[24px] leading-tight text-ink md:text-[28px]">{boss.title}</h2>
            </div>
            <BossEye
              parts={boss.parts}
              state={boss.state}
              urgent={urgent}
              hit={hit}
              look={look}
              size={eyeSize}
              label={t('{title}: {hp} of {max} still open, due {date}', { title: boss.title, hp: boss.hp, max: boss.maxHp, date: formatDate(boss.due) })}
            />
            <div className="mt-1 w-full max-w-[520px] px-1">
              <div className="flex items-baseline justify-between gap-3 font-mono text-[11.5px] tracking-wider">
                <span className="text-ink-2">
                  HP {boss.hp} / {boss.maxHp}
                </span>
                <span className={cn(urgent ? 'text-accent' : 'text-ink-2')}>{countdown(boss)}</span>
              </div>
              <HpBar boss={boss} className="mt-1.5" />
              <p className="mt-2.5 text-[12.5px] leading-snug text-ink-2">
                {boss.state === 'defeated'
                  ? t('Beaten: everything it was made of is done.')
                  : boss.state === 'escaped'
                    ? t('It got away on {date}, with {done} of {total} done. No penalty: take it on again with a new date.', {
                        date: formatDate(boss.due),
                        done: boss.maxHp - boss.hp,
                        total: boss.maxHp,
                      })
                    : boss.forecast.eta
                      ? boss.forecast.inTime
                        ? t('Forecast: at the pace of the last four weeks ({pace} a week), it falls around {eta}, before its date ({due}).', {
                            pace,
                            eta: formatDate(boss.forecast.eta),
                            due: formatDate(boss.due),
                          })
                        : t('Forecast: at the pace of the last four weeks ({pace} a week), it would fall around {eta}, after its date ({due}).', {
                            pace,
                            eta: formatDate(boss.forecast.eta),
                            due: formatDate(boss.due),
                          })
                      : t('Nothing was finished in the last four weeks, so there is no pace to forecast from yet.')}
              </p>
              {boss.state === 'escaped' && (
                <form
                  className="mt-2 flex flex-wrap items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!again || again <= today) return;
                    retryDeadline(boss.kind === 'milestone' ? 'milestone' : boss.targetId!, again);
                    setAgain('');
                    toast(t('{title} is back, due {date}. The date that passed stays on Time.', { title: boss.title, date: formatDate(again) }));
                  }}
                >
                  <input
                    type="date"
                    className="field h-8 w-auto py-0"
                    min={today}
                    value={again}
                    onChange={(e) => setAgain(e.target.value)}
                    aria-label={t('New date')}
                  />
                  <Button size="sm" type="submit" disabled={!again || again <= today}>
                    {t('Take it on again')}
                  </Button>
                </form>
              )}
            </div>
          </div>

          <div className="border-t border-line p-4 lg:border-t-0 lg:border-l">
            <div className="label">{t('What brings it down')}</div>
            {open.length === 0 ? (
              <p className="mt-2 text-[12.5px] text-ink-3">{t('Nothing left open.')}</p>
            ) : (
              <ul className="mt-2 divide-y divide-line border-y border-line">
                {open.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start gap-2.5 py-2"
                    onMouseEnter={() => setLook(p.id)}
                    onMouseLeave={() => setLook(undefined)}
                    onFocus={() => setLook(p.id)}
                    onBlur={() => setLook(undefined)}
                  >
                    <button
                      type="button"
                      disabled={boss.state === 'escaped'}
                      onClick={() => strike(boss, p)}
                      className="mt-px inline-flex h-7 shrink-0 items-center gap-1 rounded-[2px] border border-line-strong px-2 text-[12px] text-ink hover:border-accent/60 hover:text-accent disabled:opacity-40"
                      title={
                        p.kind === 'action' ? t('Mark this step done (+{xp} XP)', { xp: XP.step }) : t('Mark this target met (+{xp} XP)', { xp: XP.target })
                      }
                    >
                      <Crosshair size={12} aria-hidden />
                      {t('Strike')}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-snug text-ink">{p.title}</div>
                      <div className="mt-0.5 font-mono text-[10.5px] tracking-wide text-ink-3 uppercase">
                        {p.kind === 'target'
                          ? t('Target · due {date}', { date: formatDate(p.due) })
                          : p.week === week
                            ? t('Step · this week')
                            : p.week! < week
                              ? t('Step · from the week of {date}', { date: formatDate(p.week) })
                              : t('Step · week of {date}', { date: formatDate(p.week) })}
                      </div>
                    </div>
                    {p.kind === 'action' && boss.state !== 'escaped' && (
                      <button
                        type="button"
                        onClick={() => skip(p)}
                        className="mt-1 shrink-0 text-ink-3 hover:text-ink"
                        title={t('Set this step aside')}
                        aria-label={t('Set this step aside')}
                      >
                        <SkipForward size={13} aria-hidden />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {done.length > 0 && (
              <details className="mt-3 text-[12.5px]">
                <summary className="cursor-pointer text-ink-3 hover:text-ink">{t('Already down ({n})', { n: done.length })}</summary>
                <ul className="mt-1.5 space-y-1 text-ink-3">
                  {done.map((p) => (
                    <li key={p.id} className="line-through decoration-ink-3/50">
                      {p.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-4 text-[11.5px] leading-snug text-ink-3">
              {t('Its strength is what is still open in your plan. It only drops when something is really done, and doing it here does it in Ahead too.')}
            </p>
          </div>
        </div>
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Every boss in the plan. */}
        <section>
          <h2 className="label mb-2">{t('Bosses in your plan')}</h2>
          {others.length === 0 ? (
            <p className="text-[12.5px] text-ink-3">{t('This is the only one.')}</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {others.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPick(b.id);
                      window.scrollTo?.({ top: 0 });
                      document.getElementById('main')?.firstElementChild?.scrollTo?.({ top: 0, behavior: 'smooth' });
                    }}
                    className={cn(
                      'w-full rounded-[2px] border border-line px-3 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface',
                      b.state !== 'active' && 'opacity-70',
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="label">
                        {KIND_LABEL(b)} · {STATE_LABEL(b)}
                      </span>
                      <span className={cn('font-mono text-[10.5px]', b.state === 'active' && b.daysLeft <= 7 ? 'text-accent' : 'text-ink-3')}>
                        {countdown(b)}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-[13.5px] text-ink">{b.title}</div>
                    <HpBar boss={b} className="mt-2" />
                    <div className="mt-1 font-mono text-[10.5px] text-ink-3">
                      HP {b.hp} / {b.maxHp} · {formatDate(b.due)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* You: level and where the experience came from. */}
        <section className="rounded-[2px] border border-line p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="label">{t('You')}</h2>
            <span className="font-mono text-[11px] text-ink-3">{me.xp} XP</span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="display text-[34px] leading-none text-ink">{t('Level {n}', { n: me.level })}</span>
          </div>
          <div className="mt-3 h-1 rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-ink/80" style={{ width: `${Math.round(((me.xp - me.floor) / (me.next - me.floor)) * 100)}%` }} />
          </div>
          <div className="mt-1 font-mono text-[10.5px] text-ink-3">{t('{n} XP to level {level}', { n: me.next - me.xp, level: me.level + 1 })}</div>
          <table className="mt-3 w-full text-[12.5px]">
            <tbody>
              {me.sources.map((s) => (
                <tr key={s.kind} className="border-t border-line">
                  <td className="py-1.5 text-ink-2">{SOURCE_LABEL[s.kind]()}</td>
                  <td className="num py-1.5 text-right text-ink-3">
                    {s.count} × {XP[s.kind]}
                  </td>
                  <td className="num w-14 py-1.5 text-right text-ink">{s.xp}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
            {t('Counted again each time from what your atlas holds, so it cannot drift or be farmed: a day with ten notes is still one day.')}
          </p>
        </section>
      </div>

      {q.minions.length > 0 && (
        <section className="mt-6">
          <h2 className="label mb-2">{t('This week’s minions')}</h2>
          <ul className="flex flex-wrap gap-2">
            {q.minions.map((m) => {
              const owner =
                q.bosses.find((b) => b.kind === 'target' && b.parts.some((p) => p.id === m.id)) ?? q.bosses.find((b) => b.parts.some((p) => p.id === m.id))!;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => owner && strike(owner, m)}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-[2px] border border-line px-2 py-1 text-[12.5px] text-ink-2 hover:border-accent/60 hover:text-ink"
                    title={t('Mark this step done (+{xp} XP)', { xp: XP.step })}
                  >
                    <Crosshair size={12} className="shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate">{m.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
