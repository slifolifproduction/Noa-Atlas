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
    <>{t('Each mark is one element; its icon says what kind of thing it is. A second ring around a mark means an outcome you want explained or changed.')}</>,
    <>
      {t(
        'Lines are either declared links (true because you say so) or claims that one thing changes another (dashed until the record backs them). Drag from one element to another to add either.',
      )}
    </>,
    <>{t('A dashed area marker means nothing was written about it lately: terra incognita. The Overview on the left lists where the map is thin.')}</>,
  ],
  network: () => [
    <>
      {t(
        'Every line here is a claim: this raises, lowers, triggers, makes possible, limits or sustains that. Its style shows how well the record supports it.',
      )}
    </>,
    <>
      {t(
        'A claim climbs from proposed to plausible, supported and tested only with evidence: instances, a mechanism, contrast cases and deliberate tests. Counter-cases weaken it.',
      )}
    </>,
    <>{t('Loops appear by themselves when claims close a circle. Pick one on the left to highlight it; its weakest link is where to look first.')}</>,
    <>{t('Dashed cards and lines are proposals from the analysis. They stay proposals until you adopt them.')}</>,
  ],
  timeline: () => [
    <>{t('What happened, when: events, actions, experiences, decisions and readings, each traced to the note it came from.')}</>,
    <>
      {t(
        'The chart shows how many commitments were active each week and how your energy was, side by side. Whether one affects the other is a claim, checked elsewhere.',
      )}
    </>,
    <>{t('Planned steps appear apart, as planned. Nothing imagined or expected is ever mixed into what happened.')}</>,
  ],
  patterns: () => [
    <>{t('A pattern is something that keeps happening in your history: green dots are instances, orange dots counter-cases. Nothing is scored.')}</>,
    <>{t('It is emerging until it shows in three separate weeks, recurring after that, and fading when counter-cases take over or it stops appearing.')}</>,
    <>{t('Why it happens is a separate question: attach the claims that may explain it, and test those.')}</>,
  ],
  paths: () => [
    <>{t('Each option is a possible direction, described the same way so you can compare them. They are never ranked.')}</>,
    <>{t('“Relies on” lists the claims an option needs to hold, with how well each does: that is how solid the option is.')}</>,
    <>{t('When you have decided, press “Choose as direction”. My plan then turns it into concrete steps.')}</>,
  ],
  navigation: () => [
    <>{t('Your chosen direction, from the big goal down to this week’s steps.')}</>,
    <>{t('Tick targets and steps off as you go. The next open step also appears in “Do this next” on the Map.')}</>,
    <>{t('Tests change one thing on purpose and compare with a prediction you wrote first. The result becomes evidence on the claim it tests.')}</>,
  ],
  journal: () => [
    <>{t('Every note you have written, newest first. Press Capture (or N) to add one. Notes are the record; nothing rewrites them.')}</>,
    <>{t('Open a note to see what the analysis read in it: happenings for the timeline, possible instances, and sentences where you explain a cause.')}</>,
  ],
  decisions: () => [
    <>{t('Log a decision with the options you saw and what you expected from each.')}</>,
    <>{t('Later, add whether you carried it out and what actually happened. Judge the decision by what you knew then, separately from how it turned out.')}</>,
  ],
  questions: () => [
    <>
      {t('A why-question explains something against what you expected instead. A what-if follows a change forward. A question of value is yours to settle.')}
    </>,
    <>{t('Gather the claims that bear on it, then write a provisional answer and what would change it.')}</>,
  ],
};

export const pageHelp = (page: string): ReactNode[] | undefined => PAGE_HELP[page]?.();

/**
 * A page's "how this works" note: open on the first visit, then folded into
 * a small link. Remembered per page.
 */
export function HowItWorks({ page, className }: { page: string; className?: string }) {
  const seen = useUI((s) => s.tipsSeen.includes(page));
  const setSeen = useUI((s) => s.setTipSeen);
  const [open, setOpen] = useState(!seen);
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
  const seen = useUI((s) => s.tipsSeen.includes(page));
  const guideSeen = useUI((s) => s.guideSeen);
  const setSeen = useUI((s) => s.setTipSeen);
  const [open, setOpen] = useState(false);
  // First visit (after the welcome guide): open by itself.
  const shown = open || (guideSeen && !seen);
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
