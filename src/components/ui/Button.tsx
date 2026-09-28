import { LoaderCircle, type LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  kbd?: string;
  children?: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink text-canvas hover:bg-white border-transparent',
  secondary: 'bg-raised text-ink border-line hover:border-line-strong hover:bg-overlay',
  ghost: 'bg-transparent text-ink-2 border-transparent hover:text-ink hover:bg-white/[0.045]',
  danger: 'bg-transparent text-danger border-danger/30 hover:bg-danger/10',
};

const SIZES: Record<Size, string> = {
  sm: 'h-7 px-2.5 text-[12px] gap-1.5',
  md: 'h-8 px-3 text-[13px] gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, loading, kbd, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled || loading}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-[6px] border font-medium transition-colors disabled:opacity-45',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <LoaderCircle size={size === 'sm' ? 13 : 14} className="animate-spin" aria-hidden /> : Icon && <Icon size={size === 'sm' ? 13 : 14} strokeWidth={1.8} aria-hidden />}
      {children}
      {kbd && <kbd className="num ml-0.5 text-[10.5px] font-normal opacity-60">{kbd}</kbd>}
    </button>
  );
});

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  size?: 'sm' | 'md';
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon: Icon, label, active, size = 'md', className, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[6px] border transition-colors disabled:opacity-40',
        size === 'sm' ? 'h-7 w-7' : 'h-8 w-8',
        active ? 'border-accent/40 bg-accent-dim text-accent' : 'border-transparent text-ink-2 hover:bg-white/[0.05] hover:text-ink',
        className,
      )}
      {...rest}
    >
      <Icon size={size === 'sm' ? 14 : 15} strokeWidth={1.7} aria-hidden />
    </button>
  );
});
