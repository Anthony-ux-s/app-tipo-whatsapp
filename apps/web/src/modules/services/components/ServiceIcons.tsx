import { useId, type ReactNode } from 'react';

export type ServiceIconName = 'mercado' | 'salud' | 'pedidos' | 'mercaya' | 'rapidito' | 'pagaya';

const PALETTES: Record<ServiceIconName, [string, string]> = {
  mercado: ['#34d399', '#047857'],
  salud: ['#67e8f9', '#0369a1'],
  pedidos: ['#fdba74', '#c2410c'],
  mercaya: ['#4ade80', '#15803d'],
  rapidito: ['#fb7185', '#be123c'],
  pagaya: ['#c4b5fd', '#6d28d9'],
};

/** Dibujo de cada ícono sobre un lienzo de 64×64. */
const ART: Record<ServiceIconName, (id: string) => ReactNode> = {
  mercado: (id) => (
    <>
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fcd34d" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <path d="M21 30 C21 16 43 16 43 30" stroke="#fff" strokeWidth={3.5} fill="none" strokeLinecap="round" />
      <circle cx={26} cy={29} r={7} fill="#ef4444" />
      <path d="M26 22 q2 -4 5 -4" stroke="#166534" strokeWidth={2} fill="none" strokeLinecap="round" />
      <ellipse cx={38} cy={27} rx={6} ry={8} fill="#a3e635" transform="rotate(25 38 27)" />
      <path d="M33 30 q8 -2 10 -10" stroke="#fde047" strokeWidth={4} fill="none" strokeLinecap="round" />
      <path d="M13 32 h38 l-4 17 a5 5 0 0 1 -5 4 h-20 a5 5 0 0 1 -5 -4 z" fill={`url(#${id}w)`} />
      <path d="M17 39 h30 M19 45 h26" stroke="#92400e" strokeOpacity={0.45} strokeWidth={2} />
      <path d="M25 33 v18 M32 33 v19 M39 33 v18" stroke="#92400e" strokeOpacity={0.35} strokeWidth={2} />
      <rect x={11} y={30} width={42} height={5} rx={2.5} fill="#fde68a" />
    </>
  ),
  salud: () => (
    <>
      <path
        d="M32 51 C18 42 12 34 12 26 a10 10 0 0 1 20 -4 a10 10 0 0 1 20 4 c0 8 -6 16 -20 25 z"
        fill="#fff"
      />
      <path d="M15 32 h9 l3 -6 l5 12 l4 -9 l2 3 h11" stroke="#0e7490" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={46} cy={16} r={8} fill="#ef4444" stroke="#fff" strokeWidth={2} />
      <path d="M46 12 v8 M42 16 h8" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
    </>
  ),
  pedidos: () => (
    <>
      <path d="M12 24 L32 14 L52 24 L32 34 Z" fill="#fde68a" />
      <path d="M12 24 L32 34 V54 L12 44 Z" fill="#f59e0b" />
      <path d="M52 24 L32 34 V54 L52 44 Z" fill="#d97706" />
      <path d="M22 19 L42 29 V36" stroke="#fff" strokeOpacity={0.8} strokeWidth={4} fill="none" strokeLinejoin="round" />
      <circle cx={47} cy={47} r={9} fill="#22c55e" stroke="#fff" strokeWidth={2.5} />
      <path d="M43 47 l3 3 l5 -6" stroke="#fff" strokeWidth={2.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  mercaya: () => (
    <>
      <path d="M14 20 h6 l5 22 h22 l4 -16 h-28" stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={27} cy={49} r={4} fill="#fff" />
      <circle cx={44} cy={49} r={4} fill="#fff" />
    </>
  ),
  rapidito: () => (
    <>
      <circle cx={19} cy={44} r={8} fill="none" stroke="#fff" strokeWidth={4} />
      <circle cx={46} cy={44} r={8} fill="none" stroke="#fff" strokeWidth={4} />
      <path d="M19 44 l9 -14 h12 l6 14 M28 30 h-6 M40 30 l-3 -8 h6" stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x={30} y={14} width={13} height={10} rx={2} fill="#fde047" />
    </>
  ),
  pagaya: () => (
    <>
      <rect x={14} y={14} width={14} height={14} rx={3} fill="none" stroke="#fff" strokeWidth={3.5} />
      <rect x={36} y={14} width={14} height={14} rx={3} fill="none" stroke="#fff" strokeWidth={3.5} />
      <rect x={14} y={36} width={14} height={14} rx={3} fill="none" stroke="#fff" strokeWidth={3.5} />
      <rect x={19} y={19} width={4} height={4} fill="#fff" />
      <rect x={41} y={19} width={4} height={4} fill="#fff" />
      <rect x={19} y={41} width={4} height={4} fill="#fff" />
      <path d="M37 37 h5 v5 h-5z M45 45 h5 v5 h-5z M45 37 h5 M37 47 v3" stroke="#fff" strokeWidth={3} />
    </>
  ),
};

interface ServiceIconProps {
  name: ServiceIconName;
  className?: string;
}

/** Íconos ilustrados con estilo de app (degradado, brillo y sombra interna), dibujados en SVG propio. */
export function ServiceIcon({ name, className = '' }: ServiceIconProps) {
  const id = useId().replace(/:/g, '');
  const [from, to] = PALETTES[name];
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}bg`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </linearGradient>
        <linearGradient id={`${id}gl`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.45" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <rect width={64} height={64} rx={18} fill={`url(#${id}bg)`} />
      <path d="M0 18 A18 18 0 0 1 18 0 H46 A18 18 0 0 1 64 18 V26 C44 34 20 34 0 26 Z" fill={`url(#${id}gl)`} />
      {ART[name](id)}
      <rect x={0.75} y={0.75} width={62.5} height={62.5} rx={17.25} fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={1.5} />
    </svg>
  );
}
