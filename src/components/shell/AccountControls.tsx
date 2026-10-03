import { Cloud, CloudOff, CloudUpload, HardDrive } from 'lucide-react';
import { useState } from 'react';
import { hrefFor } from '../../app/router';
import { isExampleAtlas } from '../../data/exampleAtlas';
import { dateOf, formatDate, formatTime, todayISO } from '../../lib/dates';
import { useAccount, type AccountState } from '../../state/accountStore';
import { useAtlas } from '../../state/atlasStore';
import { toast } from '../../state/uiStore';
import { moveIntoAccount, notNow } from '../../sync/connect';
import { Button } from '../ui/Button';
import { t, tn } from '../../i18n';

/** A moment: its time today, or its date and time. */
const when = (at: string) => (dateOf(at) === todayISO() ? formatTime(at) : `${formatDate(dateOf(at))} ${formatTime(at)}`);

/** How the last save to the account went, in a sentence. */
export function syncSentence(a: AccountState): string {
  const s = a.sync;
  if (!s || s.state === 'saved') return s?.at ? t('Saved to your account at {when}.', { when: when(s.at) }) : t('Up to date with your account.');
  if (s.state === 'saving') return t('Saving to your account…');
  if (s.state === 'newer')
    return t('Your account was saved by a newer version of this app. Reload the page to keep working with it; nothing is saved from here until then.');
  if (s.state === 'offline') return t('Your account cannot be reached right now. Everything stays on this device and is saved when it can be.');
  return t('Could not save to your account ({code}). Everything stays on this device.', { code: s.code ?? '?' });
}

/** Where the atlas is kept, in a sentence, for a viewer whose atlas is on this device. */
function deviceSentence(a: AccountState): string {
  if (a.mode === 'checking') return t('Checking whether your claude.ai account can keep it…');
  if (!a.reason) return t('Your claude.ai account can keep it too, the same on every device where you sign in.');
  if (a.reason === 'outside') return t('Opened inside claude.ai while signed in, it can be kept in your account and used on every device.');
  if (a.reason === 'signed-out') return t('Sign in to claude.ai to keep it in your account and use it on every device.');
  if (a.reason === 'read-only')
    return t('This link lets you use the atlas but not save it to your account (people from outside the owner’s workspace cannot). Export a copy to move it.');
  return t('Your account could not be reached just now; it is asked again next time.');
}

async function move(setBusy: (b: boolean) => void) {
  setBusy(true);
  try {
    await moveIntoAccount();
    toast(t('Saved to your account. It opens the same on every device where you sign in.'), { tone: 'success' });
  } catch {
    toast(t('Could not save to your account just now. Your atlas is still on this device.'), { tone: 'warning' });
  } finally {
    setBusy(false);
  }
}

/** Offered once the account can keep an atlas and has none: move this one in, or not now. */
export function AccountStrip() {
  const offer = useAccount((s) => s.offer && s.mode === 'device');
  const example = useAtlas((s) => isExampleAtlas(s.data));
  const [busy, setBusy] = useState(false);
  if (!offer || example) return null;
  return (
    <div role="note" className="flex items-center gap-2.5 border-b border-line bg-surface px-4 py-1.5 md:px-5">
      <Cloud size={14} strokeWidth={1.7} className="shrink-0 text-accent" aria-hidden />
      <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
        {t('Keep this atlas in your claude.ai account, to open it on any device where you sign in.')}
      </p>
      <Button size="sm" variant="primary" loading={busy} onClick={() => void move(setBusy)}>
        {t('Save to my account')}
      </Button>
      <Button size="sm" variant="ghost" onClick={notNow}>
        {t('Not now')}
      </Button>
    </div>
  );
}

/** In the top bar while the atlas is the account's: whether it is saved. */
export function SyncIndicator() {
  const account = useAccount();
  if (account.mode !== 'account') return null;
  const state = account.sync?.state ?? 'saved';
  const Icon = state === 'saving' ? CloudUpload : state === 'saved' ? Cloud : CloudOff;
  const text = syncSentence(account);
  return (
    <a
      href={hrefFor('settings')}
      title={text}
      aria-label={text}
      className={`hidden h-8 w-8 items-center justify-center rounded-[2px] sm:flex ${state === 'saved' || state === 'saving' ? 'text-ink-3 hover:text-ink' : 'text-counter hover:text-ink'}`}
    >
      <Icon size={15} strokeWidth={1.7} aria-hidden />
    </a>
  );
}

/** Settings: where the atlas is kept, and moving it into the account. */
export function AccountPanel() {
  const account = useAccount();
  const example = useAtlas((s) => isExampleAtlas(s.data));
  const [busy, setBusy] = useState(false);
  const inAccount = account.mode === 'account';
  const Icon = inAccount ? Cloud : HardDrive;
  return (
    <div>
      <p className="flex items-center gap-2 text-[14px] text-ink">
        <Icon size={15} strokeWidth={1.7} className={inAccount ? 'text-accent' : 'text-ink-3'} aria-hidden />
        {inAccount ? t('In your claude.ai account') : t('On this device only')}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-ink-2">
        {inAccount
          ? t('The same on every device where you sign in. A copy stays on this device, so it opens at once and works offline.')
          : deviceSentence(account)}
      </p>
      {inAccount && <p className="mt-1 text-[12.5px] leading-snug text-ink-3">{syncSentence(account)}</p>}
      {inAccount && account.sync?.conflicts ? (
        <p className="mt-1 text-[12.5px] leading-snug text-ink-3">
          {tn(
            account.sync.conflicts,
            'One record had been changed on two devices; the later edit was kept.',
            '{n} records had been changed on two devices; the later edit was kept each time.',
          )}
        </p>
      ) : null}
      {account.mode === 'device' && !account.reason && (
        <div className="mt-3">
          <Button size="sm" variant="primary" loading={busy} disabled={example} onClick={() => void move(setBusy)}>
            {t('Save to my account')}
          </Button>
          {example && <p className="mt-1.5 text-[12px] text-ink-3">{t('The example stays on the device. Start your own atlas to keep it in your account.')}</p>}
        </div>
      )}
      <p className="mt-3 text-[12px] leading-snug text-ink-3">
        {t('Saved versions, the language, the time zone and how the map is arranged stay on each device.')}
      </p>
    </div>
  );
}
