import { useId } from 'react';

interface LogoMarkProps {
  className?: string;
  /** Las burbujas aparecen una tras otra, la marca se dibuja y el logo flota suavemente. */
  animated?: boolean;
}

const BACK = 'M20 5h17a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-1v6l-7-6h-9a8 8 0 0 1-8-8V13a8 8 0 0 1 8-8z';
const FRONT = 'M11 15h16a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H17l-8 6v-6.4A8 8 0 0 1 3 33V23a8 8 0 0 1 8-8z';

/**
 * Marca de Parla: dos burbujas entrelazadas con una marca de verificación. Sin fondo: el borde entre las
 * burbujas es un recorte transparente (no un contorno de color), así se ve igual sobre cualquier superficie.
 */
export function LogoMark({ className = 'size-9', animated = false }: LogoMarkProps) {
  const cut = useId();
  return (
    <svg viewBox="0 0 48 48" className={`${className} ${animated ? 'logo-float' : ''}`} aria-hidden="true">
      <defs>
        <mask id={cut} maskUnits="userSpaceOnUse" x="0" y="0" width="48" height="48">
          <rect width="48" height="48" fill="#fff" />
          <path d={FRONT} fill="#000" stroke="#000" strokeWidth="5" strokeLinejoin="round" />
        </mask>
      </defs>
      <g mask={`url(#${cut})`}>
        <path d={BACK} fill="#34d399" className={animated ? 'logo-back' : undefined} />
      </g>
      <path d={FRONT} fill="#009d71" className={animated ? 'logo-front' : undefined} />
      <path
        d="M12.5 28.5l4.5 4.5 8.5-9"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        pathLength={1}
        className={animated ? 'logo-tick' : undefined}
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  tone?: 'brand' | 'light';
  animated?: boolean;
}

export function Logo({ className = '', tone = 'brand', animated = false }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-9" animated={animated} />
      <span
        className={`font-display text-2xl font-extrabold tracking-tight ${tone === 'light' ? 'text-white' : 'text-ink'} ${animated ? 'logo-word' : ''}`}
      >
        parla
      </span>
    </span>
  );
}
