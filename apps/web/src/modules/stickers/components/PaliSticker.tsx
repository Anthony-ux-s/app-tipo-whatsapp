import { useId, type ReactNode } from 'react';
import { PALI_STICKERS, type PaliMood } from '@shared/const/stickers.const';

type Eyes = 'normal' | 'happy' | 'love' | 'closed' | 'wink' | 'big' | 'sad' | 'laugh' | 'up';

interface Pose {
  eyes: Eyes;
  /** Pico abierto (risa, sorpresa, fiesta). */
  open?: boolean;
  /** Animación de todo el cuerpo. */
  body?: 'bob' | 'shake' | 'bow' | 'sway';
  crest?: boolean;
  wings?: 'rest' | 'wave' | 'pray' | 'hug' | 'raise' | 'chin';
  front?: (ids: Ids) => ReactNode;
  back?: (ids: Ids) => ReactNode;
}

interface Ids {
  body: string;
  belly: string;
  crest: string;
  beak: string;
  shine: string;
}

const INK = '#0f172a';

/** Corazón centrado en (cx, cy) de tamaño s. */
function heartPath(cx: number, cy: number, s: number) {
  return `M${cx} ${cy + s * 0.9} C${cx - s * 1.5} ${cy - s * 0.1} ${cx - s * 0.75} ${cy - s * 1.25} ${cx} ${cy - s * 0.4} C${cx + s * 0.75} ${cy - s * 1.25} ${cx + s * 1.5} ${cy - s * 0.1} ${cx} ${cy + s * 0.9} Z`;
}

function Eye({ x, kind, side }: { x: number; kind: Eyes; side: 'l' | 'r' }) {
  const y = 71;
  const stroke = { stroke: INK, strokeWidth: 4, strokeLinecap: 'round' as const, fill: 'none' };
  switch (kind) {
    case 'happy':
      return <path d={`M${x - 7} ${y + 2} Q${x} ${y - 8} ${x + 7} ${y + 2}`} {...stroke} />;
    case 'closed':
      return <path d={`M${x - 7} ${y} Q${x} ${y + 6} ${x + 7} ${y}`} {...stroke} />;
    case 'laugh':
      return side === 'l' ? (
        <path d={`M${x - 6} ${y - 6} L${x + 5} ${y} L${x - 6} ${y + 6}`} {...stroke} strokeLinejoin="round" />
      ) : (
        <path d={`M${x + 6} ${y - 6} L${x - 5} ${y} L${x + 6} ${y + 6}`} {...stroke} strokeLinejoin="round" />
      );
    case 'love':
      return <path d={heartPath(x, y, 8)} fill="#f43f5e" className="stk-beat" />;
    case 'wink':
      return side === 'r' ? (
        <path d={`M${x - 7} ${y + 2} Q${x} ${y - 8} ${x + 7} ${y + 2}`} {...stroke} />
      ) : (
        <Pupil x={x} y={y} r={6} />
      );
    case 'big':
      return <Pupil x={x} y={y} r={8.5} />;
    case 'sad':
      return (
        <>
          <Pupil x={x} y={y + 2} r={5.5} />
          <path d={side === 'l' ? `M${x - 9} ${y - 12} L${x + 6} ${y - 16}` : `M${x + 9} ${y - 12} L${x - 6} ${y - 16}`} {...stroke} strokeWidth={3} />
        </>
      );
    case 'up':
      return <Pupil x={x + 2} y={y - 5} r={6} />;
    default:
      return <Pupil x={x} y={y} r={6.5} />;
  }
}

function Pupil({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <>
      <circle cx={x} cy={y} r={r} fill={INK} />
      <circle cx={x + r * 0.35} cy={y - r * 0.4} r={r * 0.36} fill="#fff" />
    </>
  );
}

