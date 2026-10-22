import type { RouletteSpinResult } from '@parla/types';
import { Check, Copy, Gift, PartyPopper } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@shared/ui/Button';
import { toast } from '@shared/stores/toast.store';
import { formatLongDate } from '@shared/utils/money';

/** El resultado de cualquier juego: el cupón ganado (con su código para copiar) o un «casi». */
export function PrizeResultCard({ result, preview = false, onClose, onUse }: { result: RouletteSpinResult; preview?: boolean; onClose: () => void; onUse?: () => void }) {
  const [copied, setCopied] = useState(false);
  const coupon = result.coupon;

  const copy = async () => {
    if (!coupon) return;
    try {
      await navigator.clipboard.writeText(coupon.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('No se pudo copiar. Igual quedó guardado en tu carrito.', 'info');
    }
  };

  return (
    <div className="flex w-full animate-rise flex-col items-center gap-3 rounded-3xl bg-surface p-5 text-ink shadow-pop" data-testid="roulette-result">
      {coupon ? (
        <>
          <span className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 [animation:prize-glow_1.6s_ease-out_2] dark:bg-teal-900/60 dark:text-teal-200">
            <PartyPopper className="size-6" />
          </span>
          <div>
            <p className="text-lg font-extrabold">¡Ganaste {result.label}!</p>
            <p className="text-sm text-ink-soft">{coupon.description}</p>
          </div>
          <button
            type="button"
            onClick={() => void copy()}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-teal-400 bg-teal-50 px-4 py-3 text-left transition-colors hover:bg-teal-100 dark:bg-teal-950/50 dark:hover:bg-teal-900/50"
            aria-label="Copiar el código del cupón"
          >
            <span>
              <span className="block text-[11px] font-bold tracking-wide text-ink-soft uppercase">Tu cupón</span>
              <span className="block font-mono text-xl font-extrabold tracking-widest text-brand dark:text-teal-300" data-testid="roulette-code">
                {coupon.code}
              </span>
            </span>
            {copied ? <Check className="size-5 text-teal-600" /> : <Copy className="size-5 text-ink-soft" />}
          </button>
          <p className="text-xs text-ink-faint">{preview ? 'Así se verá el cupón del cliente.' : `Vale hasta el ${formatLongDate(coupon.endsAt)}. Ya está guardado en tu carrito.`}</p>
          <div className="flex w-full gap-2">
            <Button variant="ghost" fullWidth onClick={onClose}>
              {preview ? 'Cerrar' : 'Después'}
            </Button>
            {onUse && (
              <Button fullWidth icon={<Gift className="size-4" />} onClick={onUse} data-testid="roulette-use">
                Usarlo ahora
              </Button>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="text-lg font-extrabold">¡Uy, casi!</p>
          <p className="text-sm text-ink-soft">Esta vez no hubo premio. Vuelve en tu próxima visita y vuelve a intentarlo.</p>
          <Button fullWidth onClick={onClose}>
            {preview ? 'Cerrar' : 'Seguir en Parla'}
          </Button>
        </>
      )}
    </div>
  );
}
