import { ArrowDown, ChevronDown, Crosshair, Plus, SkipForward } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { navigate } from '../../app/router';
import { PLACE_ICONS } from '../../components/icons';
import { BossEye, type EyeHandle } from '../../components/quests/BossEye';
import type { Box } from '../../components/quests/eyeArt';
import { Button, IconButton } from '../../components/ui/Button';
import { HowItWorks } from '../../components/ui/HowItWorks';
import { ConfirmButton } from '../../components/ui/ConfirmButton';
import { VIEWS } from '../../domain/constants';
import { bossArmor, player, quests, XP, type Boss, type BossPart, type XpKind } from '../../domain/quests';
import { useIsDesktop } from '../../hooks/useMediaQuery';
import { ArmorPanel } from './ArmorPanel';
import { NewQuestModal } from './NewQuestModal';
import { ArsenalPanel } from './ArsenalPanel';
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
  exception: () => t('Exceptions you wrote down'),
  armor: () => t('Armor plates broken'),
};

const KIND_LABEL = (b: Boss) => (b.kind === 'milestone' ? t('Milestone') : b.source === 'own' ? t('Your quest') : t('Target'));
const STATE_LABEL = (b: Boss) => (b.state === 'defeated' ? t('Beaten') : b.state === 'escaped' ? t('Got away') : t('Standing'));
const WATCH_LABEL = (b: Boss) => (b.state === 'defeated' ? t('Its eye is shut') : b.state === 'escaped' ? t('Looking away') : t('Watching you'));
const pad = (n = 0) => String(n).padStart(2, '0');

/** Days to go, or since it passed, as a countdown. */
function countdown(b: Boss) {
  if (b.state === 'defeated') return t('BEATEN');
  if (b.daysLeft < 0) return tn(-b.daysLeft, 'PASSED 1 DAY AGO', 'PASSED {n} DAYS AGO');
  if (b.daysLeft === 0) return t('DUE TODAY');
  return tn(b.daysLeft, 'T–1 DAY', 'T–{n} DAYS');
}

/** The countdown as a large figure and what it counts. */
function readout(b: Boss) {
  if (b.state === 'defeated') return { big: '00', small: t('Beaten') };
  if (b.daysLeft < 0) return { big: `+${-b.daysLeft}`, small: tn(-b.daysLeft, 'day since its date', 'days since its date') };
  if (b.daysLeft === 0) return { big: 'T–0', small: t('Due today') };
  return { big: `T–${b.daysLeft}`, small: tn(b.daysLeft, 'day left', 'days left') };
}

/** A boss's strength as a bar, a segment per piece of work. On the stage it flickers in a segment at a time, from `at`. */
function HpBar({ boss, className, at }: { boss: Boss; className?: string; at?: number }) {
  return (
    <div className={cn('flex h-1.5 gap-[2px]', className)} role="img" aria-label={t('{hp} of {max} still open', { hp: boss.hp, max: boss.maxHp })}>
      {boss.parts.map((p, i) => (
        <span
          key={p.id}
          className={cn(
            'min-w-[3px] flex-1 rounded-[1px]',
            at !== undefined && 'quest-hud-in',
            p.done ? 'bg-ink/10' : boss.daysLeft <= 7 && boss.state === 'active' ? 'bg-accent' : 'bg-ink/80',
          )}
          style={at !== undefined ? ({ '--in': `${(at + i * 0.06).toFixed(2)}s` } as CSSProperties) : undefined}
        />
      ))}
    </div>
  );
}

