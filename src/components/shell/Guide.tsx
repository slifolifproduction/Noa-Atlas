import { ArrowRight, BookOpen, Sprout } from 'lucide-react';
import { useEffect, useState } from 'react';
import { navigate } from '../../app/router';
import { DEFAULT_EXAMPLE, isExampleKey, type ExampleKey } from '../../data/examples';
import { isExampleAtlas } from '../../data/seed';
import { cn } from '../../lib/cn';
import { useAtlas } from '../../state/atlasStore';
import { useAccount } from '../../state/accountStore';
import { toast, useUI } from '../../state/uiStore';
import { startFresh, versionStamp } from '../../state/versionOps';
import { AREA_ICONS, CAPTURE_ICONS, KIND_ICONS } from '../icons';
import { Button } from '../ui/Button';
import { ExamplePicker } from './ExamplePicker';
import { FieldLabel, Segmented } from '../ui/primitives';
import { Modal } from '../ui/Modal';
import { LANGUAGES, setLang, t, useLang, type Lang } from '../../i18n';

/** Notes or decisions the person added while exploring the example (the example's own are numbered). */
const addedToExample = (data: ReturnType<typeof useAtlas.getState>['data']) =>
  Object.keys(data.entries).some((id) => !/^ent_\d{2}$/.test(id)) || Object.keys(data.decisions).some((id) => !/^dec_\d{2}$/.test(id));

/**
 * The welcome: three plain statements, then a choice of how to begin. The
 * examples (seven people at work and one student, each a life already filled
 * in) are there to learn the whole system on something close to one's own,
 * so that an atlas of one's own does not start from confusion; the blank
 * atlas is only yours. It asks once,
 * on the first visit; the ⋯ menu brings it back, with the way to the example
 * or to an atlas of one's own. Switching never loses anything: the atlas
 * being left is saved as a version first.
 */
