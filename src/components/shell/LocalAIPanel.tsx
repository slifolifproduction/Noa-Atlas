import { Download, RotateCcw, Square } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { t, tn } from '../../i18n';
import { formatDate } from '../../lib/dates';
import { builtInModel, hasDeviceHeads, MODEL_INFO, removeLocalAI, startLocalAI, stopLocalAI, useLocalAI } from '../../ml/engine';
import { HEAD_NAMES, type Head } from '../../ml/tasks';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button } from '../ui/Button';
import { ConfirmButton } from '../ui/ConfirmButton';
import { FieldLabel, Progress } from '../ui/primitives';

const HEAD_LABEL: Record<Head, () => string> = {
  act: () => t('What it reports (done, decided, still to do)'),
  direction: () => t('What went up or down'),
  cause: () => t('An explanation of why'),
  time: () => t('Past, now or ahead'),
  mood: () => t('How it sounds'),
};

/** How well a model read sentences it had not learned from: per question, about how many in ten it got right. */
function Scores({ scores, caption }: { scores: { accuracy: number }[]; caption: string }) {
  return (
    <div className="mt-2">
      <ul className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
        {HEAD_NAMES.map((h, i) =>
          scores[i] ? (
            <li key={h} className="flex items-baseline justify-between gap-2 text-ink-2">
              <span>{HEAD_LABEL[h]()}</span>
              <span className="num shrink-0 text-ink-3">{t('about {n} in 10', { n: Math.round(scores[i].accuracy * 10) })}</span>
            </li>
          ) : null,
        )}
      </ul>
      <p className="mt-1 text-[11.5px] text-ink-3">{caption}</p>
    </div>
  );
}

function Part({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-[2px] border border-line p-3.5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[13.5px] text-ink">{title}</span>
        {aside && <span className="label">{aside}</span>}
      </div>
      {children}
    </div>
  );
}

const mb = (bytes?: number) => (bytes ? Math.round(bytes / 1e6) : 0);

/**
 * The local AI in Settings: the built-in model (always there), the language model (downloaded only when you say so,
 * with how far it got and how well it reads), and what it learned from you, which can be forgotten.
 */
