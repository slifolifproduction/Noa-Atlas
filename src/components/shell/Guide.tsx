import { ArrowRight } from 'lucide-react';
import { useEffect } from 'react';
import { useUI } from '../../state/uiStore';
import { AREA_ICONS, CAPTURE_ICONS, KIND_ICONS } from '../icons';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/primitives';
import { Modal } from '../ui/Modal';
import { LANGUAGES, setLang, t, useLang, type Lang } from '../../i18n';

/**
 * The welcome: three plain statements, then straight into the atlas. Opens
 * by itself on the first visit; the ⋯ menu brings it back.
 */
export function Guide() {
  const open = useUI((s) => s.guideOpen);
  const setOpen = useUI((s) => s.setGuideOpen);
  const openCapture = useUI((s) => s.openCapture);
  const lang = useLang();

  // The first visit starts with the welcome.
  useEffect(() => {
    if (!useUI.getState().guideSeen) setOpen(true);
  }, [setOpen]);

  const close = () => setOpen(false);
  const lines = [
    { icon: AREA_ICONS.self, title: t('This is your life, drawn as a map.'), body: t('You are at the centre; the areas of your life sit around you.') },
    { icon: CAPTURE_ICONS.journal, title: t('Write what happened.'), body: t('A few honest lines are enough. The Atlas places them on the map for you.') },
    {
      icon: KIND_ICONS.question,
      title: t('Tap anything to ask about it.'),
      body: t('Why is this happening? What usually comes before it? What if I change it? Every answer shows what it rests on.'),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={close}
      title={t('Welcome to Cognitive Atlas')}
      width="max-w-[520px]"
      initialFocus="#guide-start"
      footer={
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
      <p className="mt-5 text-[12px] text-ink-3">{t('It starts with a sample life, so there is something to explore. Everything stays in this browser.')}</p>
      <div className="mt-3 border-t border-line pt-3">
        <Segmented<Lang> label={t('Language')} size="sm" value={lang} onChange={setLang} options={LANGUAGES.map((l) => ({ value: l.key, label: l.name }))} />
      </div>
    </Modal>
  );
}
