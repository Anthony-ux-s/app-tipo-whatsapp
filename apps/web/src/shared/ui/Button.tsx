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

/**
 * Botones grandes, redondeados y con color (fáciles de ver y de tocar, para cualquier edad): el
 * principal en verde con sombra, el de peligro en rojo; al tocarlos se «hunden» un poco.
 */
const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-teal-400 to-brand text-white shadow-[0_4px_0_0_var(--color-brand-strong)] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_var(--color-brand-strong)] disabled:from-teal-300 disabled:to-teal-300 disabled:shadow-none dark:disabled:from-teal-800 dark:disabled:to-teal-800',
  secondary:
    'bg-surface text-ink border-2 border-line hover:border-teal-300 hover:bg-surface-2 active:scale-[0.98] disabled:opacity-60',
  ghost: 'text-ink-soft hover:bg-surface-3 hover:text-ink disabled:opacity-50',
  // Acción destructiva (cancelar, eliminar): roja, se entiende sin leer.
  danger:
    'bg-gradient-to-b from-rose-500 to-rose-600 text-white shadow-[0_4px_0_0_#9f1239] hover:brightness-105 active:translate-y-0.5 active:shadow-[0_2px_0_0_#9f1239] disabled:opacity-60',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-12 px-5 text-[15px] gap-2',
  lg: 'h-14 px-6 text-lg gap-2.5',
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
      className={`inline-flex items-center justify-center rounded-2xl font-bold transition-all duration-150 ease-in-out disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
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
