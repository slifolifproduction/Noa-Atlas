import { ArrowRight, Ellipsis, Search, type LucideIcon } from 'lucide-react';
import { PLACE_ICONS } from '../icons';
import { useEffect, useState, type ReactNode } from 'react';
import { navigate } from '../../app/router';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { Kbd, Segmented } from '../ui/primitives';
import { Modal } from '../ui/Modal';
import { LANGUAGES, setLang, t, useLang, type Lang } from '../../i18n';
import { Trans } from '../../i18n/Trans';

interface Step {
  title: string;
  body: ReactNode;
  /** A way to try the step right away (closes the guide). */
  tryIt?: { label: string; run(): void };
}

const LOOP = [
  {
    get label() {
      return t('Write what happens');
    },
  },
  {
    get label() {
      return t('See what repeats');
    },
  },
  {
    get label() {
      return t('Choose a direction');
    },
  },
  {
    get label() {
      return t('Take the next step');
    },
  },
];

/**
 * A short welcome: what this is, the one loop it runs on, and where things are.
 * Opens by itself on the first visit; the ⋯ menu brings it back.
 */
export function Guide() {
  const open = useUI((s) => s.guideOpen);
  const setOpen = useUI((s) => s.setGuideOpen);
  const openCapture = useUI((s) => s.openCapture);
  const [i, setI] = useState(0);
  const lang = useLang();

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
      title: t('Welcome to Cognitive Atlas'),
      body: (
        <>
          <p>{t('A private map of your life and how you think. It learns only from what you write, and everything stays in this browser.')}</p>
          <p className="mt-2">{t('It runs on one simple loop:')}</p>
          <ol className="mt-3 grid gap-2 sm:grid-cols-4">
            {LOOP.map((s, n) => (
              <li key={s.label} className="flex items-center gap-3 border-t border-line-strong pt-2.5 sm:flex-col sm:items-start sm:gap-2">
                <span className="display text-[26px] leading-[1.2] text-ink-3">{n + 1}</span>
                <span className="text-[12.5px] leading-snug text-ink">{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
            <Segmented<Lang> label={t('Language')} value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.key, label: l.name }))} />
          </div>
        </>
      ),
    },
    {
      title: t('1 · Write what happens'),
      body: (
        <>
          <p>
            <Trans
              text={t('Press {capture} (or the {key} key) and write a few lines: something that happened, a decision, a worry. No format and no title needed.')}
              values={{ capture: <strong className="text-ink">{t('Capture')}</strong>, key: <Kbd>N</Kbd> }}
            />
          </p>
          <p className="mt-2">{t('Short and honest beats long and polished. Once a week is enough to start.')}</p>
        </>
      ),
      tryIt: {
        label: t('Write a note'),
        run: () => {
          close();
          openCapture('journal');
        },
      },
    },
    {
      title: t('2 · See what keeps repeating'),
      body: (
        <>
          <p>
            <Trans
              text={t('After you save, the atlas suggests links and {patterns}, each one showing the notes behind it, for and against.')}
              values={{ patterns: <strong className="text-ink">{t('patterns')}</strong> }}
            />
          </p>
          <p className="mt-2">{t('You accept what fits and reject what does not. Nothing is added to your map without you.')}</p>
        </>
      ),
      tryIt: {
        label: t('Open Patterns'),
        run: () => {
          close();
          navigate('patterns');
        },
      },
    },
    {
      title: t('3 · Choose a direction, then one step'),
      body: (
        <>
          <p>
            <Trans
              text={t('Under {plan}, Options shows your choices side by side, never ranked: the choice is yours.')}
              values={{ plan: <strong className="text-ink">{t('Plan')}</strong> }}
            />
          </p>
          <p className="mt-2">{t('When you pick one, My plan turns it into a goal, this month’s targets and this week’s next step.')}</p>
        </>
      ),
      tryIt: {
        label: t('See your options'),
        run: () => {
          close();
          navigate('paths');
        },
      },
    },
    {
      title: t('Finding your way around'),
      body: (
        <ul className="space-y-2.5">
          <Where icon={PLACE_ICONS.map} title={t('Map')}>
            {t(
              'Orbit shows your areas of life, Mind shows how you think. Click anything to open it; “Add point” adds your own. The Overview on the left always shows one thing to do next.',
            )}
          </Where>
          <Where icon={PLACE_ICONS.notes} title={t('Notes')}>
            {t('Everything you have written: notes, decisions and open questions.')}
          </Where>
          <Where icon={PLACE_ICONS.plan} title={t('Plan')}>
            {t('Your options side by side, the direction you chose, and this week’s steps.')}
          </Where>
          <Where icon={Ellipsis} title={t('More (⋯, top right)')}>
            {t('Versions (save your atlas and go back to it, or start fresh), this guide, shortcuts and settings.')}
          </Where>
          <Where icon={Search} title={t('Search and help')}>
            <Trans text={t('{key} finds anything. Every page has a “How this page works” note.')} values={{ key: <Kbd>⌘K</Kbd> }} />
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
          <div className="mr-auto flex items-center gap-1.5" aria-label={t('Step {n} of {total}', { n: i + 1, total: steps.length })}>
            {steps.map((_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setI(n)}
                aria-label={t('Step {n}', { n: n + 1 })}
                className={cn('h-1.5 rounded-full transition-all', n === i ? 'w-5 bg-accent' : 'w-1.5 bg-ink/20 hover:bg-ink/35')}
              />
            ))}
          </div>
          {i === 0 ? (
            <Button variant="ghost" onClick={close}>
              {t('Skip')}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setI(i - 1)}>
              {t('Back')}
            </Button>
          )}
          <Button id="guide-next" variant="primary" icon={last ? undefined : ArrowRight} onClick={() => (last ? close() : setI(i + 1))}>
            {i === 0 ? t('Show me how') : last ? t('Start') : t('Next')}
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
          {t('Try it now: {action}', { action: step.tryIt.label })} <ArrowRight size={13} aria-hidden />
        </button>
      )}
    </Modal>
  );
}

function Where({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
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
