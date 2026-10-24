import { useEffect, useState } from 'react';
import { PATTERN_MIN_DOTS, type LockKind } from '../utils/app-lock';
import { PatternPad } from './PatternPad';
import { PinPad } from './PinPad';

interface CodeEntryProps {
  kind: LockKind;
  /** Largo del PIN (en el patrón no se usa). */
  length: number;
  /** El código completo (PIN al llegar al largo; patrón al soltar el dedo con 4 puntos o más). */
  onSubmit: (code: string) => void;
  disabled?: boolean;
  /** Cambia cada vez que hay un error nuevo (hace temblar el teclado). */
  errorKey?: number;
  hint?: string;
}

/** Pide el código con el teclado que corresponde: PIN o patrón. */
export function CodeEntry({ kind, length, onSubmit, disabled = false, errorKey = 0, hint }: CodeEntryProps) {
  const [pin, setPin] = useState('');
  const [shaking, setShaking] = useState(false);
  const [short, setShort] = useState(false);

  useEffect(() => {
    if (errorKey === 0) return;
    setShaking(true);
    setPin('');
    const timer = setTimeout(() => setShaking(false), 450);
    return () => clearTimeout(timer);
  }, [errorKey]);

  return (
    <div className="flex flex-col items-center gap-4">
      {kind === 'pin' ? (
        <PinPad
          length={length}
          value={pin}
          onChange={setPin}
          onComplete={(code) => {
            onSubmit(code);
            // Se limpia para el siguiente intento (si acertó, esta pantalla desaparece).
            window.setTimeout(() => setPin(''), 150);
          }}
          disabled={disabled}
          error={shaking}
        />
      ) : (
        <PatternPad
          disabled={disabled}
          error={shaking}
          onComplete={(code) => {
            if (code.length < PATTERN_MIN_DOTS) {
              setShort(true);
              return;
            }
            setShort(false);
            onSubmit(code);
          }}
        />
      )}
      {short && <p className="text-sm font-medium text-rose-600 dark:text-rose-400">Une al menos {PATTERN_MIN_DOTS} puntos.</p>}
      {hint && <p className="max-w-xs text-center text-sm text-ink-soft">{hint}</p>}
    </div>
  );
}