/** Its date as a countdown, and its strength: on the stage they flicker in after its name, as it lands. */
function Readout({ boss, urgent }: { boss: Boss; urgent: boolean }) {
  const r = readout(boss);
  return (
    <div key={boss.id}>
      <div className="quest-hud-in flex items-end gap-3" style={{ '--in': '2.3s' } as CSSProperties}>
        <span className={cn('font-mono text-[44px] leading-[0.9] tracking-[-0.03em] lg:text-[60px]', urgent ? 'text-accent' : 'text-ink')}>{r.big}</span>
        <span className="mb-1 font-mono text-[10.5px] tracking-[0.16em] text-ink-3 uppercase">{r.small}</span>
      </div>
      <div
        className="quest-hud-in mt-3 flex items-baseline justify-between gap-3 font-mono text-[11px] tracking-wider text-ink-2"
        style={{ '--in': '2.45s' } as CSSProperties}
      >
        <span>
          HP {boss.hp} / {boss.maxHp}
        </span>
        <span className="text-ink-3">{formatDate(boss.due)}</span>
      </div>
      <HpBar boss={boss} className="mt-1.5" at={2.55} />
    </div>
  );
}

/** A number from a boss's id, so each tears through its own way. */
const seedOf = (id: string) => [...id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

/** The boxes of text on the stage, in its pixels, for the eye to keep clear of. Hidden ones count for nothing. */
function useTextBoxes(stage: RefObject<HTMLElement | null>, parts: RefObject<HTMLElement | null>[], key: string) {
  const [boxes, setBoxes] = useState<Box[]>([]);
  useLayoutEffect(() => {
    const root = stage.current;
    if (!root) return;
    const measure = () => {
      const s = root.getBoundingClientRect();
      const next = parts.flatMap((r) => {
        const b = r.current?.getBoundingClientRect();
        if (!b?.width || !b.height) return [];
        return [{ x: Math.round(b.left - s.left), y: Math.round(b.top - s.top), w: Math.round(b.width), h: Math.round(b.height) }];
      });
      setBoxes((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    for (const r of parts) if (r.current) ro.observe(r.current);
    return () => ro.disconnect();
    // The parts are refs, stable for the page's life; `key` says when they may have changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return boxes;
}

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

/**
 * Quests: the plan you chose, as bosses to beat (see domain/quests.ts). The
 * boss is the eye of something vast in space that watches you, its pupil a
 * clock; the page is its stage, and you read and act over it. Its strength is
 * what is still open, and the only way to bring it down is to finish
 * something for real, which finishes the same step in Ahead. Experience is
 * counted from what the atlas holds. A boss that gets away is kept on Time
 * and can be taken on again. Below the stage: its armor, the other bosses,
 * and you.
 */
export function QuestsPage() {
  const data = useAtlas((s) => s.data);
  const setActionStatus = useAtlas((s) => s.setActionStatus);
  const toggleTarget = useAtlas((s) => s.toggleTarget);
  const retryDeadline = useAtlas((s) => s.retryDeadline);
  const deleteTarget = useAtlas((s) => s.deleteTarget);
  const today = useToday();
  const wide = useIsDesktop();
  const q = useMemo(() => quests(data, today), [data, today]);
  const me = useMemo(() => player(data, today), [data, today]);
  const [pick, setPick] = useState<string>();
  const [look, setLook] = useState<string>();
  const [alert, setAlert] = useState(false);
  const [hit, setHit] = useState(0);
  const [again, setAgain] = useState('');
  const [starting, setStarting] = useState(false);
  const stage = useRef<HTMLElement>(null);
  const eye = useRef<EyeHandle>(null);
  const hudTop = useRef<HTMLDivElement>(null);
  const hudBottom = useRef<HTMLDivElement>(null);
  const consoleBox = useRef<HTMLElement>(null);
  const consoleMain = useRef<HTMLDivElement>(null);
  // On a wide screen the console shows only what brings it down; the rest opens over the stage on asking.
  const [details, setDetails] = useState(false);
  const boss = q.bosses.find((b) => b.id === pick) ?? q.current ?? q.bosses[0];
  // The eye keeps clear of the console as it stands closed, so opening its details does not move the eye.
  const avoid = useTextBoxes(stage, [hudTop, hudBottom, wide ? consoleMain : consoleBox], `${boss?.id ?? 'none'}|${wide}`);
  const armor = useMemo(() => (boss ? bossArmor(data, boss.id, today) : []), [data, boss, today]);

  const strike = (b: Boss, p: BossPart, from?: Element) => {
    if (p.done || b.state === 'escaped') return;
    // A beam only from where the eye can be seen.
    if (from && b.id === boss?.id && stage.current?.contains(from)) eye.current?.strike(from, p.id);
    const undo = p.kind === 'action' ? () => setActionStatus(p.id, 'todo') : () => toggleTarget(p.id);
    if (p.kind === 'action') setActionStatus(p.id, 'done');
    else toggleTarget(p.id);
    // Stay on this boss, even once it falls, to see it close.
    setPick(b.id);
    setHit((h) => h + 1);
    setLook(undefined);
    setAlert(false);
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

  const modal = <NewQuestModal open={starting} onClose={() => setStarting(false)} onCreated={setPick} />;
  const pageLabel = (
    <div className="flex items-center gap-3">
      <span className="label text-ink-2">{VIEWS.quests.label}</span>
      <HowItWorks page="quests" />
    </div>
  );

  // Nothing to fight: the eye is there, closed, asleep.
  if (!boss) {
    return (
      <>
        <section ref={stage} className="quest-stage relative h-full min-h-[520px] overflow-hidden">
          <BossEye dormant parts={[]} state="active" urgent={false} hit={0} wide={wide} avoid={avoid} label={t('A closed eye: no boss yet')} />
          <div ref={hudTop} className="quest-hud absolute top-3 left-4 lg:top-5 lg:left-6">
            {pageLabel}
          </div>
          <div ref={hudBottom} className="quest-hud absolute inset-x-4 bottom-8 mx-auto max-w-[560px] text-center">
            <h2 className="display text-[28px] leading-tight text-ink">{t('No boss yet')}</h2>
            <p className="mt-2 text-[13px] leading-snug text-ink-2">
              {t(
                'Bosses come from the plan you choose in Ahead (its milestone, each target with a date, this week’s steps) and from quests you start yourself: something with a date and the steps that bring it down.',
              )}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={Plus} onClick={() => setStarting(true)}>
                {t('Start a quest')}
              </Button>
              <Button onClick={() => navigate('paths')}>{t('Choose a direction in Ahead')}</Button>
            </div>
          </div>
        </section>
        {modal}
      </>
    );
  }

  const open = boss.parts.filter((p) => !p.done);
  const done = boss.parts.filter((p) => p.done);
  const number = new Map(boss.parts.map((p, i) => [p.id, i + 1]));
  const urgent = boss.state === 'active' && boss.daysLeft <= 7;
  const week = weekStart(today);
  const others = q.bosses.filter((b) => b.id !== boss.id);
  const pace = Math.round(boss.forecast.pace * 10) / 10;
  const standing = armor.filter((p) => !p.broken && !p.withdrawn).length;
  const arm = (on: boolean) => boss.state === 'active' && setAlert(on);

  const forecast =
    boss.state === 'defeated'
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
          : t('Nothing was finished in the last four weeks, so there is no pace to forecast from yet.');

  return (
    <>
      {/* The stage: the eye, and what you read and do over it. */}
      <section ref={stage} className="quest-stage relative h-full min-h-[560px] overflow-hidden" aria-labelledby="quest-boss">
        <BossEye
          ref={eye}
          key={boss.id}
          parts={boss.parts}
          state={boss.state}
          urgent={urgent}
          hit={hit}
          look={look}
          alert={alert}
          armor={armor}
          wide={wide}
          avoid={avoid}
          seed={seedOf(boss.id)}
          label={t('{title}: {hp} of {max} still open, due {date}', { title: boss.title, hp: boss.hp, max: boss.maxHp, date: formatDate(boss.due) })}
        />

        <div className="quest-scrim quest-scrim-top" aria-hidden />
        <div className="quest-scrim quest-scrim-bottom" aria-hidden />

        {/* Top: where you are, and what is watching you. */}
        <div ref={hudTop} className="quest-hud absolute top-3 right-4 left-4 lg:top-5 lg:right-auto lg:left-6 lg:w-fit lg:max-w-[min(560px,calc(100%-470px))]">
          <div className="flex items-center gap-3">
            {pageLabel}
            <div className="ml-auto flex items-center gap-1 lg:hidden">
              <IconButton icon={PLACE_ICONS.ahead} label={t('Open the plan')} onClick={() => navigate('navigation')} />
              <IconButton icon={Plus} label={t('Start a quest')} onClick={() => setStarting(true)} />
            </div>
            <div className="ml-3 hidden items-center gap-1.5 lg:flex">
              <Button size="sm" variant="ghost" icon={PLACE_ICONS.ahead} onClick={() => navigate('navigation')}>
                {t('Open the plan')}
              </Button>
              <Button size="sm" variant="primary" icon={Plus} onClick={() => setStarting(true)}>
                {t('Start a quest')}
              </Button>
            </div>
          </div>
          <div
            key={`s${boss.id}`}
            className={cn(
              'quest-hud-in mt-3 flex items-center gap-2 font-mono text-[10.5px] tracking-[0.16em] uppercase',
              urgent ? 'text-accent' : 'text-ink-2',
            )}
          >
            {boss.state === 'active' && <span className="quest-watch shrink-0" aria-hidden />}
            <span>
              {KIND_LABEL(boss)} · {STATE_LABEL(boss)} · {WATCH_LABEL(boss)}
            </span>
          </div>
          <h2
            key={`t${boss.id}`}
            id="quest-boss"
            className="display quest-hud-in mt-2 text-[22px] leading-[1.06] text-ink md:text-[32px] lg:text-[clamp(28px,4.6vh,42px)]"
          >
            {boss.title}
          </h2>
        </div>

        {/* Bottom left, on a wide screen: the countdown and its strength. */}
        <div ref={hudBottom} className="quest-hud absolute bottom-6 left-6 hidden w-[320px] lg:block">
          <Readout boss={boss} urgent={urgent} />
        </div>

        {/* The console: what brings it down (beside it on a wide screen, below it on a phone). */}
        <aside
          ref={consoleBox}
          className="quest-console absolute inset-x-0 top-[66%] bottom-0 overflow-y-auto px-4 pt-8 pb-5 lg:inset-x-auto lg:top-4 lg:right-4 lg:bottom-auto lg:max-h-[calc(100%-2rem)] lg:w-[384px] lg:border lg:border-line lg:p-0"
          aria-label={t('What brings it down')}
        >
          <div ref={consoleMain} className="lg:p-4">
            <div className="lg:hidden">
              <Readout boss={boss} urgent={urgent} />
            </div>
            <div className="mt-5 flex items-baseline justify-between gap-2 lg:mt-0">
              <h3 className="label">{t('What brings it down')}</h3>
              <span className="font-mono text-[10.5px] text-ink-3">{tn(open.length, 'one open', '{n} open')}</span>
            </div>
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
                      onClick={(e) => strike(boss, p, e.currentTarget)}
                      onPointerEnter={() => arm(true)}
                      onPointerLeave={() => arm(false)}
                      onFocus={() => arm(true)}
                      onBlur={() => arm(false)}
                      className="mt-px inline-flex h-7 shrink-0 items-center gap-1 rounded-[2px] border border-line-strong bg-canvas/40 px-2 text-[12px] text-ink hover:border-accent/70 hover:text-accent disabled:opacity-40"
                      title={
                        p.kind === 'action' ? t('Mark this step done (+{xp} XP)', { xp: XP.step }) : t('Mark this target met (+{xp} XP)', { xp: XP.target })
                      }
                    >
                      <Crosshair size={12} aria-hidden />
                      {t('Strike')}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] leading-snug text-ink">
                        <span className="mr-1.5 font-mono text-[10.5px] text-ink-3">{pad(number.get(p.id))}</span>
                        {p.title}
                      </div>
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
            {boss.state === 'escaped' && (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
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
            <button
              type="button"
              onClick={() => setDetails((d) => !d)}
              aria-expanded={details}
              aria-controls="quest-details"
              className="mt-3 hidden w-full items-center justify-between gap-2 font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase hover:text-ink lg:flex"
            >
              {details ? t('Hide details') : t('Details')}
              <ChevronDown size={13} aria-hidden className={cn('transition-transform duration-200', details && 'rotate-180')} />
            </button>
          </div>
          <div id="quest-details" className={cn(!details && 'lg:hidden', 'lg:mx-4 lg:border-t lg:border-line lg:pt-3 lg:pb-4')}>
            {done.length > 0 && (
              <details className="mt-3 text-[12.5px] lg:mt-0">
                <summary className="cursor-pointer text-ink-3 hover:text-ink">{t('Already down ({n})', { n: done.length })}</summary>
                <ul className="mt-1.5 space-y-1 text-ink-3">
                  {done.map((p) => (
                    <li key={p.id} className="line-through decoration-ink-3/50">
                      <span className="mr-1.5 font-mono text-[10.5px]">{pad(number.get(p.id))}</span>
                      {p.title}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <p className="mt-4 text-[12.5px] leading-snug text-ink-2">{forecast}</p>
            <p className="mt-3 text-[11.5px] leading-snug text-ink-3">
              {t('Its strength is what is still open in your plan. It only drops when something is really done, and doing it here does it in Ahead too.')}
            </p>
            <button
              type="button"
              onClick={() => scrollTo('quest-armor')}
              className="mt-4 flex w-full items-center justify-between gap-2 border-t border-line pt-3 text-left text-[12.5px] text-ink-2 hover:text-ink"
            >
              <span>
                <span className="label mr-2">{t('Armor')}</span>
                {armor.length ? tn(standing, 'one plate standing', '{n} plates standing') : t('none marked yet')}
              </span>
              <ArrowDown size={13} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => scrollTo('quest-below')}
              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase hover:text-ink"
            >
              <ArrowDown size={12} aria-hidden />
              {t('Armor, arsenal and the other bosses')}
            </button>
            {boss.source === 'own' && (
              <div className="mt-4 border-t border-line pt-3">
                <ConfirmButton
                  label={t('Drop this quest')}
                  confirmLabel={t('Drop it and its steps')}
                  onConfirm={() => {
                    deleteTarget(boss.targetId!);
                    setPick(undefined);
                  }}
                />
              </div>
            )}
          </div>
        </aside>
      </section>

      {/* Below the stage: its armor, the other bosses, and you. */}
      <div id="quest-below" className="mx-auto max-w-[1180px] scroll-mt-2 px-4 pt-8 pb-10 md:px-6">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <section id="quest-armor" className="scroll-mt-4 rounded-[2px] border border-line p-4">
              <div className="mb-1 truncate font-mono text-[10.5px] tracking-[0.14em] text-ink-3 uppercase">{boss.title}</div>
              <ArmorPanel boss={boss} className="" />
            </section>

            {/* Every boss in the plan. */}
            <section className="mt-8">
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

            {q.minions.length > 0 && (
              <section className="mt-8">
                <h2 className="label mb-2">{t('This week’s minions')}</h2>
                <ul className="flex flex-wrap gap-2">
                  {q.minions.map((m) => {
                    const owner =
                      q.bosses.find((b) => b.kind === 'target' && b.parts.some((p) => p.id === m.id)) ??
                      q.bosses.find((b) => b.parts.some((p) => p.id === m.id))!;
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

          {/* You: level and where the experience came from. */}
          <section className="self-start rounded-[2px] border border-line p-4">
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
            <ArsenalPanel />
          </section>
        </div>
      </div>
      {modal}
    </>
  );
}
