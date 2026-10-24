import type { PublicRoulette, RouletteSpinResult } from '@parla/types';
import { Eye, Sparkles, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FlashOfferGame } from './FlashOfferGame';
import { MysteryBoxGame } from './MysteryBoxGame';
import { Confetti } from './Confetti';
import { ScratchGame } from './ScratchGame';

export type OverlayCampaign = Pick<PublicRoulette, 'kind' | 'title' | 'subtitle' | 'prizes' | 'endsAt'>;

const BADGE: Record<string, string> = { scratch: 'Rasca y gana', box: 'Cofre sorpresa', flash: 'Oferta relámpago' };

/**
 * Pantalla completa de las estrategias que no son la ruleta (rasca y gana, cofre sorpresa y oferta
 * relámpago): el mismo fondo, titular y confeti, con el juego que toque en el centro. La usan la app
 * del cliente y la vista previa de soporte (que pasa `preview` y su propio `play`).
 */
export function CampaignOverlay({
  campaign,
  play,
  preview = false,
  onClose,
  onUse,
}: {
  campaign: OverlayCampaign;
  play: () => Promise<RouletteSpinResult>;
  preview?: boolean;
  onClose: () => void;
  onUse?: () => void;
}) {
  const [settled, setSettled] = useState<boolean | null>(null);
  const onSettled = useCallback((won: boolean) => setSettled(won), []);

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

  const game = { play, preview, onClose, onUse, onSettled };
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4" role="dialog" aria-modal="true" aria-label={campaign.title} data-testid={preview ? 'roulette-preview' : 'roulette'}>
      <div className="absolute inset-0 animate-fade-in bg-[radial-gradient(ellipse_at_50%_30%,#0b6b52_0%,#04281f_70%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background:repeating-conic-gradient(from_0deg_at_50%_38%,rgb(255_255_255/0.07)_0deg_6deg,transparent_6deg_18deg)]" />
      {settled && <Confetti />}

      <div className="relative my-auto flex w-full max-w-md animate-pop flex-col items-center gap-5 py-6 text-center">
        {preview ? (
          <div className="flex w-full items-center justify-between gap-2 rounded-full bg-amber-300/95 px-4 py-1.5 text-xs font-bold text-ink">
            <span className="flex items-center gap-1.5">
              <Eye className="size-4" /> Vista previa: así la ve el cliente. No se guarda nada.
            </span>
            <button type="button" onClick={onClose} aria-label="Cerrar la vista previa" className="flex size-7 items-center justify-center rounded-full hover:bg-amber-400" data-testid="close-preview">
              <X className="size-4" />
            </button>
          </div>
        ) : (
          settled === null && (
            <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-0 right-0 flex size-10 items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white">
              <X className="size-5" />
            </button>
          )
        )}

        <div className="flex flex-col items-center gap-1.5 px-6">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-bold tracking-wide text-amber-200 uppercase ring-1 ring-white/15">
            <Sparkles className="size-3.5" /> {BADGE[campaign.kind] ?? 'Para ti'}
          </span>
          <h2 className="font-display text-3xl font-extrabold text-white sm:text-4xl">{campaign.title}</h2>
          {campaign.subtitle && <p className="text-sm text-teal-100/90">{campaign.subtitle}</p>}
        </div>

        {campaign.kind === 'scratch' && <ScratchGame {...game} />}
        {campaign.kind === 'box' && <MysteryBoxGame {...game} />}
        {campaign.kind === 'flash' && <FlashOfferGame {...game} campaign={campaign} />}

        {settled === null && !preview && (
          <button type="button" onClick={onClose} className="text-sm font-semibold text-teal-100/80 underline-offset-4 hover:text-white hover:underline">
            Ahora no
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}
