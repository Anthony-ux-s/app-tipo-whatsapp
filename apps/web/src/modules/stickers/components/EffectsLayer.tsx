import { useEffect, useMemo, type CSSProperties } from 'react';
import type { ChatEffect } from '@shared/const/stickers.const';
import { useEffectsStore } from '@shared/stores/effects.store';

const DURATION_MS = 4200;
const CONFETTI_COLORS = ['#f43f5e', '#fbbf24', '#22c55e', '#38bdf8', '#a78bfa', '#f97316', '#2dd4bf'];

interface Particle {
  content: string;
  className: string;
  style: CSSProperties;
}

/** Números «aleatorios» repetibles por semilla, para que cada disparo se vea distinto sin saltos al redibujar. */
function seeded(seed: number) {
  let x = seed % 2147483647 || 1;
  return () => {
    x = (x * 16807) % 2147483647;
    return (x - 1) / 2147483646;
  };
}

function particlesFor(effect: ChatEffect, seed: number): Particle[] {
  const rand = seeded(seed);
  const vars = (extra: Record<string, string>) =>
    ({
      left: `${rand() * 100}%`,
      animationDelay: `${(rand() * 0.9).toFixed(2)}s`,
      animationDuration: `${(2.4 + rand() * 1.4).toFixed(2)}s`,
      '--drift': `${Math.round(rand() * 120 - 60)}px`,
      '--spin': `${Math.round(rand() * 720 - 360)}deg`,
      ...extra,
    }) as CSSProperties;

  switch (effect) {
    case 'confetti':
      return Array.from({ length: 90 }, () => ({
        content: '',
        className: 'fx-fall fx-confetti',
        style: vars({
          background: CONFETTI_COLORS[Math.floor(rand() * CONFETTI_COLORS.length)]!,
          width: `${6 + Math.round(rand() * 6)}px`,
          height: `${10 + Math.round(rand() * 8)}px`,
          borderRadius: rand() > 0.6 ? '999px' : '2px',
        }),
      }));
    case 'hearts':
      return Array.from({ length: 34 }, () => ({
        content: ['❤️', '💖', '💕', '💗', '🩷'][Math.floor(rand() * 5)]!,
        className: 'fx-rise fx-emoji',
        style: vars({ fontSize: `${20 + Math.round(rand() * 26)}px` }),
      }));
    case 'laugh':
      return Array.from({ length: 30 }, () => ({
        content: rand() > 0.5 ? '😂' : '🤣',
        className: 'fx-fall fx-emoji',
        style: vars({ fontSize: `${24 + Math.round(rand() * 22)}px` }),
      }));
    case 'stars':
      return Array.from({ length: 40 }, () => ({
        content: ['✨', '⭐', '🌟', '✨', '🌙'][Math.floor(rand() * 5)]!,
        className: 'fx-twinkle fx-emoji',
        style: vars({ top: `${Math.round(rand() * 90)}%`, fontSize: `${16 + Math.round(rand() * 22)}px` }),
      }));
  }
}

/** Capa a pantalla completa para los efectos del chat. No captura clics y se borra sola. */
export function EffectsLayer() {
  const current = useEffectsStore((s) => s.current);
  const clear = useEffectsStore((s) => s.clear);
  const particles = useMemo(() => (current ? particlesFor(current.effect, current.key) : []), [current]);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(clear, DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [current, clear]);

  if (!current) return null;
  return (
    <div key={current.key} className="pointer-events-none fixed inset-0 z-[70] overflow-hidden" aria-hidden="true" data-testid="chat-effect" data-effect={current.effect}>
      {particles.map((p, i) => (
        <span key={i} className={`absolute ${p.className}`} style={p.style}>
          {p.content}
        </span>
      ))}
    </div>
  );
}
