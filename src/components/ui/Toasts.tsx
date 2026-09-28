import { X } from 'lucide-react';
import { useUI } from '../../state/uiStore';
import { cn } from '../../lib/cn';

export function Toasts() {
  const toasts = useUI((s) => s.toasts);
  const dismiss = useUI((s) => s.dismissToast);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+72px)] z-[60] flex flex-col items-center gap-2 px-4 md:bottom-5" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'pointer-events-auto flex max-w-[520px] animate-rise items-center gap-3 rounded-[8px] border bg-overlay py-2 pr-2 pl-3.5 text-[13px] text-ink shadow-xl',
            t.tone === 'warning' ? 'border-counter/40' : t.tone === 'success' ? 'border-support/30' : 'border-line-strong',
          )}
        >
          <span className="min-w-0">{t.message}</span>
          {t.action && (
            <button
              type="button"
              className="shrink-0 rounded-[5px] px-2 py-1 text-[12px] font-medium text-accent hover:bg-accent-dim"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" className="shrink-0 rounded p-1 text-ink-3 hover:text-ink" onClick={() => dismiss(t.id)}>
            <X size={13} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
}
