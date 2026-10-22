import type { RouletteSpinResult } from '@parla/types';
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PrizeResultCard } from './PrizeResultCard';

export interface GameProps {
  /** Pide el premio (al servidor, o al azar local en la vista previa). */
  play: () => Promise<RouletteSpinResult>;
  /** Para mostrar el resultado como vista previa. */
  preview?: boolean;
  onClose: () => void;
  onUse?: () => void;
  /** Avisa que el juego terminó (ya no se puede cerrar «a medias»). */
  onSettled?: (won: boolean) => void;
}

const W = 320;
const H = 200;
const BRUSH = 46;
const REVEAL_AT = 0.5;

/** Cuánto de la capa plateada ya se raspó (muestreando un píxel de cada 16). */
function scratchedRatio(ctx: CanvasRenderingContext2D): number {
  const { data } = ctx.getImageData(0, 0, W, H);
  let clear = 0;
  let total = 0;
  for (let i = 3; i < data.length; i += 64) {
    total += 1;
    if (data[i] < 40) clear += 1;
  }
  return clear / total;
}

function paintCover(ctx: CanvasRenderingContext2D) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#d9dfe1');
  g.addColorStop(0.5, '#a9b4b7');
  g.addColorStop(1, '#cfd6d8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Granito: miles de puntitos para que parezca raspadita de verdad.
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '90,105,110'},${0.1 + Math.random() * 0.25})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6);
  }
  ctx.fillStyle = 'rgba(40,60,65,0.55)';
  ctx.font = '800 26px "Plus Jakarta Sans", Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('RASCA AQUÍ', W / 2, H / 2 - 8);
  ctx.font = '600 13px Inter, sans-serif';
  ctx.fillText('con el dedo o el mouse', W / 2, H / 2 + 22);
}

/**
 * «Rasca y gana»: una tarjeta plateada que se raspa de verdad (canvas). Al empezar a raspar se pide el
 * premio; al descubrir la mitad se revela sola. Siempre hay un botón para descubrirla sin raspar.
 */
export function ScratchGame({ play, preview, onClose, onUse, onSettled }: GameProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const last = useRef<{ x: number; y: number } | null>(null);
  const asked = useRef(false);
  const moves = useRef(0);
  const [result, setResult] = useState<RouletteSpinResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [showCard, setShowCard] = useState(false);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) paintCover(ctx);
  }, []);

  const ask = useCallback(() => {
    if (asked.current) return;
    asked.current = true;
    play()
      .then(setResult)
      .catch(() => onClose());
  }, [play, onClose]);

  const reveal = useCallback(() => {
    setRevealed(true);
    window.setTimeout(() => setShowCard(true), 650);
  }, []);

  useEffect(() => {
    if (showCard && result) onSettled?.(!!result.coupon);
  }, [showCard, result, onSettled]);

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * W, y: ((e.clientY - rect.top) / rect.height) * H };
  };

  const scratch = (to: { x: number; y: number }) => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = BRUSH;
    ctx.beginPath();
    const from = last.current ?? to;
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x + 0.01, to.y);
    ctx.stroke();
    last.current = to;
    moves.current += 1;
    if (moves.current % 8 === 0 && !revealed && scratchedRatio(ctx) >= REVEAL_AT) reveal();
  };

  const instant = () => {
    ask();
    reveal();
  };

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="relative aspect-[8/5] w-full max-w-sm select-none">
        {/* Lo que hay debajo. */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-3xl bg-gradient-to-br from-amber-100 via-white to-teal-100 text-center shadow-pop ring-4 ring-white/70">
          {result ? (
            <>
              <Sparkles className={`size-7 ${result.coupon ? 'text-amber-500' : 'text-ink-faint'}`} />
              <p className="font-display text-3xl font-extrabold text-ink">{result.coupon ? result.label : 'Sigue intentando'}</p>
              {result.coupon && <p className="text-xs font-semibold text-ink-soft">¡Es tuyo!</p>}
            </>
          ) : (
            <p className="animate-pulse text-sm font-semibold text-ink-faint">{asked.current ? 'Descubriendo…' : '¿Qué habrá debajo?'}</p>
          )}
        </div>
        <canvas
          ref={canvas}
          width={W}
          height={H}
          aria-label="Tarjeta para raspar"
          className={`absolute inset-0 size-full touch-none rounded-3xl transition-opacity duration-500 ${revealed ? 'pointer-events-none opacity-0' : 'cursor-[grab] opacity-100'}`}
          data-testid="scratch-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            ask();
            const p = point(e);
            last.current = null;
            scratch(p);
          }}
          onPointerMove={(e) => e.buttons > 0 && scratch(point(e))}
          onPointerUp={() => {
            last.current = null;
            const ctx = canvas.current?.getContext('2d');
            if (ctx && !revealed && scratchedRatio(ctx) >= REVEAL_AT) reveal();
          }}
        />
      </div>

      {!revealed && (
        <button type="button" onClick={instant} className="text-sm font-semibold text-teal-100/80 underline-offset-4 hover:text-white hover:underline" data-testid="scratch-instant">
          Descubrir de una vez
        </button>
      )}
      {showCard && result && <PrizeResultCard result={result} preview={preview} onClose={onClose} onUse={onUse} />}
    </div>
  );
}
