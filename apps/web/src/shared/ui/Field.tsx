import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string | null;
  icon?: ReactNode;
  trailing?: ReactNode;
}

const inputBase =
  'w-full rounded-[var(--radius-card)] border bg-surface px-3.5 text-[15px] text-ink placeholder:text-ink-faint transition-all duration-200 ease-in-out outline-none focus:border-teal-500 focus:ring-4 focus:ring-teal-500/15';

export function Field({ label, hint, error, icon, trailing, id, className = '', ...rest }: FieldProps) {
  const fieldId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={fieldId} className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <span className="relative flex items-center">
        {icon && <span className="pointer-events-none absolute left-3.5 text-ink-faint">{icon}</span>}
        <input
          id={fieldId}
          aria-invalid={Boolean(error)}
          className={`${inputBase} h-12 ${icon ? 'pl-11' : ''} ${trailing ? 'pr-12' : ''} ${error ? 'border-teal-900 dark:border-teal-300' : 'border-line'}`}
          {...rest}
        />
        {trailing && <span className="absolute right-1.5">{trailing}</span>}
      </span>
      {error ? <FieldError message={error} /> : hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </label>
  );
}

interface TextAreaFieldProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

export function TextAreaField({ label, id, className = '', ...rest }: TextAreaFieldProps) {
  const fieldId = id ?? `f-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label htmlFor={fieldId} className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-ink">{label}</span>
      <textarea id={fieldId} rows={3} className={`${inputBase} resize-none border-line py-3`} {...rest} />
    </label>
  );
}

/** Mensaje de error de formulario: ícono + texto oscuro (sin colores fuera de la paleta). */
export function FieldError({ message }: { message: string }) {
  return (
    <span role="alert" className="flex items-center gap-1.5 text-xs font-medium text-teal-900 dark:text-teal-200">
      <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M8 4.5v4M8 11v.5" stroke="var(--surface)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      {message}
    </span>
  );
}
