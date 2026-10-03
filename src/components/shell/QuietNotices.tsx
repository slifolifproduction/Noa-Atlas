import { Archive, RefreshCw, WifiOff, type LucideIcon } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { isExampleAtlas } from '../../data/exampleAtlas';
import { t } from '../../i18n';
import { formatDate, todayISO, useToday } from '../../lib/dates';
import { backupDue, downloadAtlasCopy, useBackup, WORTH_KEEPING } from '../../persistence/backup';
import { reloadIntoNewVersion, usePwa } from '../../pwa/register';
import { useAccount } from '../../state/accountStore';
import { useAtlas } from '../../state/atlasStore';
import { Button } from '../ui/Button';

function Row({ icon: Icon, children, actions }: { icon: LucideIcon; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <Icon size={14} className="shrink-0 text-ink-3" aria-hidden />
      <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">{children}</p>
      {actions}
    </div>
  );
}

/**
 * What is worth knowing but never urgent, said once at the top and left alone otherwise: a new version is ready to
 * reload into, the device is offline (and nothing is lost by it), or an atlas of the person's own has gone a while
 * without a copy kept elsewhere (see persistence/backup).
 */
export function QuietNotices() {
  const waiting = usePwa((s) => s.waiting);
  const online = usePwa((s) => s.online);
  const data = useAtlas((s) => s.data);
  const backup = useBackup();
  // Kept in the person's claude.ai account, it does not live only in this browser.
  const inAccount = useAccount((s) => s.mode === 'account');
  // Looked at again each day.
  useToday();
  const own = !isExampleAtlas(data);
  const notes = Object.keys(data.entries).length;
  useEffect(() => {
    if (own && notes >= WORTH_KEEPING) useBackup.getState().stamp();
  }, [own, notes]);
  const due = !inAccount && backupDue(backup, own, notes, new Date());
  if (!waiting && online && !due) return null;
  return (
    <div role="status" className="flex flex-col gap-1.5 border-b border-line bg-surface px-4 py-2 md:px-5">
      {waiting && (
        <Row
          icon={RefreshCw}
          actions={
            <Button size="sm" variant="primary" onClick={reloadIntoNewVersion}>
              {t('Reload')}
            </Button>
          }
        >
          {t('A new version of the Atlas is ready.')}
        </Row>
      )}
      {!online && <Row icon={WifiOff}>{t('Offline. The Atlas works as usual, and what you write is saved in this browser.')}</Row>}
      {due && (
        <Row
          icon={Archive}
          actions={
            <>
              <Button size="sm" variant="primary" onClick={() => downloadAtlasCopy(data)}>
                {t('Download a copy')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => useBackup.getState().putOff()}>
                {t('Later')}
              </Button>
            </>
          }
        >
          {backup.at
            ? t('Your atlas lives only in this browser, and its last copy is from {date}. Keep a new one somewhere else.', {
                date: formatDate(todayISO(new Date(backup.at))),
              })
            : t('Your atlas lives only in this browser, and no copy of it has been kept anywhere else yet.')}
        </Row>
      )}
    </div>
  );
}
