import { ChevronRight } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { t } from '../../i18n';

/**
 * How much the interface shows. Simple (the default) is for someone finding their way: what most people do not need
 * at first is folded behind one "More detail", never removed. Full detail shows everything as it is.
 */
export const useSimple = () => useUI((s) => s.detail === 'simple');

/** Shown only with full detail (in simple view it is left out: something reachable elsewhere, or a technical aside). */
export function FullOnly({ children }: { children: ReactNode }) {
  return useSimple() ? null : <>{children}</>;
}

/**
 * In simple view, its contents wait behind one quiet "More detail" row; with full detail they are shown as they are.
 * `inset` matches the inspector panel's padding.
 */
export function MoreDetail({ children, label, inset = true, className }: { children: ReactNode; label?: string; inset?: boolean; className?: string }) {
  const simple = useSimple();
  const [open, setOpen] = useState(false);
  if (!simple) return <>{children}</>;
  return (
    <section className={cn('border-t border-line', className)}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center gap-2 py-2.5 text-left text-[12.5px] text-ink-3 hover:bg-ink/[0.025] hover:text-ink-2',
          inset ? 'px-4' : 'px-0',
        )}
      >
        <ChevronRight size={13} className={cn('shrink-0 transition-transform', open && 'rotate-90')} aria-hidden />
        {label ?? t('More detail')}
      </button>
      {open && children}
    </section>
  );
}
