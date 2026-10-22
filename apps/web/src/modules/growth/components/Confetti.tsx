import { useMemo } from 'react';

const CONFETTI = ['#00b383', '#ffb020', '#22b8cf', '#ff6b6b', '#7c5cff', '#ffd25a'];

/** Confeti que cae por la pantalla; cada pieza lleva su propia deriva, giro y retraso. */
export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 56 }, (_, i) => ({
        left: Math.random() * 100,
        dx: (Math.random() - 0.5) * 220,
        spin: 360 + Math.random() * 720,
        delay: Math.random() * 0.7,
        duration: 2.4 + Math.random() * 1.8,
        color: CONFETTI[i % CONFETTI.length],
        w: 6 + Math.random() * 6,
        round: i % 3 === 0,
      })),
    [],
  );
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden>
      {pieces.map((p, i) => (
        <span
          key={i}
          className="roulette-motion absolute top-0 block"
          style={{
            left: `${p.left}%`,
            width: p.w,
            height: p.round ? p.w : p.w * 1.7,
            background: p.color,
            borderRadius: p.round ? '50%' : 2,
            animation: `confetti-fall ${p.duration}s ${p.delay}s cubic-bezier(0.3, 0.1, 0.6, 1) both`,
            ['--dx' as string]: `${p.dx}px`,
            ['--spin' as string]: `${p.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
