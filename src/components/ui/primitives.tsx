import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('label', className)}>{children}</div>;
}

/** A titled block separated by a hairline, not a card. */
export function Section({
  title,
  aside,
  children,
  className,
  id,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section className={cn('border-t border-line pt-3', className)} aria-labelledby={id}>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3">
        <h3 id={id} className="label">
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[2px] border border-line-strong bg-raised px-1 text-[10.5px] text-ink-2',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Dot({ color, className, hollow }: { color: string; className?: string; hollow?: boolean }) {
  return (
    <span
      className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)}
      style={hollow ? { border: `1.5px solid ${color}` } : { background: color }}
      aria-hidden
    />
  );
}

export function Chip({
  children,
  color,
  icon: Icon,
  onClick,
  active,
  className,
  title,
}: {
  children: ReactNode;
  color?: string;
  icon?: LucideIcon;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  title?: string;
}) {
  const inner = (
    <>
      {Icon ? <Icon size={12} strokeWidth={1.9} color={color} aria-hidden /> : color ? <Dot color={color} className="h-1.5 w-1.5" /> : null}
      <span className="truncate">{children}</span>
    </>
  );
  const cls = cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-[2px] border px-1.5 py-[2px] text-[12px] leading-[18px] transition-colors',
    active ? 'border-accent/45 bg-accent-dim text-ink' : 'border-line bg-ink/[0.025] text-ink-2',
    onClick && 'hover:border-line-strong hover:text-ink',
    className,
  );
  return onClick ? (
    <button type="button" className={cls} onClick={onClick} title={title} aria-pressed={active}>
      {inner}
    </button>
  ) : (
    <span className={cls} title={title}>
      {inner}
    </span>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-start gap-2 rounded-[2px] border border-dashed border-line-strong px-4 py-5', className)}>
      {Icon && <Icon size={18} strokeWidth={1.5} className="text-ink-3" aria-hidden />}
      <div className="display text-[21px] text-ink">{title}</div>
      {children && <div className="max-w-prose text-[12.5px] leading-relaxed text-ink-2">{children}</div>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/** Segmented control for 2–4 exclusive options. */
export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
  size = 'md',
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[2px] border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[2px] px-2 font-medium transition-colors',
            size === 'sm' ? 'h-6 text-[11.5px]' : 'h-7 text-[12px]',
            o.value === value ? 'bg-ink text-canvas' : 'text-ink-3 hover:text-ink-2',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function FieldLabel({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 flex items-baseline justify-between gap-2">
      <span className="label">{children}</span>
      {hint && <span className="text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function Progress({ value, className, color = 'var(--color-ink-2)' }: { value: number; className?: string; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div
      className={cn('h-[2px] w-full overflow-hidden bg-ink/[0.09]', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="h-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

/** A pressable chip for multi-select filters and tags. */
export function ToggleChip({
  on,
  onClick,
  children,
  className,
  title,
}: {
  on: boolean;
  onClick(): void;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[2px] border px-2 py-0.5 text-[12px] transition-colors',
        on ? 'border-accent/45 bg-accent-dim text-ink' : 'border-line text-ink-3 hover:border-line-strong hover:text-ink-2',
        className,
      )}
    >
      {children}
    </button>
  );
}
