import { useId } from 'react';
import { pointOnCircle, sliceAngles, slicePath } from '../utils/roulette.utils';

export interface WheelPrize {
  id: string;
  label: string;
  kind: string;
}

interface RouletteWheelProps {
  prizes: WheelPrize[];
  /** Grados acumulados; al cambiar, la rueda gira hasta ahí con frenado suave. */
  rotation: number;
  spinMs?: number;
  /** Gajo resaltado al terminar. */
  winnerIndex?: number | null;
  spinning?: boolean;
  onSettled?: () => void;
  className?: string;
}

const C = 200;
const SLICE_R = 158;
const BULBS = 24;

/** Colores de los gajos: alternan verdes de la marca con tonos cálidos; «sin premio» va en gris. */
const PALETTE = [
  ['#00b383', '#008a63'],
  ['#ffb020', '#e08600'],
  ['#22b8cf', '#0b8da3'],
  ['#ff6b6b', '#d9434f'],
  ['#7c5cff', '#5a3fd1'],
  ['#58cba9', '#2fa583'],
];
const NONE = ['#cbd5d3', '#9db0ad'];

/**
 * Rueda de premios en SVG: aro con luces que parpadean, gajos con degradado, texto sobre el radio y
 * una flecha fija arriba que da un golpecito al girar. Es solo la imagen: el premio lo decide el
 * servidor y aquí solo se anima hasta él.
 */
export function RouletteWheel({ prizes, rotation, spinMs = 5200, winnerIndex = null, spinning = false, onSettled, className = '' }: RouletteWheelProps) {
  const uid = useId().replace(/:/g, '');
  const slices = sliceAngles(prizes.length);
  const colorOf = (i: number) => (prizes[i].kind === 'none' ? NONE : PALETTE[i % PALETTE.length]);
  const fontSize = prizes.length > 8 ? 12 : 14;

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      {/* Flecha fija. */}
      <svg viewBox="0 0 60 70" className="absolute top-0 left-1/2 z-10 h-[15%] -translate-x-1/2 -translate-y-[18%] drop-shadow-[0_3px_3px_rgb(0_0_0/0.35)]" aria-hidden>
        <g className={spinning ? 'roulette-motion origin-[30px_12px] animate-[pointer-flick_0.16s_ease-in-out_infinite]' : ''}>
          <path d="M30 66 L6 22 A26 26 0 1 1 54 22 Z" fill="#fff" stroke="#0a3d30" strokeWidth="3" strokeLinejoin="round" />
          <circle cx="30" cy="22" r="8" fill="#00b383" stroke="#0a3d30" strokeWidth="2.5" />
        </g>
      </svg>

      <svg viewBox="0 0 400 400" className="size-full overflow-visible" role="img" aria-label={`Ruleta con ${prizes.length} premios`}>
        <defs>
          <radialGradient id={`rim-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="86%" stopColor="#0f5a47" />
            <stop offset="100%" stopColor="#06382c" />
          </radialGradient>
          <radialGradient id={`hub-${uid}`} cx="40%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d6ece5" />
          </radialGradient>
          <filter id={`shadow-${uid}`} x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#001f17" floodOpacity="0.35" />
          </filter>
          {prizes.map((_, i) => (
            <linearGradient key={i} id={`g${i}-${uid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={colorOf(i)[0]} />
              <stop offset="100%" stopColor={colorOf(i)[1]} />
            </linearGradient>
          ))}
        </defs>

        {/* Aro con sombra y luces. */}
        <circle cx={C} cy={C} r="192" fill={`url(#rim-${uid})`} filter={`url(#shadow-${uid})`} />
        <circle cx={C} cy={C} r="192" fill="none" stroke="#2f8f76" strokeWidth="1.5" />
        {Array.from({ length: BULBS }, (_, i) => {
          const p = pointOnCircle(C, C, 175, (i * 360) / BULBS);
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r="4.6"
              fill={i % 2 ? '#fff4c2' : '#ffd25a'}
              className={spinning ? 'roulette-motion animate-[bulb-blink_0.5s_ease-in-out_infinite]' : 'roulette-motion animate-[bulb-blink_2.4s_ease-in-out_infinite]'}
              style={{ animationDelay: `${(i % 2) * (spinning ? 0.25 : 1.2)}s` }}
            />
          );
        })}

        {/* Parte que gira. */}
        <g
          className="roulette-motion"
          style={{
            transform: `rotate(${rotation}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: spinning || rotation ? `transform ${spinMs}ms cubic-bezier(0.1, 0.62, 0.08, 1)` : 'none',
          }}
          onTransitionEnd={(e) => e.target === e.currentTarget && onSettled?.()}
        >
          {slices.map((s, i) => {
            const win = winnerIndex === i;
            return (
              <g key={prizes[i].id} opacity={winnerIndex !== null && !win ? 0.55 : 1} style={{ transition: 'opacity 400ms' }}>
                <path d={slicePath(C, C, SLICE_R, s.start, s.end)} fill={`url(#g${i}-${uid})`} stroke="#ffffff" strokeWidth="2.5" strokeLinejoin="round" />
                <g transform={`rotate(${s.mid} ${C} ${C})`}>
                  <text
                    x={C}
                    y={C - SLICE_R + 28}
                    textAnchor="middle"
                    fontSize={fontSize}
                    fontWeight="800"
                    fill={prizes[i].kind === 'none' ? '#37504b' : '#ffffff'}
                    style={{ paintOrder: 'stroke', stroke: prizes[i].kind === 'none' ? 'none' : 'rgb(0 0 0 / 0.28)', strokeWidth: 3, strokeLinejoin: 'round', fontFamily: 'var(--font-display)' }}
                    transform={`rotate(0 ${C} ${C})`}
                  >
                    {fit(prizes[i].label)}
                  </text>
                </g>
              </g>
            );
          })}
          {/* Clavijas entre gajos. */}
          {slices.map((s) => {
            const p = pointOnCircle(C, C, SLICE_R, s.start);
            return <circle key={s.start} cx={p.x} cy={p.y} r="4.2" fill="#fff" stroke="#0a3d30" strokeWidth="1.5" />;
          })}
        </g>

        {/* Centro. */}
        <circle cx={C} cy={C} r="34" fill={`url(#hub-${uid})`} stroke="#0a3d30" strokeWidth="3" />
        <path d="M200 182 l5.4 11 12.1 1.8 -8.8 8.5 2.1 12.1 -10.8 -5.7 -10.8 5.7 2.1 -12.1 -8.8 -8.5 12.1 -1.8z" fill="#00b383" />
      </svg>
    </div>
  );
}

/** Los textos largos se acortan para que quepan en el gajo. */
function fit(label: string): string {
  return label.length > 16 ? `${label.slice(0, 15).trimEnd()}…` : label;
}