function Wing({ side, pose }: { side: 'l' | 'r'; pose: NonNullable<Pose['wings']> }) {
  const left = side === 'l';
  const fill = '#0d9488';
  if (pose === 'wave' && !left) {
    return (
      <g className="stk-wave" style={{ transformOrigin: '138px 108px' }}>
        <ellipse cx={152} cy={84} rx={12} ry={25} transform="rotate(28 152 84)" fill={fill} />
        <path d="M168 58 q8 6 6 16 M176 52 q10 9 7 22" stroke="#fbbf24" strokeWidth={3} strokeLinecap="round" fill="none" />
      </g>
    );
  }
  if (pose === 'raise' && !left) {
    return (
      <g className="stk-pop">
        <ellipse cx={150} cy={92} rx={12} ry={24} transform="rotate(22 150 92)" fill={fill} />
        <circle cx={160} cy={66} r={15} fill="#22c55e" stroke="#fff" strokeWidth={3} />
        <path d="M153 66 l5 5 l9 -10" stroke="#fff" strokeWidth={4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    );
  }
  if (pose === 'chin' && !left) {
    return <ellipse cx={124} cy={104} rx={11} ry={22} transform="rotate(-50 124 104)" fill={fill} />;
  }
  if (pose === 'pray') {
    return <ellipse cx={left ? 92 : 108} cy={116} rx={9} ry={22} transform={`rotate(${left ? 18 : -18} ${left ? 92 : 108} 116)`} fill={fill} />;
  }
  if (pose === 'hug') {
    return <ellipse cx={left ? 80 : 120} cy={124} rx={10} ry={22} transform={`rotate(${left ? -40 : 40} ${left ? 80 : 120} 124)`} fill={fill} />;
  }
  return (
    <ellipse
      cx={left ? 58 : 142}
      cy={114}
      rx={13}
      ry={27}
      transform={`rotate(${left ? 16 : -16} ${left ? 58 : 142} 114)`}
      fill={fill}
    />
  );
}

const Confetti = () => (
  <g className="stk-float">
    {[
      [30, 40, '#f43f5e', 20],
      [168, 34, '#fbbf24', -25],
      [24, 104, '#38bdf8', 40],
      [176, 112, '#a78bfa', -10],
      [44, 18, '#22c55e', 60],
      [156, 140, '#f97316', 15],
    ].map(([x, y, c, r], i) => (
      <rect key={i} x={x as number} y={y as number} width={9} height={5} rx={1.5} fill={c as string} transform={`rotate(${r} ${x} ${y})`} />
    ))}
  </g>
);

const POSES: Record<PaliMood, Pose> = {
  hola: { eyes: 'happy', body: 'bob', wings: 'wave' },
  gracias: {
    eyes: 'happy',
    body: 'bow',
    wings: 'pray',
    back: () => (
      <g className="stk-twinkle" fill="#fbbf24">
        <path d="M36 54 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" />
        <path d="M164 40 l2.5 6 l6 2.5 l-6 2.5 l-2.5 6 l-2.5 -6 l-6 -2.5 l6 -2.5 z" />
      </g>
    ),
  },
  jaja: {
    eyes: 'laugh',
    open: true,
    body: 'shake',
    front: () => (
      <g fill="#38bdf8">
        <path className="stk-drip" d="M66 76 q-6 10 0 14 q6 -4 0 -14z" />
        <path className="stk-drip" style={{ animationDelay: '.4s' }} d="M134 76 q6 10 0 14 q-6 -4 0 -14z" />
      </g>
    ),
  },
  'te-quiero': {
    eyes: 'love',
    body: 'sway',
    wings: 'hug',
    front: () => (
      <g className="stk-beat">
        <path d={heartPath(100, 126, 20)} fill="#f43f5e" stroke="#fff" strokeWidth={3} />
        <ellipse cx={92} cy={116} rx={5} ry={3} fill="#fff" opacity={0.6} transform="rotate(-30 92 116)" />
      </g>
    ),
  },
  listo: { eyes: 'wink', body: 'bob', wings: 'raise' },
  fiesta: {
    eyes: 'happy',
    open: true,
    body: 'bob',
    crest: false,
    back: () => <Confetti />,
    front: () => (
      <g>
        <path d="M80 40 L100 0 L120 40 Z" fill="#8b5cf6" stroke="#fff" strokeWidth={2.5} strokeLinejoin="round" />
        <path d="M86 28 L114 28 M92 16 L108 16" stroke="#fbbf24" strokeWidth={4} />
        <circle cx={100} cy={2} r={6} fill="#fbbf24" stroke="#fff" strokeWidth={2} />
      </g>
    ),
  },
  'en-camino': {
    eyes: 'normal',
    body: 'bob',
    crest: false,
    back: () => (
      <g className="stk-speed" stroke="#94a3b8" strokeWidth={4} strokeLinecap="round">
        <path d="M14 88 h22" />
        <path d="M6 106 h28" />
        <path d="M16 124 h18" />
      </g>
    ),
    front: () => (
      <g>
        <path d="M58 62 A42 40 0 0 1 142 62 Z" fill="#f97316" stroke="#fff" strokeWidth={2.5} />
        <path d="M64 56 A36 30 0 0 1 136 56" stroke="#fdba74" strokeWidth={5} fill="none" />
        <rect x={80} y={112} width={40} height={32} rx={4} fill="#d97706" stroke="#fff" strokeWidth={2.5} />
        <path d="M100 112 v32 M80 124 h40" stroke="#fde68a" strokeWidth={4} />
      </g>
    ),
  },
  triste: {
    eyes: 'sad',
    body: 'sway',
    front: () => <path className="stk-drip" d="M80 84 q-7 11 0 15 q7 -4 0 -15z" fill="#38bdf8" />,
  },
  sorpresa: {
    eyes: 'big',
    open: true,
    body: 'shake',
    back: () => (
      <g fill="#f97316" className="stk-pop">
        <rect x={156} y={24} width={8} height={26} rx={4} transform="rotate(15 160 37)" />
        <circle cx={154} cy={60} r={4.5} />
        <rect x={36} y={24} width={8} height={26} rx={4} transform="rotate(-15 40 37)" />
        <circle cx={46} cy={60} r={4.5} />
      </g>
    ),
  },
  'buenos-dias': {
    eyes: 'happy',
    body: 'bob',
    wings: 'hug',
    back: () => (
      <g>
        <circle cx={160} cy={36} r={16} fill="#fbbf24" />
        <g stroke="#fbbf24" strokeWidth={3.5} strokeLinecap="round" className="stk-spin" style={{ transformOrigin: '160px 36px' }}>
          <path d="M160 10 v-6 M160 62 v6 M134 36 h-6 M186 36 h6 M142 18 l-4 -4 M178 54 l4 4 M178 18 l4 -4 M142 54 l-4 4" />
        </g>
      </g>
    ),
    front: () => (
      <g>
        <g className="stk-steam" stroke="#cbd5e1" strokeWidth={3.5} strokeLinecap="round" fill="none">
          <path d="M92 104 q-5 -7 0 -14" />
          <path d="M104 104 q5 -7 0 -14" style={{ animationDelay: '.5s' }} />
        </g>
        <path d="M80 110 h40 l-4 34 a6 6 0 0 1 -6 5 h-20 a6 6 0 0 1 -6 -5 z" fill="#fff" stroke="#0f766e" strokeWidth={2.5} />
        <path d="M120 118 a9 9 0 0 1 0 18" stroke="#fff" strokeWidth={5} fill="none" />
        <rect x={82} y={122} width={36} height={8} fill="#14b8a6" />
      </g>
    ),
  },
  'buenas-noches': {
    eyes: 'closed',
    body: 'sway',
    back: () => (
      <g>
        <path d="M166 22 a18 18 0 1 0 14 30 a14 14 0 1 1 -14 -30z" fill="#fde68a" />
        <g fill="#6366f1" fontWeight={900} fontFamily="system-ui, sans-serif">
          <text x={140} y={62} fontSize={18} className="stk-zz">z</text>
          <text x={152} y={44} fontSize={14} className="stk-zz" style={{ animationDelay: '.6s' }}>z</text>
        </g>
      </g>
    ),
    front: () => (
      <g>
        <path d="M60 50 Q100 4 140 50 Q100 38 60 50 Z" fill="#6366f1" stroke="#fff" strokeWidth={2.5} />
        <path d="M136 44 Q156 50 160 72" stroke="#6366f1" strokeWidth={6} fill="none" strokeLinecap="round" />
        <circle cx={161} cy={76} r={7} fill="#fff" />
      </g>
    ),
  },
  pensando: {
    eyes: 'up',
    body: 'sway',
    wings: 'chin',
    back: () => (
      <g className="stk-float">
        <circle cx={150} cy={44} r={20} fill="#fff" stroke="#cbd5e1" strokeWidth={2.5} />
        <circle cx={136} cy={70} r={5} fill="#fff" stroke="#cbd5e1" strokeWidth={2} />
        <text x={150} y={53} textAnchor="middle" fontSize={26} fontWeight={900} fill="#0f766e" fontFamily="system-ui, sans-serif">
          ?
        </text>
      </g>
    ),
  },
};

interface PaliStickerProps {
  mood: PaliMood;
  className?: string;
  /** Sin la frase de abajo (en el selector ya se lee debajo). */
  withCaption?: boolean;
}

/** Pali, el loro de Parla, en 12 estados de ánimo. Todo es SVG propio (sin imágenes externas). */
export function PaliSticker({ mood, className = '', withCaption = true }: PaliStickerProps) {
  const uid = useId().replace(/:/g, '');
  const ids: Ids = { body: `${uid}b`, belly: `${uid}y`, crest: `${uid}c`, beak: `${uid}k`, shine: `${uid}s` };
  const pose = POSES[mood];
  const caption = PALI_STICKERS.find((s) => s.id === mood)?.caption ?? '';
  const wings = pose.wings ?? 'rest';
  const bodyClass = { bob: 'stk-bob', shake: 'stk-shake', bow: 'stk-bow', sway: 'stk-sway' }[pose.body ?? 'bob'];

  return (
    <svg viewBox="0 0 200 200" className={className} role="img" aria-label={`Pali: ${caption}`}>
      <defs>
        <linearGradient id={ids.body} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
        <linearGradient id={ids.belly} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f0fdfa" />
          <stop offset="1" stopColor="#99f6e4" />
        </linearGradient>
        <linearGradient id={ids.crest} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fde047" />
          <stop offset="1" stopColor="#f97316" />
        </linearGradient>
        <linearGradient id={ids.beak} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fdba74" />
          <stop offset="1" stopColor="#ea580c" />
        </linearGradient>
        <radialGradient id={ids.shine} cx="0.35" cy="0.25" r="0.6">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>

      {pose.back?.(ids)}

      <g className={bodyClass} style={{ transformOrigin: '100px 160px' }}>
        <ellipse cx={100} cy={164} rx={42} ry={6} fill="#0f172a" opacity={0.12} />
        {/* Cola */}
        <path d="M86 146 L78 168 L92 158 L100 172 L108 158 L122 168 L114 146 Z" fill={`url(#${ids.crest})`} />
        {/* Patas */}
        <ellipse cx={86} cy={158} rx={9} ry={4.5} fill="#f97316" />
        <ellipse cx={114} cy={158} rx={9} ry={4.5} fill="#f97316" />
        {/* Cresta */}
        {pose.crest !== false && (
          <g fill={`url(#${ids.crest})`}>
            <ellipse cx={88} cy={30} rx={7} ry={16} transform="rotate(-24 88 40)" />
            <ellipse cx={100} cy={24} rx={8} ry={18} />
            <ellipse cx={112} cy={30} rx={7} ry={16} transform="rotate(24 112 40)" />
          </g>
        )}
        {/* Cuerpo y cabeza */}
        {wings === 'rest' || wings === 'wave' || wings === 'raise' || wings === 'chin' ? <Wing side="l" pose="rest" /> : null}
        {wings === 'rest' && <Wing side="r" pose="rest" />}
        <ellipse cx={100} cy={112} rx={44} ry={46} fill={`url(#${ids.body})`} />
        <circle cx={100} cy={72} r={41} fill={`url(#${ids.body})`} />
        <ellipse cx={100} cy={122} rx={28} ry={31} fill={`url(#${ids.belly})`} />
        <ellipse cx={86} cy={52} rx={22} ry={14} fill={`url(#${ids.shine})`} />
        {/* Cara */}
        <ellipse cx={85} cy={71} rx={15} ry={17} fill="#fff" />
        <ellipse cx={115} cy={71} rx={15} ry={17} fill="#fff" />
        <Eye x={85} kind={pose.eyes} side="l" />
        <Eye x={115} kind={pose.eyes} side="r" />
        <ellipse cx={70} cy={90} rx={7} ry={4.5} fill="#fb7185" opacity={0.55} />
        <ellipse cx={130} cy={90} rx={7} ry={4.5} fill="#fb7185" opacity={0.55} />
        {/* Pico */}
        {pose.open && (
          <g>
            <ellipse cx={100} cy={98} rx={9} ry={9} fill="#7f1d1d" />
            <ellipse cx={100} cy={102} rx={5.5} ry={4} fill="#fb7185" />
          </g>
        )}
        <path
          d={pose.open ? 'M89 84 C89 77 111 77 111 84 C111 90 106 93 100 94 C94 93 89 90 89 84 Z' : 'M89 84 C89 77 111 77 111 84 C111 94 105 100 99 104 C100 96 93 92 89 84 Z'}
          fill={`url(#${ids.beak})`}
        />
        <ellipse cx={95} cy={82} rx={4} ry={2} fill="#fff" opacity={0.6} />
        {wings !== 'rest' && <Wing side="r" pose={wings} />}
        {(wings === 'pray' || wings === 'hug') && <Wing side="l" pose={wings} />}
        {pose.front?.(ids)}
      </g>

      {withCaption && (
        <text
          x={100}
          y={193}
          textAnchor="middle"
          fontSize={caption.length > 12 ? 19 : 22}
          fontWeight={900}
          fontFamily="system-ui, 'Segoe UI', sans-serif"
          fill="#0f766e"
          stroke="#fff"
          strokeWidth={7}
          strokeLinejoin="round"
          paintOrder="stroke"
        >
          {caption}
        </text>
      )}
    </svg>
  );
}
