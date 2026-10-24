import { useEffect, useRef } from 'react';

interface CodeInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Se llama al completar las 6 cifras. */
  onComplete?: (code: string) => void;
  disabled?: boolean;
  label?: string;
}

/**
 * Campo del código de verificación: una sola caja, solo números, con autocompletado del SMS
 * (iOS y Android lo ofrecen sobre el teclado gracias a autocomplete="one-time-code").
 */
export function CodeInput({ value, onChange, onComplete, disabled = false, label = 'Código de verificación' }: CodeInputProps) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);

  return (
    <input
      ref={ref}
      aria-label={label}
      value={value}
      disabled={disabled}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      placeholder="••••••"
      onChange={(e) => {
        const code = e.target.value.replace(/\D/g, '').slice(0, 6);
        onChange(code);
        if (code.length === 6) onComplete?.(code);
      }}
      className="h-16 w-full rounded-[var(--radius-card)] border border-line bg-surface text-center font-mono text-3xl font-bold tracking-[0.5em] text-ink outline-none transition-all duration-200 placeholder:text-ink-faint/60 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30 disabled:opacity-60"
    />
  );
}
