import { CircleHelp, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { Button } from './Button';
import { t } from '../../i18n';

/** What each page is for and how to use it, in a few plain sentences. */
const PAGE_HELP: Record<string, () => ReactNode[]> = {
  orbit: () => [
    <>
      {t(
        'You are at the centre. Each sector is an area of your life; the rings, from you outward, hold what you value and believe, what you do, and what surrounds you.',
      )}
    </>,
    <>{t('Tap anything to ask about it. What you pick stays the subject in every lens (Time, Causes, Repeats, Ahead) until you let it go.')}</>,
    <>
      {t(
        'Lines are links you drew, or possible reasons (dashed while they are still a hunch). To add a reason, open something and ask “Why might this be happening?”, or drag from one thing to another.',
      )}
    </>,
    <>{t('A dashed area marker means nothing was written about it lately. The overview on the left suggests something to look at.')}</>,
  ],
  network: () => [
    <>
      {t(
        'Your possible reasons, as a double helix: a line is a claim that one thing may contribute to another, drawn firmer the surer it is. Read it from top to bottom: each element sits below what may lead to it. Links you drew and things that merely happened together are not drawn here.',
      )}
    </>,
    <>
      {t(
        'Tap something to start from it: what may lead to it, by the part each plays, what competes, and what is still unexplained. The list on the left can trace back from it, or on from it.',
      )}
    </>,
    <>
      {t(
        'A reason becomes surer only as your notes show it happening in that order, in separate weeks, and once without it; a test is the strongest. Only a time it was there and the outcome did not follow counts against it. A written “how” is an explanation, not evidence.',
      )}
    </>,
    <>
      {t(
        'Cycles appear by themselves when reasons seen at least a few times come back around. Pick one on the left to see it; its least sure step is where to look first.',
      )}
    </>,
    <>
      {t(
        'One strand is you, what you hold and do; the other is what surrounds you. Each rung pairs the two things at the same step. Only what a shown reason joins is on the helix; the map keeps everything, where you put it.',
      )}
    </>,
    <>{t('Dashed lines are suggestions from the Atlas. They stay suggestions until you keep them.')}</>,
  ],
  timeline: () => [
    <>{t('What happened, when: your notes, what they describe, your decisions and your tests, newest first.')}</>,
    <>{t('Decisions show the branches you did not take. What might have happened there is imagined, and never counts as something that happened.')}</>,
    <>{t('When something is in focus, Time shows only the moments about it. Clear the focus to see everything.')}</>,
  ],
  patterns: () => [
    <>{t('Things that keep happening, drawn from your notes. Each one shows every time it happened, and the exceptions.')}</>,
    <>{t('It is new until it shows in three separate weeks, keeps happening after that, and is fading when exceptions take over or it stops appearing.')}</>,
    <>{t('Why it happens is a separate question: open it and ask.')}</>,
  ],
  paths: () => [
    <>{t('Each option is a possible direction, described the same way so you can compare them. They are never ranked, and nothing here has happened yet.')}</>,
    <>{t('“Relies on” lists the reasons an option needs to hold, with how sure each one is: that is how solid the option is.')}</>,
    <>{t('When you have decided, press “Choose as direction”. It then turns into concrete steps, under What you chose.')}</>,
  ],
  navigation: () => [
    <>{t('Your chosen direction, from the big goal down to this week’s steps.')}</>,
    <>{t('Tick targets and steps off as you go. The next open step also appears on the Map, under Next step.')}</>,
    <>{t('A test changes one thing on purpose and compares it with what you expected. Its result makes a reason surer, or less sure.')}</>,
  ],
  quests: () => [
    <>
      {t(
        'Your plan in Ahead, as bosses to beat: the milestone, each target with a date, and this week’s steps as minions. A boss’s strength is exactly what is still open.',
      )}
    </>,
    <>
      {t(
        'The eye watches you. Its pupil is a clock keeping your time, with the days left in its window; the numbered ring around it is its strength, a segment per piece of work.',
      )}
    </>,
    <>{t('Strike marks a step done, or a target met: the same step in Ahead. Nothing else brings a boss down.')}</>,
    <>
      {t(
        'Start a quest of your own for anything with a date: a deadline, a task. With a plan, it goes into the plan as a target with its steps; without one, it is kept on its own and shows in Ahead under your own quests.',
      )}
    </>,
    <>
      {t(
        'The forecast reads how much you finished in the last four weeks. If a date passes first, the boss gets away: it is kept on Time with how far you got, and you can take it on again with a new date. There is no penalty.',
      )}
    </>,
    <>{t('Experience is counted from what your atlas holds: steps, targets, days you wrote, tests, repeats reviewed, decisions looked back on.')}</>,
    <>
      {t(
        'Armor is what you say keeps making a boss hard: a repeat from Repeats or a cycle from Causes. It never shields the boss from work. A repeat is chipped by the times it did not happen, written down as exceptions; a cycle, by testing its least sure step until it no longer holds.',
      )}
    </>,
    <>
      {t(
        'Each level brings a point to raise a skill on your Map one step, once you have written about practising it since the last raise. The raise is dated on Time and shows on the Map and in your direction.',
      )}
    </>,
  ],
};

export const pageHelp = (page: string): ReactNode[] | undefined => PAGE_HELP[page]?.();

/** A page's "how this works" note, folded into a small link until asked for. */
export function HowItWorks({ page, className }: { page: string; className?: string }) {
  const setSeen = useUI((s) => s.setTipSeen);
  // Pages should explain themselves; the note waits behind a small link until asked for.
  const [open, setOpen] = useState(false);
  const items = pageHelp(page);
  if (!items) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink-2', className)}>
        <CircleHelp size={13} aria-hidden />
        {t('How this page works')}
      </button>
    );
  }
  return (
    <HelpCard
      className={className}
      items={items}
      onDone={() => {
        setOpen(false);
        setSeen(page, true);
      }}
    />
  );
}

export function HelpCard({ items, onDone, className, floating }: { items: ReactNode[]; onDone(): void; className?: string; floating?: boolean }) {
  return (
    <section
      className={cn('rounded-[2px] border border-line-strong px-4 py-3', floating ? 'bg-overlay/95 shadow-2xl backdrop-blur-md' : 'bg-surface', className)}
      aria-label={t('How this page works')}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="label flex items-center gap-1.5 text-ink-2!">
          <CircleHelp size={12} aria-hidden /> {t('How this page works')}
        </span>
        {floating && (
          <button type="button" onClick={onDone} className="rounded-[2px] p-0.5 text-ink-3 hover:text-ink" aria-label={t('Close')}>
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-ink-2">
            <span className="num mt-px w-3 shrink-0 text-[11px] text-ink-3">{i + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Button size="sm" className="mt-3" onClick={onDone}>
        {t('Got it')}
      </Button>
    </section>
  );
}

/** For the graph pages: a toolbar button with the same note in a floating card. */
export function useGraphHelp(page: string) {
  const setSeen = useUI((s) => s.setTipSeen);
  const [open, setOpen] = useState(false);
  const shown = open;
  return {
    shown,
    toggle: () => (shown ? close() : setOpen(true)),
    close,
  };
  function close() {
    setOpen(false);
    setSeen(page, true);
  }
}
