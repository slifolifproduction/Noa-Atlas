import { CircleHelp, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { useUI } from '../../state/uiStore';
import { Button } from './Button';
import { t } from '../../i18n';
import { PAGE_HELP } from '../../domain/help';

export const pageHelp = (page: string): ReactNode[] | undefined => PAGE_HELP[page]?.();

/** A page's "how this works" note, folded into a small link until asked for. */
export function HowItWorks({ page, className }: { page: string; className?: string }) {
  const setSeen = useUI((s) => s.setTipSeen);
  // Pages should explain themselves; the note waits behind a small link until asked for.
  const [open, setOpen] = useState(false);
  const items = pageHelp(page);
  if (!items) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={cn('inline-flex items-center gap-1.5 text-[12px] text-ink-3 hover:text-ink-2', className)}>
        <CircleHelp size={13} aria-hidden />
        {t('How this page works')}
      </button>
    );
  }
  return (
    <HelpCard
      className={className}
      items={items}
      onDone={() => {
        setOpen(false);
        setSeen(page, true);
      }}
    />
  );
}

export function HelpCard({ items, onDone, className, floating }: { items: ReactNode[]; onDone(): void; className?: string; floating?: boolean }) {
  return (
    <section
      className={cn('rounded-[2px] border border-line-strong px-4 py-3', floating ? 'bg-overlay/95 shadow-2xl backdrop-blur-md' : 'bg-surface', className)}
      aria-label={t('How this page works')}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="label flex items-center gap-1.5 text-ink-2!">
          <CircleHelp size={12} aria-hidden /> {t('How this page works')}
        </span>
        {floating && (
          <button type="button" onClick={onDone} className="rounded-[2px] p-0.5 text-ink-3 hover:text-ink" aria-label={t('Close')}>
            <X size={14} aria-hidden />
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5 text-[12.5px] leading-snug text-ink-2">
            <span className="num mt-px w-3 shrink-0 text-[11px] text-ink-3">{i + 1}</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
      <Button size="sm" className="mt-3" onClick={onDone}>
        {t('Got it')}
      </Button>
    </section>
  );
}

/** For the graph pages: a toolbar button with the same note in a floating card. */
export function useGraphHelp(page: string) {
  const setSeen = useUI((s) => s.setTipSeen);
  const [open, setOpen] = useState(false);
  const shown = open;
  return {
    shown,
    toggle: () => (shown ? close() : setOpen(true)),
    close,
  };
  function close() {
    setOpen(false);
    setSeen(page, true);
  }
}
