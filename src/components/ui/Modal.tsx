import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

/**
 * Accessible modal dialog: focus moves in on open and returns on close, Escape
 * closes, Tab is trapped. Renders as a bottom sheet on small screens.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 'max-w-[640px]',
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
  initialFocus?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const restore = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    restore.current = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const target =
      (initialFocus && el?.querySelector<HTMLElement>(initialFocus)) || el?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    requestAnimationFrame(() => target?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && el) {
        const focusables = [
          ...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'),
        ].filter((x) => x.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      restore.current?.focus?.();
    };
  }, [open, onClose, initialFocus]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-start sm:pt-[10vh]" role="presentation">
      <div className="absolute inset-0 animate-fade-in bg-[#040506]/80 backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'ticks relative flex max-h-[92dvh] w-full animate-slide-in-up flex-col overflow-hidden rounded-t-[2px] border border-line-strong bg-surface shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] sm:max-h-[80vh] sm:animate-rise sm:rounded-[2px]',
          width,
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 pt-5 pb-4">
          <div className="min-w-0">
            <h2 className="display text-[26px] text-ink">{title}</h2>
            {description && <p className="mt-1.5 max-w-[60ch] text-[12.5px] leading-relaxed text-ink-2">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} data-close size="sm" />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}