export function Guide() {
  const open = useUI((s) => s.guideOpen);
  const seen = useUI((s) => s.guideSeen);
  const setOpen = useUI((s) => s.setGuideOpen);
  const openCapture = useUI((s) => s.openCapture);
  const setStartFreshOpen = useUI((s) => s.setStartFreshOpen);
  const data = useAtlas((s) => s.data);
  const lang = useLang();
  const [choice, setChoice] = useState<'example' | 'blank'>('example');
  const current = data.profile?.example;
  const [pick, setPick] = useState<ExampleKey>(isExampleKey(current) ? current : DEFAULT_EXAMPLE);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const example = isExampleAtlas(data);
  const account = useAccount((s) => s.mode);
  // The choice is offered on the first visit, while the atlas is still the example nobody has made their own
  // (an account that already holds an atlas opens with it instead, so there is nothing to choose).
  const choosing = !seen && example && account !== 'account';

  // The first visit starts with the welcome.
  useEffect(() => {
    if (!useUI.getState().guideSeen) setOpen(true);
  }, [setOpen]);

  const close = () => setOpen(false);
  const begin = async () => {
    // The example already open is the one picked: nothing to change.
    if (choice === 'example' && pick === useAtlas.getState().data.profile?.example) {
      close();
      return;
    }
    setBusy(true);
    try {
      const saved = addedToExample(useAtlas.getState().data);
      const versionName = t('The example, as I left it · {when}', { when: versionStamp() });
      if (choice === 'example') {
        await startFresh({ save: saved, name: versionName, mode: 'sample', example: pick });
        close();
        navigate('orbit');
        return;
      }
      await startFresh({ save: saved, name: versionName, mode: 'empty', profileName: name });
      close();
      navigate('orbit');
      toast(t('Your atlas is ready. Write what happened, and it starts to fill in. The examples are always one step away in the ⋯ menu.'), { tone: 'success' });
    } catch {
      toast(t('Could not save a version in this browser, so nothing was changed. Use Export in Settings first.'), { tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const lines = [
    { icon: AREA_ICONS.self, title: t('This is your life, drawn as a map.'), body: t('You are at the centre; the areas of your life sit around you.') },
    { icon: CAPTURE_ICONS.journal, title: t('Write what happened.'), body: t('A few honest lines are enough. The Atlas places them on the map for you.') },
    {
      icon: KIND_ICONS.question,
      title: t('Tap anything to ask about it.'),
      body: t('Why is this happening? What usually comes before it? What if I change it? Every answer shows what it rests on.'),
    },
  ];

  const option = (value: 'example' | 'blank', Icon: typeof BookOpen, title: string, body: string) => (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-[2px] border px-3.5 py-3',
        choice === value ? 'border-accent/45 bg-accent-dim/40' : 'border-line hover:border-line-strong',
      )}
    >
      <input type="radio" name="begin" className="mt-1 accent-[var(--color-accent)]" checked={choice === value} onChange={() => setChoice(value)} />
      <Icon size={16} strokeWidth={1.6} className="mt-0.5 shrink-0 text-ink-2" aria-hidden />
      <span>
        <span className="block text-[13.5px] text-ink">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{body}</span>
      </span>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('Welcome to Cognitive Atlas')}
      width="max-w-[560px]"
      initialFocus="#guide-start"
      footer={
        choosing ? (
          <Button
            id="guide-start"
            variant="primary"
            icon={ArrowRight}
            loading={busy}
            // Until it is known whether the account already holds an atlas, starting a blank one could replace it.
            disabled={choosing && choice === 'blank' && account === 'checking'}
            onClick={() => void begin()}
          >
            {choice === 'example' ? t('Explore the example') : t('Start my atlas')}
          </Button>
        ) : (
          <>
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={() => {
                close();
                openCapture('journal');
              }}
            >
              {t('Write a note first')}
            </Button>
            <Button id="guide-start" variant="primary" icon={ArrowRight} onClick={close}>
              {t('Explore the atlas')}
            </Button>
          </>
        )
      }
    >
      <ol className="space-y-4">
        {lines.map((l) => (
          <li key={l.title} className="flex gap-3.5">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line-strong">
              <l.icon size={15} strokeWidth={1.6} className="text-ink-2" aria-hidden />
            </span>
            <span>
              <span className="display block text-[17px] leading-[1.25] text-ink">{l.title}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-2">{l.body}</span>
            </span>
          </li>
        ))}
      </ol>

      {choosing ? (
        <div className="mt-5 space-y-2" role="radiogroup" aria-label={t('How would you like to begin?')}>
          <div className="label">{t('How would you like to begin?')}</div>
          {option(
            'example',
            BookOpen,
            t('Learn with an example first'),
            t(
              'Worked examples: seven people at work and one student, each a life already filled in. Pick the one closest to yours, explore how notes, causes, repeats and tests fit together, then start your own when you are ready. What you do in it is kept as a version.',
            ),
          )}
          {choice === 'example' && (
            <div className="pt-1">
              <ExamplePicker name="guide-example" value={pick} onChange={setPick} />
            </div>
          )}
          {option(
            'blank',
            Sprout,
            t('Start from blank'),
            t('An empty atlas that is only yours. The examples stay one step away if you want to look something up.'),
          )}
          {choice === 'blank' && (
            <div className="pt-1">
              <FieldLabel htmlFor="begin-name" hint="optional">
                {t('Your name')}
              </FieldLabel>
              <input id="begin-name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('How the atlas addresses you')} />
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 rounded-[2px] border border-line px-3.5 py-3 text-[12.5px] leading-snug text-ink-2">
          {example ? (
            <>
              {t(
                'You are in an example atlas, there to learn how everything works. When you are ready, start an atlas of your own; the example is kept as a version.',
              )}
              <span className="mt-2 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    close();
                    setStartFreshOpen(true, 'empty');
                  }}
                >
                  {t('Start my own atlas')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    close();
                    setStartFreshOpen(true, 'sample');
                  }}
                >
                  {t('Other examples')}
                </Button>
              </span>
            </>
          ) : (
            <>
              {t(
                'Not sure how something works? Open an example, a life already filled in, to see it. Your atlas is saved as a version first, and one step brings you back.',
              )}
              <Button
                size="sm"
                className="mt-2 block"
                onClick={() => {
                  close();
                  setStartFreshOpen(true, 'sample');
                }}
              >
                {t('Open an example')}
              </Button>
            </>
          )}
        </div>
      )}
      <p className="mt-4 text-[12px] text-ink-3">{t('Everything stays in this browser.')}</p>
      <div className="mt-3 border-t border-line pt-3">
        <Segmented<Lang> label={t('Language')} size="sm" value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.key, label: l.name }))} />
      </div>
    </Modal>
  );
}
