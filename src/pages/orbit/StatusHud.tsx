import { ArrowRight, PanelLeftClose, Plus } from 'lucide-react';
import { focusGraphId, noticeables } from '../../domain/ask';
import { modelCounts } from '../../domain/selectors';
import { formatDate, useToday } from '../../lib/dates';
import { useAtlas } from '../../state/atlasStore';
import { useUI } from '../../state/uiStore';
import { Button, IconButton } from '../../components/ui/Button';
import { NextStepCard } from '../../components/shell/NextStepCard';
import { t } from '../../i18n';

/**
 * The overview, kept to two things: something worth looking at on the map,
 * and the next step. Choosing what to look at makes it the focus of every lens.
 */
export function StatusHud({ onClose, start }: { onClose?: () => void; start?: { addPoint(): void; identity(): void } }) {
  const data = useAtlas((s) => s.data);
  const open = useUI((s) => s.openEntity);
  const requestFocus = useUI((s) => s.requestFocus);
  const today = useToday();
  const empty = modelCounts(data).records === 0;
  const noticed = empty ? [] : noticeables(data, today);
  const [first, ...rest] = noticed;

  const look = (ref: (typeof noticed)[number]['ref']) => {
    open(ref);
    const id = focusGraphId(ref);
    if (id) requestFocus('orbit', id);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between border-b border-line pr-1.5 pl-4">
        <span className="label text-ink-2!">{t('Overview')}</span>
        <span className="num ml-auto pr-2 text-[11px] tracking-[0.1em] text-ink-3">{formatDate(today).toUpperCase()}</span>
        {onClose && <IconButton icon={PanelLeftClose} label={t('Hide the overview (View menu brings it back)')} size="sm" onClick={onClose} />}
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pt-3 pb-3">
        {first && (
          <section aria-labelledby="look-title">
            <h2 id="look-title" className="label px-1">
              {t('Something to look at')}
            </h2>
            <button
              type="button"
              onClick={() => look(first.ref)}
              className="group mt-2 block w-full rounded-[2px] border border-line-strong bg-canvas/40 px-3.5 py-3 text-left transition-colors hover:border-ink/40"
            >
              <span className="display block text-[17px] leading-[1.2] text-ink">{first.title}</span>
              <span className="mt-1 block text-[12.5px] leading-snug text-ink-2">{first.line}</span>
              <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-accent">
                {t('Look closer')} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
            </button>
            {rest.length > 0 && (
              <ul className="mt-1.5">
                {rest.slice(0, 3).map((n) => (
                  <li key={n.key}>
                    <button
                      type="button"
                      onClick={() => look(n.ref)}
                      className="group flex w-full flex-col rounded-[2px] px-1 py-1.5 text-left hover:bg-ink/[0.04]"
                    >
                      <span className="truncate text-[12.5px] text-ink-2 group-hover:text-ink">{n.title}</span>
                      <span className="text-[11.5px] text-ink-3">{n.line}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        <section aria-label={t('Next step')}>
          <NextStepCard />
        </section>
        {start && (
          <div className="px-1">
            <p className="text-[12.5px] leading-snug text-ink-3">
              {t('Or begin with the map itself: what you value, what you are working on, the people around you.')}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" icon={Plus} onClick={start.addPoint}>
                {t('Add to the map')}
              </Button>
              <Button size="sm" variant="ghost" onClick={start.identity}>
                {t('Describe yourself')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
