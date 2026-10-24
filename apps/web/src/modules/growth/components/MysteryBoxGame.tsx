import type { RouletteSpinResult } from '@parla/types';
import { useEffect, useState } from 'react';
import { PrizeResultCard } from './PrizeResultCard';
import type { GameProps } from './ScratchGame';

const BOXES = [
  { body: 'from-rose-400 to-rose-600', lid: 'from-rose-300 to-rose-500', ribbon: 'bg-amber-300' },
  { body: 'from-teal-400 to-teal-600', lid: 'from-teal-300 to-teal-500', ribbon: 'bg-amber-300' },
  { body: 'from-violet-400 to-violet-600', lid: 'from-violet-300 to-violet-500', ribbon: 'bg-amber-300' },
];

function Box({ index, state, label, won, onPick }: { index: number; state: 'idle' | 'chosen' | 'opened' | 'other'; label?: string; won: boolean; onPick: () => void }) {
  const c = BOXES[index];
  const opened = state === 'opened';
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={state !== 'idle'}
      aria-label={`Cofre ${index + 1}`}
      data-testid={`box-${index}`}
      className={`relative flex w-24 flex-col items-center pt-14 outline-none transition-all duration-500 sm:w-28 ${state === 'other' ? 'scale-90 opacity-40' : ''} ${state === 'idle' ? 'cursor-pointer hover:-translate-y-1' : ''}`}
    >
      <span
        className={`roulette-motion flex w-full flex-col items-center ${state === 'idle' ? 'animate-[stk-float_2.4s_ease-in-out_infinite]' : state === 'chosen' ? 'animate-[stk-shake_0.35s_ease-in-out_infinite]' : ''}`}
        style={{ animationDelay: `${index * 0.35}s` }}
      >
        {/* Premio que sale del cofre. */}
        <span
          className={`absolute top-0 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-sm font-extrabold shadow-lg transition-all duration-700 ${opened ? '-translate-y-2 scale-110 opacity-100' : 'translate-y-8 scale-50 opacity-0'} ${won ? 'bg-amber-300 text-ink' : 'bg-white text-ink-soft'}`}
        >
          {label}
        </span>
        {/* Tapa. */}
        <span className={`relative z-[5] h-7 w-[108%] rounded-lg bg-gradient-to-b ${c.lid} shadow-md transition-all duration-700 ${opened ? '-translate-y-7 -rotate-[14deg]' : ''}`}>
          <span className={`absolute inset-y-0 left-1/2 w-4 -translate-x-1/2 ${c.ribbon}`} />
          <span className={`absolute -top-3 left-1/2 size-6 -translate-x-1/2 rounded-full ${c.ribbon} ring-2 ring-white/40`} />
        </span>
        {/* Cuerpo. */}
        <span className={`relative -mt-0.5 h-20 w-full rounded-b-xl bg-gradient-to-b ${c.body} shadow-xl`}>
          <span className={`absolute inset-y-0 left-1/2 w-4 -translate-x-1/2 ${c.ribbon}`} />
          <span className="absolute inset-x-0 top-0 h-3 bg-black/15" />
        </span>
      </span>
    </button>
  );
}

/**
 * «Cofre sorpresa»: tres cofres y se elige uno. Al tocarlo se pide el premio, la tapa salta y sale el
 * premio; los otros dos se apagan. El resultado es el mismo que en cualquier otra estrategia.
 */
export function MysteryBoxGame({ play, preview, onClose, onUse, onSettled }: GameProps) {
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<RouletteSpinResult | null>(null);
  const [showCard, setShowCard] = useState(false);

  const pick = (i: number) => {
    setPicked(i);
    // El cofre tiembla un momento antes de abrirse, aunque la respuesta llegue rápido.
    const shaking = new Promise((resolve) => window.setTimeout(resolve, 900));
    Promise.all([play(), shaking])
      .then(([won]) => setResult(won))
      .catch(() => onClose());
  };

  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => {
      setShowCard(true);
      onSettled?.(!!result.coupon);
    }, 1400);
    return () => window.clearTimeout(t);
  }, [result, onSettled]);

  return (
    <div className="flex w-full flex-col items-center gap-5">
      <div className="flex items-end justify-center gap-3 sm:gap-5" data-testid="boxes">
        {BOXES.map((_, i) => (
          <Box
            key={i}
            index={i}
            state={picked === null ? 'idle' : picked !== i ? 'other' : result ? 'opened' : 'chosen'}
            label={picked === i && result ? (result.coupon ? result.label : 'Vacío') : undefined}
            won={!!result?.coupon}
            onPick={() => pick(i)}
          />
        ))}
      </div>
      {picked === null && <p className="text-sm font-semibold text-teal-100/90">Toca el cofre que quieras abrir</p>}
      {picked !== null && !showCard && <p className="animate-pulse text-sm font-semibold text-teal-100/90">{result ? '¡Mira lo que salió!' : 'Abriendo…'}</p>}
      {showCard && result && <PrizeResultCard result={result} preview={preview} onClose={onClose} onUse={onUse} />}
    </div>
  );
}
