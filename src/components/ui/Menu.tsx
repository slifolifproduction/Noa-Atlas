import { Check, ChevronDown, type LucideIcon } from 'lucide-react';
import { createContext, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Kbd } from './primitives';

const CloseContext = createContext<() => void>(() => {});

/**
 * A button that opens a short list of actions. Used to gather tools that
 * belong together behind one name, so toolbars stay short.
 */
export function Menu({
  label,
  icon: Icon,
  iconOnly,
  chevron = !iconOnly,
  align = 'end',
  width = 'w-60',
  className,
  panelClassName,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  /** Show only the icon; the label becomes its tooltip. */
  iconOnly?: boolean;
  chevron?: boolean;
  align?: 'start' | 'end';
  width?: string;
  className?: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const id = useId();

  const items = () => [...(panel.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? [])];
  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    items()[0]?.focus();
    const outside = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      setOpen(false);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      const list = items();
      if (!list.length) return;
      const at = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? list.length - 1 : (at + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
      list[next].focus();
    }
  };

  return (
    <div ref={wrap} className="relative" onKeyDown={open ? onKeyDown : undefined}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-label={iconOnly ? label : undefined}
        title={iconOnly ? label : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (!open && e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={cn(
          'inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[7px] border text-[12.5px] transition-colors',
          iconOnly ? 'w-8' : 'px-2.5',
          open ? 'border-line-strong bg-raised text-ink' : 'border-line bg-surface/95 text-ink-2 hover:border-line-strong hover:text-ink',
          className,
        )}
      >
        {Icon && <Icon size={14} strokeWidth={1.8} aria-hidden />}
        {!iconOnly && <span className="font-medium">{label}</span>}
        {chevron && <ChevronDown size={12} className={cn('-mr-0.5 text-ink-3 transition-transform', open && 'rotate-180')} aria-hidden />}
      </button>
      {open && (
        <div
          ref={panel}
          id={id}
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-full z-40 mt-1 animate-rise rounded-[9px] border border-line-strong bg-overlay p-1 shadow-2xl',
            align === 'end' ? 'right-0' : 'left-0',
            width,
            panelClassName,
          )}
        >
          <CloseContext.Provider value={() => close()}>{children}</CloseContext.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon: Icon,
  children,
  hint,
  kbd,
  checked,
  radio,
  href,
  keepOpen,
  disabled,
  onSelect,
}: {
  icon?: LucideIcon;
  children: ReactNode;
  /** A second, quieter line. */
  hint?: ReactNode;
  kbd?: string;
  /** Makes the item a checkbox (or a radio with `radio`). */
  checked?: boolean;
  radio?: boolean;
  href?: string;
  keepOpen?: boolean;
  disabled?: boolean;
  onSelect?(): void;
}) {
  const close = useContext(CloseContext);
  const role = checked === undefined ? 'menuitem' : radio ? 'menuitemradio' : 'menuitemcheckbox';
  const body = (
    <>
      <span className="mt-px flex w-4 shrink-0 justify-center text-ink-3">
        {checked !== undefined ? checked && <Check size={14} className="text-accent" aria-hidden /> : Icon && <Icon size={14} strokeWidth={1.8} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-ink">{children}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-3">{hint}</span>}
      </span>
      {kbd && <Kbd className="mt-px">{kbd}</Kbd>}
    </>
  );
  const cls = cn(
    'flex w-full items-start gap-2.5 rounded-[6px] px-2.5 py-[7px] text-left outline-none hover:bg-white/[0.05] focus-visible:bg-white/[0.07] disabled:opacity-40',
  );
  if (href) {
    return (
      <a role={role} href={href} tabIndex={-1} className={cls} onClick={close}>
        {body}
      </a>
    );
  }
  return (
    <button
      type="button"
      role={role}
      aria-checked={checked}
      tabIndex={-1}
      disabled={disabled}
      className={cls}
      onClick={() => {
        onSelect?.();
        if (!keepOpen) close();
      }}
    >
      {body}
    </button>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <div className="label px-2.5 pt-2 pb-1">{children}</div>;
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-line" />;
}
