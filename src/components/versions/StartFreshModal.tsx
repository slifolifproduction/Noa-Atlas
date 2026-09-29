import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { navigate } from '../../app/router';
import { cn } from '../../lib/cn';
import { toast, useUI } from '../../state/uiStore';
import { restoreVersion, startFresh, versionStamp } from '../../state/versionOps';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { FieldLabel } from '../ui/primitives';
import { t } from '../../i18n';

/**
 * Begin a new atlas. The current one is saved as a version first (unless you
 * untick it), and the toast afterwards offers an immediate undo.
 */
export function StartFreshModal() {
  const open = useUI((s) => s.startFreshOpen);
  const setOpen = useUI((s) => s.setStartFreshOpen);
  const [save, setSave] = useState(true);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'empty' | 'sample'>('empty');
  const [profile, setProfile] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSave(true);
      setName(t('Before restart · {when}', { when: versionStamp() }));
      setMode('empty');
      setProfile('');
    }
  }, [open]);

  const go = async () => {
    setBusy(true);
    try {
      const saved = await startFresh({ save, name, mode, profileName: profile });
      setOpen(false);
      navigate('orbit');
      toast(saved ? t('Started fresh. Your previous atlas is saved in Versions.') : t('Started fresh.'), {
        tone: 'success',
        action: saved ? { label: t('Undo'), run: () => void restoreVersion(saved.id, { backup: false }) } : undefined,
      });
    } catch {
      toast(t('Could not save a version in this browser, so nothing was changed. Use Export in Settings first.'), { tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const option = (value: 'empty' | 'sample', title: string, body: string) => (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-[2px] border px-3.5 py-3',
        mode === value ? 'border-accent/45 bg-accent-dim/40' : 'border-line hover:border-line-strong',
      )}
    >
      <input type="radio" name="fresh-mode" className="mt-1 accent-[var(--color-accent)]" checked={mode === value} onChange={() => setMode(value)} />
      <span>
        <span className="block text-[13.5px] text-ink">{title}</span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-ink-2">{body}</span>
      </span>
    </label>
  );

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title={t('Start fresh')}
      description={t('Begin a new atlas. Save the current one as a version first and you can come back to it at any time.')}
      width="max-w-[520px]"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            {t('Cancel')}
          </Button>
          <Button variant={save ? 'primary' : 'danger'} icon={RotateCcw} loading={busy} onClick={() => void go()}>
            {t('Start fresh')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="rounded-[2px] border border-line px-3.5 py-3">
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} className="accent-[var(--color-accent)]" />
            {t('Save the current atlas as a version first')}
          </label>
          {save ? (
            <input className="field mt-2.5" value={name} onChange={(e) => setName(e.target.value)} aria-label={t('Version name')} />
          ) : (
            <p className="mt-2 text-[12.5px] text-counter">{t('Without a saved version, the current atlas cannot be brought back.')}</p>
          )}
        </div>

        <div className="space-y-2" role="radiogroup" aria-label={t('Start with')}>
          <div className="label">{t('Start with')}</div>
          {option('empty', t('An empty atlas'), t('Just the ten areas of life, ready for your own notes and points.'))}
          {option('sample', t('The sample atlas'), t('Noa’s fictional example, to explore how everything works.'))}
        </div>

        {mode === 'empty' && (
          <div>
            <FieldLabel htmlFor="fresh-name" hint="optional">
              {t('Your name')}
            </FieldLabel>
            <input
              id="fresh-name"
              className="field"
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              placeholder={t('How the atlas addresses you')}
            />
          </div>
        )}
      </div>
    </Modal>
  );
}
