import type { PublicRoulette, RouletteSpinResult } from '@parla/types';
import { Timer, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@shared/ui/Button';
import { PrizeResultCard } from './PrizeResultCard';
import type { GameProps } from './ScratchGame';

const pad = (n: number) => String(n).padStart(2, '0');

/** Cuenta regresiva hasta `endsAt`: días, horas, minutos y segundos (se actualiza cada segundo). */
export function useCountdown(endsAt: string | null) {
  const target = endsAt ? new Date(endsAt).getTime() : null;
  const [left, setLeft] = useState(() => (target ? Math.max(0, target - Date.now()) : null));
  useEffect(() => {
    if (!target) return;
    const tick = () => setLeft(Math.max(0, target - Date.now()));
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [target]);
  if (left === null) return null;
  const s = Math.floor(left / 1000);
  return { expired: left <= 0, days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 };
}

function Unit({ value, label }: { value: string; label: string }) {
  return (
    <span className="flex w-16 flex-col items-center rounded-2xl bg-black/30 py-2 ring-1 ring-white/15">
      <span className="font-mono text-3xl font-extrabold text-white tabular-nums">{value}</span>
      <span className="text-[10px] font-bold tracking-wider text-teal-100/80 uppercase">{label}</span>
    </span>
  );
}

/**
 * «Oferta relámpago»: un solo cupón con cuenta regresiva. Al tocar el botón se reclama y queda guardado
 * en la cuenta; cuando el tiempo se acaba, la oferta desaparece.
 */
export function FlashOfferGame({ campaign, play, preview, onClose, onUse, onSettled }: GameProps & { campaign: Pick<PublicRoulette, 'prizes' | 'endsAt'> }) {
  const time = useCountdown(campaign.endsAt);
  const [result, setResult] = useState<RouletteSpinResult | null>(null);
  const [claiming, setClaiming] = useState(false);
  const prize = campaign.prizes[0];

  const claim = () => {
    setClaiming(true);
    play()
      .then((won) => {
        setResult(won);
        onSettled?.(!!won.coupon);
      })
      .catch(() => onClose())
      .finally(() => setClaiming(false));
  };

  if (result) return <PrizeResultCard result={result} preview={preview} onClose={onClose} onUse={onUse} />;

  return (
    <div className="flex w-full flex-col items-center gap-5" data-testid="flash-offer">
      <span className="relative flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-amber-300 to-orange-500 text-white shadow-[0_0_50px_rgb(251_191_36/0.55)]">
        <span className="roulette-motion absolute inset-0 animate-ping rounded-full bg-amber-300/40" />
        <Zap className="relative size-12 fill-white" />
      </span>
      <p className="font-display text-5xl font-extrabold text-white drop-shadow sm:text-6xl">{prize?.label}</p>

      {time && (
        <div className="flex flex-col items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-amber-200 uppercase">
            <Timer className="size-4" /> {time.expired ? 'La oferta terminó' : 'Se acaba en'}
          </span>
          {!time.expired && (
            <div className="flex items-center gap-2" data-testid="countdown" aria-live="off">
              {time.days > 0 && <Unit value={pad(time.days)} label="días" />}
              <Unit value={pad(time.hours)} label="horas" />
              <Unit value={pad(time.minutes)} label="min" />
              <Unit value={pad(time.seconds)} label="seg" />
            </div>
          )}
        </div>
      )}

      <Button size="lg" onClick={claim} loading={claiming} disabled={!!time?.expired} className="min-w-60 shadow-[0_10px_30px_-8px_rgb(0_179_131/0.7)]" data-testid="flash-claim">
        {time?.expired ? 'Terminó' : '¡Quiero mi cupón!'}
      </Button>
    </div>
  );
}
