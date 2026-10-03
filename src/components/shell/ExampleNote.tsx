import { BookOpen, X } from 'lucide-react';
import { useState } from 'react';
import { navigate } from '../../app/router';
import { exampleInfo } from '../../data/examples';
import { isExampleAtlas } from '../../data/exampleAtlas';
import { useAtlas } from '../../state/atlasStore';
import { toast, useUI } from '../../state/uiStore';
import { backToMyAtlas } from '../../state/versionOps';
import { Button, IconButton } from '../ui/Button';
import { t } from '../../i18n';

/**
 * While the atlas is an example, a quiet note says so, and whose: it is there
 * to learn the system, not the person's own. From it: back to the person's
 * own atlas (when they opened the example from it), another example, or an
 * atlas of their own.
 */
export function ExampleNote() {
  const example = useAtlas((s) => isExampleAtlas(s.data));
  const info = exampleInfo(useAtlas((s) => s.data.profile?.example));
  const hidden = useUI((s) => s.exampleNoteHidden);
  const returnId = useUI((s) => s.returnVersionId);
  const hide = useUI((s) => s.hideExampleNote);
  const setStartFreshOpen = useUI((s) => s.setStartFreshOpen);
  const [busy, setBusy] = useState(false);
  if (!example || hidden) return null;

  const back = async () => {
    setBusy(true);
    try {
      await backToMyAtlas();
      navigate('orbit');
      toast(t('Back in your atlas. What you did in the example is saved in Versions.'), { tone: 'success' });
    } catch {
      useUI.getState().setReturnVersion(undefined);
      toast(t('Your saved atlas could not be found. Look in Versions.'), { tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="note" aria-label={t('The example atlas')} className="flex items-center gap-2.5 border-b border-line bg-surface px-4 py-1.5 md:px-5">
      <BookOpen size={14} strokeWidth={1.7} className="shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
        <span className="text-ink">{t('The example atlas')}</span>
        {info ? (
          <>
            <span className="text-ink"> · {t(info.identity)}</span>
            <span className="hidden sm:inline">
              {' '}
              · {t('{name}, someone invented, there to learn how everything works. Nothing here is yours.', { name: info.name })}
            </span>
          </>
        ) : (
          <span className="hidden sm:inline"> · {t('Noa’s life around Night Ferry, there to learn how everything works. Nothing here is yours.')}</span>
        )}
      </p>
      {returnId && (
        <Button size="sm" variant="primary" loading={busy} onClick={() => void back()}>
          {t('Back to my atlas')}
        </Button>
      )}
      <Button size="sm" variant="ghost" className="max-sm:hidden" onClick={() => setStartFreshOpen(true, 'sample')}>
        {t('Other examples')}
      </Button>
      <Button size="sm" variant={returnId ? 'ghost' : 'secondary'} onClick={() => setStartFreshOpen(true, 'empty')}>
        {returnId ? t('Start a new atlas') : t('Start my own atlas')}
      </Button>
      <IconButton icon={X} size="sm" label={t('Hide for now')} onClick={hide} />
    </div>
  );
}
