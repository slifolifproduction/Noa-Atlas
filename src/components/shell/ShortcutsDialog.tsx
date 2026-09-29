import { SHORTCUTS } from '../../app/useGlobalShortcuts';
import { useUI } from '../../state/uiStore';
import { Modal } from '../ui/Modal';
import { Kbd } from '../ui/primitives';
import { t } from '../../i18n';

export function ShortcutsDialog() {
  const open = useUI((s) => s.shortcutsOpen);
  const setOpen = useUI((s) => s.setShortcutsOpen);
  return (
    <Modal open={open} onClose={() => setOpen(false)} title={t('Keyboard shortcuts')} width="max-w-[440px]">
      <ul className="divide-y divide-line">
        {SHORTCUTS.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-4 py-2">
            <span className="text-[13px] text-ink-2">{s.label}</span>
            <span className="flex shrink-0 items-center gap-1">
              {s.keys.map((k) =>
                k === '–' ? (
                  <span key={k} className="text-ink-3">
                    –
                  </span>
                ) : (
                  <Kbd key={k}>{k}</Kbd>
                ),
              )}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