export function LocalAIPanel() {
  const settings = useUI((s) => s.settings);
  const setSettings = useUI((s) => s.setSettings);
  const ai = useLocalAI();
  const ml = useAtlas((s) => s.data.learning?.ml);
  const forget = useAtlas((s) => s.forgetLocalAI);
  const [builtIn, setBuiltIn] = useState<Awaited<ReturnType<typeof builtInModel>>>(null);
  const [host, setHost] = useState(settings.modelHost ?? '');
  useEffect(() => {
    void builtInModel().then(setBuiltIn);
  }, []);
  const corrections = ml?.corrections.length ?? 0;
  const taught = Object.values(ml?.links ?? {}).filter((x) => x.yes.length + x.no.length > 0).length;
  const busy = ai.status === 'downloading' || ai.status === 'learning';
  const retry = () => {
    stopLocalAI();
    startLocalAI({ host: settings.modelHost || undefined });
  };

  return (
    <div className="mt-3.5 space-y-2.5 text-[12.5px] leading-snug">
      <Part title={t('Built-in model')} aside={t('Reading')}>
        <p className="text-ink-2">
          {t(
            'A small neural network that comes with the app, under a megabyte. It reads what each sentence of a note reports (something done, a choice made, something still to do, an explanation, how you feel), in Indonesian and English, from its words. Nothing to download.',
          )}
        </p>
        {builtIn?.gold && (
          <Scores
            scores={builtIn.gold}
            caption={t('On sentences written by hand that it never learned from, when it was trained ({date}).', { date: formatDate(builtIn.trained) })}
          />
        )}
      </Part>

      <Part
        title={t('Language model')}
        aside={
          ai.status === 'ready'
            ? t('Reading')
            : ai.status === 'downloading'
              ? t('Downloading')
              : ai.status === 'learning'
                ? t('Learning')
                : ai.status === 'error'
                  ? t('Could not start')
                  : t('Not downloaded')
        }
      >
        <p className="text-ink-2">
          {t(
            'A multilingual sentence model ({model}) that reads meaning: a note can be linked to what it is about though it never names it, and a step can be read as finished though it is said in other words. It is downloaded once (about {size} MB) and kept by this browser; after that it works offline. Your notes never leave this device.',
            { model: MODEL_INFO.id.split('/')[1], size: MODEL_INFO.megabytes },
          )}
        </p>

        {busy && (
          <div className="mt-2.5">
            <Progress value={ai.fraction} label={t('Getting the sentence model ready')} color="var(--color-accent)" />
            <p className="mt-1 text-ink-3">
              {ai.status === 'downloading'
                ? ai.total
                  ? t('Downloading: {a} of {b} MB.', { a: mb(ai.loaded), b: mb(ai.total) })
                  : t('Downloading…')
                : t('Learning to read on this device, from the examples that come with the app…')}
            </p>
          </div>
        )}

        {ai.status === 'ready' && (
          <>
            {ai.scores && (
              <Scores
                scores={ai.scores}
                caption={t('On examples kept aside while it learned here. They are made from templates, so your own notes read less well than this.')}
              />
            )}
            <p className="mt-2 text-ink-3">
              {ai.calibratedOn
                ? t('What counts as close in meaning was measured on {n} of your own links.', { n: ai.calibratedOn })
                : t('What counts as close in meaning is the default until you have linked notes to elements a few more times.')}
            </p>
          </>
        )}

        {ai.status === 'error' && (
          <p className="mt-2 text-counter">
            {t('It could not be loaded here: {error}', { error: ai.error ?? '' })}{' '}
            <span className="text-ink-3">{t('It needs to reach huggingface.co, or the place set below.')}</span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!settings.localModel ? (
            <Button variant="primary" size="sm" icon={Download} onClick={() => setSettings({ localModel: true })}>
              {t('Download and use it')}
            </Button>
          ) : (
            <>
              {ai.status === 'error' && (
                <Button size="sm" icon={RotateCcw} onClick={retry}>
                  {t('Try again')}
                </Button>
              )}
              <Button variant="ghost" size="sm" icon={Square} onClick={() => setSettings({ localModel: false })}>
                {t('Stop using it')}
              </Button>
            </>
          )}
          {(settings.localModel || hasDeviceHeads()) && (
            <ConfirmButton
              label={t('Remove the download')}
              confirmLabel={t('Remove it')}
              onConfirm={() => {
                setSettings({ localModel: false });
                void removeLocalAI();
              }}
            />
          )}
        </div>

        <details className="mt-3">
          <summary className="cursor-pointer text-ink-3 hover:text-ink-2">{t('Download it from somewhere else')}</summary>
          <div className="mt-2">
            <FieldLabel htmlFor="s-model-host" hint={t('a mirror, or your own copy of the model')}>
              {t('Model host')}
            </FieldLabel>
            <div className="flex flex-wrap gap-2">
              <input
                id="s-model-host"
                className="field num max-w-[360px]"
                placeholder="https://huggingface.co/"
                value={host}
                onChange={(e) => setHost(e.target.value)}
              />
              <Button size="sm" onClick={() => setSettings({ modelHost: host.trim() || undefined })}>
                {t('Use this')}
              </Button>
            </div>
          </div>
        </details>
      </Part>

      <Part title={t('What it learned from you')}>
        {corrections + taught === 0 ? (
          <p className="text-ink-3">
            {t(
              'Nothing yet. Correct how it read a sentence (in a note’s panel), link a note to an element, or take back a link it suggested, and it learns from that.',
            )}
          </p>
        ) : (
          <>
            <p className="text-ink-2">
              {[
                tn(corrections, 'one reading you corrected', '{n} readings you corrected'),
                tn(taught, 'sentences about one element', 'sentences about {n} elements'),
              ].join(' · ')}
            </p>
            <div className="mt-2">
              <ConfirmButton label={t('Forget what the local AI learned')} confirmLabel={t('Forget it')} onConfirm={forget} />
            </div>
          </>
        )}
      </Part>
    </div>
  );
}
