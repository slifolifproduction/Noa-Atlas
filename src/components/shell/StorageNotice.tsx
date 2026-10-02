import { TriangleAlert } from 'lucide-react';
import { t } from '../../i18n';
import { todayISO } from '../../lib/dates';
import { downloadText } from '../../lib/download';
import { useStorageHealth } from '../../persistence/health';
import { exportPayload } from '../../persistence/storage';
import { useAtlas } from '../../state/atlasStore';
import { Button } from '../ui/Button';

/**
 * What the browser's storage did that the person must know, said where it cannot be missed: that the atlas is not
 * being saved (the storage is full or blocked), or that the saved atlas could not be read and was put aside. Each
 * with the one thing to do about it: download a copy.
 */
export function StorageNotice() {
  const failing = useStorageHealth((s) => s.failing);
  const unreadable = useStorageHealth((s) => s.unreadable);
  if (!failing && !unreadable) return null;
  return (
    <div role="alert" className="flex flex-col gap-1.5 border-b border-counter/40 bg-counter/[0.08] px-4 py-2 md:px-5">
      {failing && (
        <div className="flex flex-wrap items-center gap-2.5">
          <TriangleAlert size={14} className="shrink-0 text-counter" aria-hidden />
          <p className="min-w-0 flex-1 text-[12.5px] text-ink">
            {t('This browser is not saving your atlas: its storage is full or blocked. What you change now stays only until this tab is closed.')}
          </p>
          <Button size="sm" variant="primary" onClick={() => downloadText(`noa-atlas-${todayISO()}.json`, exportPayload(useAtlas.getState().data))}>
            {t('Download a copy')}
          </Button>
        </div>
      )}
      {unreadable && (
        <div className="flex flex-wrap items-center gap-2.5">
          <TriangleAlert size={14} className="shrink-0 text-counter" aria-hidden />
          <p className="min-w-0 flex-1 text-[12.5px] text-ink">
            {t('Your saved atlas could not be read, so the Atlas opened without it. Nothing was thrown away: the unreadable copy is kept aside.')}
          </p>
          <Button size="sm" variant="primary" onClick={() => downloadText(`noa-atlas-unreadable-${unreadable.at.slice(0, 10)}.json`, unreadable.raw)}>
            {t('Download the unreadable copy')}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => useStorageHealth.getState().setUnreadable(undefined)}>
            {t('Close')}
          </Button>
        </div>
      )}
    </div>
  );
}
