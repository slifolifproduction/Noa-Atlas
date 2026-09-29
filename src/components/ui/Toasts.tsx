import { X } from 'lucide-react';
import { useUI } from '../../state/uiStore';
import { cn } from '../../lib/cn';
import { t } from '../../i18n';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-5"
      role="status"
      aria-live="polite"
    >
      {toasts.map((item) => (
        <div
          key={item.id}
          className={cn(
            'pointer-events-auto relative flex max-w-[520px] animate-rise items-center gap-3 overflow-hidden rounded-[2px] border border-line-strong bg-overlay py-2 pr-2 pl-4 text-[13px] text-ink shadow-[0_20px_60px_-24px_rgb(0_0_0/0.9)]',
          )}
        >
          <span
            className={cn('absolute inset-y-0 left-0 w-[2px]', item.tone === 'warning' ? 'bg-counter' : item.tone === 'success' ? 'bg-support' : 'bg-accent')}
            aria-hidden
          />
          <span className="min-w-0">{item.message}</span>
          {item.action && (
            <button
              type="button"
              className="shrink-0 rounded-[2px] px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent-dim"
              onClick={() => {
                item.action!.run();
                dismiss(item.id);
              }}
            >
              {item.action.label}
            </button>
          )}
          <button type="button" aria-label={t('Dismiss')} className="shrink-0 rounded-[2px] p-1 text-ink-3 hover:text-ink" onClick={() => dismiss(item.id)}>
            <X size={13} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
