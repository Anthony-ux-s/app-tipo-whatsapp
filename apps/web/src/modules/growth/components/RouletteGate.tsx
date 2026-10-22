import { Check, Copy, Gift, PartyPopper, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@shared/ui/Button';
import { toast } from '@shared/stores/toast.store';
import { formatLongDate } from '@shared/utils/money';
import { useRoulette } from '../hooks/use-roulette.hook';
import { CampaignOverlay } from './CampaignOverlay';
import { Confetti } from './Confetti';
import { RouletteWheel } from './RouletteWheel';

/**
 * Ruleta de descuentos a pantalla completa: aparece al entrar a la app si a esta persona le toca una
 * (soporte decide cuál según el tipo de cliente). Gira con frenado suave, suelta confeti si ganó y deja
 * el cupón guardado en su cuenta para usarlo en el carrito.
 */
export function RouletteGate() {
  const r = useRoulette();
  const [copied, setCopied] = useState(false);
  const open = r.phase !== 'hidden' && !!r.roulette;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && r.phase !== 'spinning' && r.phase !== 'settling' && r.close();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, r]);

  if (!open || !r.roulette) return null;
  const { roulette } = r;
  if (roulette.kind !== 'roulette') return <CampaignOverlay campaign={roulette} play={r.play} onClose={r.close} onUse={r.useNow} />;
  const busy = r.phase === 'spinning' || r.phase === 'settling';
  const showResult = r.phase === 'result' && r.result;
  const won = !!r.result?.coupon;

  const copy = async () => {
    if (!r.result?.coupon) return;
    try {
      await navigator.clipboard.writeText(r.result.coupon.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast('No se pudo copiar. Igual quedó guardado en tu carrito.', 'info');
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={roulette.title} data-testid="roulette">
      <div className="absolute inset-0 animate-fade-in bg-[radial-gradient(ellipse_at_50%_30%,#0b6b52_0%,#04281f_70%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:repeating-conic-gradient(from_0deg_at_50%_38%,rgb(255_255_255/0.07)_0deg_6deg,transparent_6deg_18deg)]" />
      {showResult && won && <Confetti />}

      <div className="relative my-auto flex w-full max-w-md animate-pop flex-col items-center gap-5 py-6 text-center">
        {!busy && !showResult && (
          <button type="button" onClick={r.close} aria-label="Cerrar" className="absolute top-0 right-0 flex size-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white">
            <X className="size-5" />
          </button>
        )}

        <div className="flex flex-col items-center gap-1.5 px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-amber-200 uppercase ring-1 ring-white/15">
            <Sparkles className="size-3.5" /> Para ti
          </span>
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{roulette.title}</h2>
          {roulette.subtitle && <p className="text-sm text-teal-100/90">{roulette.subtitle}</p>}
        </div>

        <RouletteWheel
          prizes={roulette.prizes}
          rotation={r.rotation}
          spinMs={r.spinMs}
          spinning={busy}
          winnerIndex={showResult && r.result ? r.result.prizeIndex : null}
          onSettled={r.settled}
          className="w-[min(82vw,22rem)] sm:w-[24rem]"
        />

        {!showResult && (
          <Button size="lg" onClick={() => void r.spin()} loading={r.phase === 'spinning'} disabled={busy} className="min-w-52 shadow-[0_10px_30px_-8px_rgb(0_179_131/0.7)]" data-testid="roulette-spin">
            {busy ? 'Girando…' : '¡Girar ahora!'}
          </Button>
        )}

        {showResult && r.result && (
          <div className="flex w-full animate-rise flex-col items-center gap-3 rounded-3xl bg-surface p-5 text-ink shadow-pop" data-testid="roulette-result">
            {r.result.coupon ? (
              <>
                <span className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 [animation:prize-glow_1.6s_ease-out_2] dark:bg-teal-900/60 dark:text-teal-200">
                  <PartyPopper className="size-6" />
                </span>
                <div>
                  <p className="text-lg font-extrabold">¡Ganaste {r.result.label}!</p>
                  <p className="text-sm text-ink-soft">{r.result.coupon.description}</p>
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
                      {r.result.coupon.code}
                    </span>
                  </span>
                  {copied ? <Check className="size-5 text-teal-600" /> : <Copy className="size-5 text-ink-soft" />}
                </button>
                <p className="text-xs text-ink-faint">Vale hasta el {formatLongDate(r.result.coupon.endsAt)}. Ya está guardado en tu carrito.</p>
                <div className="flex w-full gap-2">
                  <Button variant="ghost" fullWidth onClick={r.close}>
                    Después
                  </Button>
                  <Button fullWidth icon={<Gift className="size-4" />} onClick={r.useNow} data-testid="roulette-use">
                    Usarlo ahora
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-lg font-extrabold">¡Uy, casi!</p>
                <p className="text-sm text-ink-soft">Esta vez no hubo premio. Vuelve en tu próxima visita y vuelve a intentarlo.</p>
                <Button fullWidth onClick={r.close}>
                  Seguir en Parla
                </Button>
              </>
            )}
          </div>
        )}

        {!busy && !showResult && (
          <button type="button" onClick={r.close} className="text-sm font-semibold text-teal-100/80 underline-offset-4 hover:text-white hover:underline">
            Ahora no
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
