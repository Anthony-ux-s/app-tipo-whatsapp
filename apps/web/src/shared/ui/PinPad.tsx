import { Delete } from 'lucide-react';
import { useEffect } from 'react';

interface PinPadProps {
  length: number;
  value: string;
  onChange: (value: string) => void;
  /** Se llama al completar los dígitos. */
  onComplete: (value: string) => void;
  disabled?: boolean;
  error?: boolean;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/** Teclado numérico para el PIN: puntos arriba, números abajo; también responde al teclado del computador. */
export function PinPad({ length, value, onChange, onComplete, disabled = false, error = false }: PinPadProps) {
  const press = (digit: string) => {
    if (disabled || value.length >= length) return;
    const next = value + digit;
    onChange(next);
    if (next.length === length) onComplete(next);
  };
  const erase = () => !disabled && onChange(value.slice(0, -1));

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') erase();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="flex flex-col items-center gap-6" data-testid="pin-pad">
      <div className={`flex gap-3 ${error ? 'animate-shake' : ''}`} role="img" aria-label={`${value.length} de ${length} dígitos`}>
        {Array.from({ length }, (_, i) => (
          <span key={i} className={`size-3.5 rounded-full border-2 transition-colors duration-150 ${i < value.length ? (error ? 'border-rose-600 bg-rose-600' : 'border-brand bg-brand') : 'border-ink-faint'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {KEYS.map((k) => (
          <Key key={k} label={k} onPress={() => press(k)} disabled={disabled} />
        ))}
        <span />
        <Key label="0" onPress={() => press('0')} disabled={disabled} />
        <button
          type="button"
          onClick={erase}
          disabled={disabled || value.length === 0}
          aria-label="Borrar"
          className="flex size-16 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-3 disabled:opacity-30"
        >
          <Delete className="size-6" />
        </button>
      </div>
    </div>
  );
}

function Key({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      className="flex size-16 items-center justify-center rounded-full bg-surface-3 text-2xl font-semibold text-ink transition-colors hover:bg-surface-2 active:scale-95 disabled:opacity-40"
    >
      {label}
    </button>
  );
}
