import { CircleHelp, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { Button } from './Button';

/** What each page is for and how to use it, in a few plain sentences. */
export const PAGE_HELP: Record<string, ReactNode[]> = {
  orbit: [
    <>Each large circle is an area of your life (career, finance, habits…); the small dots are the things in it.</>,
    <>Click anything to open its details on the right. Hover for a quick look.</>,
    <>Drag to rearrange. To connect two things, drag from the small dot on a circle&apos;s edge onto another.</>,
    <>Scroll or pinch to zoom; arrow keys hop between connected items. The panel on the left tells you what to do next.</>,
  ],
  mind: [
    <>Cards are your beliefs, fears, questions, values and decisions. Lines show how they affect each other.</>,
    <>The six-sided cards are patterns found in your notes, linked to the thoughts they rest on.</>,
    <>Click a card to see the notes behind it. Use the list on the left to hide kinds you do not need right now.</>,
    <>Dashed borders mean untested or suggested by the analysis, not by you.</>,
  ],
  patterns: [
    <>A pattern is something that keeps happening, backed by your own notes: green dots support it, orange dots count against it.</>,
    <>When the atlas finds a note that might belong to a pattern, it asks. Accept if it fits, reject if it does not.</>,
    <>If a pattern is simply wrong, mark it as inaccurate. Confidence always comes from the evidence, never a guess.</>,
  ],
  paths: [
    <>Each path is a possible direction, described the same way so you can compare them. They are never ranked.</>,
    <>Keep “You are here” up to date: your situation, constraints and strengths.</>,
    <>When you have decided, press “Choose as direction”. Navigation then turns it into concrete steps.</>,
  ],
  navigation: [
    <>Your chosen direction, from the big goal down to this week&apos;s steps.</>,
    <>Tick targets and steps off as you go. The next open step also appears in “Do this next” on the Orbit page.</>,
    <>Experiments test an idea for a few weeks. When one ends, record what happened; the result updates your patterns.</>,
  ],
  journal: [
    <>Every note you have written, newest first. Press Capture (or N) to add one.</>,
    <>Open a note to see what the atlas found in it and to accept or dismiss its suggestions.</>,
  ],
  decisions: [
    <>Log a decision with the options you had and what you expect to happen.</>,
    <>Later, add what actually happened. Comparing the two is how you learn how you decide.</>,
  ],
  questions: [
    <>Open questions you are exploring. Link them to notes and experiments as you find answers.</>,
    <>Mark a question resolved when you have an answer, and write down what it was.</>,
  ],
};

/**
 * A page's "how this works" note: open on the first visit, then folded into
 * a small link. Remembered per page.
 */
export function HowItWorks({ page, className }: { page: string; className?: string }) {
  const seen = useUI((s) => s.tipsSeen.includes(page));
  const setSeen = useUI((s) => s.setTipSeen);
  const [open, setOpen] = useState(!seen);
  const items = PAGE_HELP[page];
  if (!items) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink-2', className)}>
        <CircleHelp size={13} aria-hidden />
        How this page works
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
      className={cn('rounded-[9px] border border-line-strong px-4 py-3', floating ? 'bg-overlay/95 shadow-2xl backdrop-blur-md' : 'bg-surface', className)}
      aria-label="How this page works"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="label flex items-center gap-1.5 text-ink-2!">
          <CircleHelp size={12} aria-hidden /> How this page works
        </span>
        {floating && (
          <button type="button" onClick={onDone} className="rounded p-0.5 text-ink-3 hover:text-ink" aria-label="Close">
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
        Got it
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
