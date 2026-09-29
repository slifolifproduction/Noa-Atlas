import { ArrowRight, BookOpen, Compass, Ellipsis, Orbit, Search } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/primitives';
import { Modal } from '../ui/Modal';

interface Step {
  title: string;
  body: ReactNode;
  /** A way to try the step right away (closes the guide). */
  tryIt?: { label: string; run(): void };
}

const LOOP = [{ label: 'Write what happens' }, { label: 'See what repeats' }, { label: 'Choose a direction' }, { label: 'Take the next step' }];

/**
 * A short welcome: what this is, the one loop it runs on, and where things are.
 * Opens by itself on the first visit; the ⋯ menu brings it back.
 */
export function Guide() {
  const open = useUI((s) => s.guideOpen);
  const setOpen = useUI((s) => s.setGuideOpen);
  const openCapture = useUI((s) => s.openCapture);
  const [i, setI] = useState(0);

  // The first visit starts with the guide.
  useEffect(() => {
    if (!useUI.getState().guideSeen) setOpen(true);
  }, [setOpen]);
  useEffect(() => {
    if (open) setI(0);
  }, [open]);

  const close = () => setOpen(false);
  const steps: Step[] = [
    {
      title: 'Welcome to Cognitive Atlas',
      body: (
        <>
          <p>A private map of your life and how you think. It learns only from what you write, and everything stays in this browser.</p>
          <p className="mt-2">It runs on one simple loop:</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-4">
            {LOOP.map((s, n) => (
              <li key={s.label} className="flex items-center gap-3 border-t border-line-strong pt-2.5 sm:flex-col sm:items-start sm:gap-2">
                <span className="display text-[26px] leading-[1.2] text-ink-3">{n + 1}</span>
                <span className="text-[12.5px] leading-snug text-ink">{s.label}</span>
              </li>
            ))}
          </ol>
        </>
      ),
    },
    {
      title: '1 · Write what happens',
      body: (
        <>
          <p>
            Press <strong className="text-ink">Capture</strong> (or the <Kbd>N</Kbd> key) and write a few lines: something that happened, a decision, a worry.
            No format and no title needed.
          </p>
          <p className="mt-2">Short and honest beats long and polished. Once a week is enough to start.</p>
        </>
      ),
      tryIt: {
        label: 'Write a note',
        run: () => {
          close();
          openCapture('journal');
        },
      },
    },
    {
      title: '2 · See what keeps repeating',
      body: (
        <>
          <p>
            After you save, the atlas suggests links and <strong className="text-ink">patterns</strong>, each one showing the notes behind it, for and against.
          </p>
          <p className="mt-2">You accept what fits and reject what does not. Nothing is added to your map without you.</p>
        </>
      ),
      tryIt: {
        label: 'Open Patterns',
        run: () => {
          close();
          navigate('patterns');
        },
      },
    },
    {
      title: '3 · Choose a direction, then one step',
      body: (
        <>
          <p>
            Under <strong className="text-ink">Plan</strong>, Options shows your choices side by side, never ranked: the choice is yours.
          </p>
          <p className="mt-2">When you pick one, My plan turns it into a goal, this month&apos;s targets and this week&apos;s next step.</p>
        </>
      ),
      tryIt: {
        label: 'See your options',
        run: () => {
          close();
          navigate('paths');
        },
      },
    },
    {
      title: 'Finding your way around',
      body: (
        <ul className="space-y-2.5">
          <Where icon={Orbit} title="Map">
            Orbit shows your areas of life, Mind shows how you think. Click anything to open it; “Add point” adds your own. The Overview on the left always
            shows one thing to do next.
          </Where>
          <Where icon={BookOpen} title="Notes">
            Everything you have written: notes, decisions and open questions.
          </Where>
          <Where icon={Compass} title="Plan">
            Your options side by side, the direction you chose, and this week&apos;s steps.
          </Where>
          <Where icon={Ellipsis} title="More (⋯, top right)">
            Versions (save your atlas and go back to it, or start fresh), this guide, shortcuts and settings.
          </Where>
          <Where icon={Search} title="Search and help">
            <Kbd>⌘K</Kbd> finds anything. Every page has a “How this page works” note.
          </Where>
        </ul>
      ),
    },
  ];
  const step = steps[i];
  const last = i === steps.length - 1;

  return (
    <Modal
      open={open}
      onClose={close}
      title={step.title}
      width="max-w-[560px]"
      initialFocus="#guide-next"
      footer={
        <>
          <div className="mr-auto flex items-center gap-1.5" aria-label={`Step ${i + 1} of ${steps.length}`}>
            {steps.map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setI(n)}
                aria-label={`Step ${n + 1}`}
                className={cn('h-1.5 rounded-full transition-all', n === i ? 'w-5 bg-accent' : 'w-1.5 bg-ink/20 hover:bg-ink/35')}
              />
            ))}
          </div>
          {i === 0 ? (
            <Button variant="ghost" onClick={close}>
              Skip
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setI(i - 1)}>
              Back
            </Button>
          )}
          <Button id="guide-next" variant="primary" icon={last ? undefined : ArrowRight} onClick={() => (last ? close() : setI(i + 1))}>
            {i === 0 ? 'Show me how' : last ? 'Start' : 'Next'}
          </Button>
        </>
      }
    >
      <div className="text-[13.5px] leading-relaxed text-ink-2">{step.body}</div>
      {step.tryIt && (
        <button
          type="button"
          onClick={step.tryIt.run}
          className="mt-5 inline-flex items-center gap-1.5 border-b border-accent pb-0.5 text-[13px] text-ink hover:text-accent"
        >
          Try it now: {step.tryIt.label} <ArrowRight size={13} aria-hidden />
        </button>
      )}
    </Modal>
  );
}

function Where({ icon: Icon, title, children }: { icon: typeof Orbit; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[2px] border border-line bg-raised">
        <Icon size={14} strokeWidth={1.5} className="text-ink-2" aria-hidden />
      </span>
      <span>
        <span className="block text-[13px] font-medium text-ink">{title}</span>
        <span className="block text-[12.5px] leading-snug text-ink-2">{children}</span>
      </span>
    </li>
  );
}
