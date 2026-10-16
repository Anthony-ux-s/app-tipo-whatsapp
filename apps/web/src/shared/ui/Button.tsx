import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-brand text-white hover:bg-brand-strong shadow-float active:scale-[0.98] disabled:bg-teal-700/50',
  secondary:
    'bg-surface text-ink border border-line hover:bg-surface-2 active:scale-[0.98] disabled:opacity-60',
  ghost: 'text-ink-soft hover:bg-surface-3 hover:text-ink disabled:opacity-50',
  // Acción destructiva: dentro de la paleta corporativa, con contraste fuerte e ícono.
  danger: 'bg-teal-950 text-white hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-teal-900',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className = '',
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center rounded-[var(--radius-card)] font-semibold transition-all duration-200 ease-in-out disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
    </button>
  );
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

export function IconButton({ label, active = false, className = '', children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 ease-in-out disabled:opacity-40 ${active ? 'bg-teal-100 text-brand dark:bg-teal-900/50 dark:text-teal-300' : 'text-ink-soft hover:bg-surface-3 hover:text-ink'} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
