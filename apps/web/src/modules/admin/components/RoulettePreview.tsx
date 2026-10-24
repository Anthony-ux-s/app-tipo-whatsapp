import type { RouletteCampaignInput, RouletteSpinResult } from '@parla/types';
import { Eye, PartyPopper, RotateCcw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@shared/ui/Button';
import { Confetti } from '../../growth/components/Confetti';
import { CampaignOverlay } from '../../growth/components/CampaignOverlay';
import { RouletteWheel } from '../../growth/components/RouletteWheel';
import { landingRotation } from '../../growth/utils/roulette.utils';

const SPIN_MS = 5200;

type Phase = 'ready' | 'spinning' | 'result';

/**
 * Vista previa a pantalla completa: la misma ruleta que ve el cliente al abrir la app, con giro, confeti
 * y resultado. El giro es local (azar con los pesos de la ruleta): no guarda nada ni crea cupones.
 */
/** Juega en local, con los pesos de la campaña: devuelve un resultado como el del servidor, con un cupón de mentira. */
function localPlay(prizes: RouletteCampaignInput['prizes']): Promise<RouletteSpinResult> {
  const total = prizes.reduce((sum, p) => sum + p.weight, 0);
  let roll = Math.random() * total;
  let index = prizes.length - 1;
  for (const [i, p] of prizes.entries()) {
    if (roll < p.weight) {
      index = i;
      break;
    }
    roll -= p.weight;
  }
  const p = prizes[index];
  const won = p.kind !== 'none';
  const coupon = won ? { code: 'RULPRUEBA', description: p.label, endsAt: new Date(Date.now() + p.validDays * 86_400_000).toISOString(), kind: p.kind as 'percent' } : null;
  return new Promise((resolve) => window.setTimeout(() => resolve({ prizeId: p.id, prizeIndex: index, label: p.label, coupon }), 250));
}

export function RoulettePreview({ roulette, onClose }: { roulette: Pick<RouletteCampaignInput, 'kind' | 'title' | 'subtitle' | 'prizes' | 'endsAt'>; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [rotation, setRotation] = useState(0);
  const [index, setIndex] = useState<number | null>(null);
  const [round, setRound] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const spin = () => {
    const total = roulette.prizes.reduce((sum, p) => sum + p.weight, 0);
    let roll = Math.random() * total;
    let won = roulette.prizes.length - 1;
    for (const [i, p] of roulette.prizes.entries()) {
      if (roll < p.weight) {
        won = i;
        break;
      }
      roll -= p.weight;
    }
    setIndex(null);
    setPhase('spinning');
    setRotation((r) => landingRotation(r, won, roulette.prizes.length, 6, (Math.random() - 0.5) * 0.6));
    window.setTimeout(() => {
      setIndex(won);
      setPhase('result');
      setRound((n) => n + 1);
    }, SPIN_MS + 150);
  };

  if (roulette.kind !== 'roulette') return <CampaignOverlay campaign={roulette} play={() => localPlay(roulette.prizes)} preview onClose={onClose} />;

  const prize = index !== null ? roulette.prizes[index] : null;
  const won = !!prize && prize.kind !== 'none';

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label="Vista previa de la ruleta" data-testid="roulette-preview">
      <div className="absolute inset-0 animate-fade-in bg-[radial-gradient(ellipse_at_50%_30%,#0b6b52_0%,#04281f_70%)]" />
      {phase === 'result' && won && <Confetti key={round} />}

      <div className="relative my-auto flex w-full max-w-md animate-pop flex-col items-center gap-4 py-6 text-center">
        <div className="flex w-full items-center justify-between gap-2 rounded-full bg-amber-300/95 px-4 py-1.5 text-xs font-bold text-ink">
          <span className="flex items-center gap-1.5">
            <Eye className="size-4" /> Vista previa: así la ve el cliente. No se guarda nada.
          </span>
          <button type="button" onClick={onClose} aria-label="Cerrar la vista previa" className="flex size-7 items-center justify-center rounded-full hover:bg-amber-400" data-testid="close-preview">
            <X className="size-4" />
          </button>
        </div>

        <div className="flex flex-col items-center gap-1 px-6">
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{roulette.title}</h2>
          {roulette.subtitle && <p className="text-sm text-teal-100/90">{roulette.subtitle}</p>}
        </div>

        <RouletteWheel
          prizes={roulette.prizes.map((p) => ({ id: p.id, label: p.label, kind: p.kind }))}
          rotation={rotation}
          spinMs={SPIN_MS}
          spinning={phase === 'spinning'}
          winnerIndex={phase === 'result' ? index : null}
          className="w-[min(78vw,21rem)] sm:w-[22rem]"
        />

        {phase !== 'result' ? (
          <Button size="lg" onClick={spin} disabled={phase === 'spinning'} className="min-w-52" data-testid="preview-spin">
            {phase === 'spinning' ? 'Girando…' : '¡Girar ahora!'}
          </Button>
        ) : (
          prize && (
            <div className="flex w-full animate-rise flex-col items-center gap-3 rounded-3xl bg-surface p-5 text-ink shadow-pop" data-testid="preview-result">
              {won ? (
                <>
                  <span className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-ink">
                    <PartyPopper className="size-6" />
                  </span>
                  <p className="text-lg font-extrabold">¡Ganaste {prize.label}!</p>
                  <p className="rounded-xl border-2 border-dashed border-teal-400 bg-teal-50 px-4 py-2 font-mono text-lg font-extrabold tracking-widest text-brand dark:bg-teal-950/50 dark:text-teal-300">RULPRUEBA</p>
                </>
              ) : (
                <>
                  <p className="text-lg font-extrabold">¡Uy, casi!</p>
                  <p className="text-sm text-ink-soft">Esta vez no hubo premio.</p>
                </>
              )}
              <div className="flex w-full gap-2">
                <Button variant="ghost" fullWidth onClick={onClose}>
                  Cerrar
                </Button>
                <Button fullWidth icon={<RotateCcw className="size-4" />} onClick={() => setPhase('ready')} data-testid="preview-again">
                  Girar otra vez
                </Button>
              </div>
            </div>
          )
        )}
      </div>
    </div>,
    document.body,
  );
}
