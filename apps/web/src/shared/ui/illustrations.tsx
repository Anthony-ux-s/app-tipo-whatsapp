/** Ilustraciones vectoriales planas de Parla (solo teal, emerald y cyan sobre neutros). */

const svgProps = { className: 'h-auto w-full', role: 'img' as const };

/** Bienvenida: dos personas conversando con burbujas y un candado. */
export function WelcomeIllustration() {
  return (
    <svg viewBox="0 0 360 300" {...svgProps} aria-label="Dos personas conversando de forma segura">
      <circle cx="180" cy="150" r="130" fill="#ffffff" fillOpacity="0.08" />
      <circle cx="180" cy="150" r="95" fill="#ffffff" fillOpacity="0.08" />
      {/* burbujas */}
      <g>
        <rect x="40" y="46" width="150" height="58" rx="18" fill="#ffffff" />
        <path d="M66 104l-8 16 24-16z" fill="#ffffff" />
        <rect x="60" y="64" width="90" height="8" rx="4" fill="#99f6e4" />
        <rect x="60" y="80" width="60" height="8" rx="4" fill="#ccfbf1" />
        <rect x="176" y="118" width="148" height="58" rx="18" fill="#34d399" />
        <path d="M298 176l10 16-26-16z" fill="#34d399" />
        <rect x="196" y="136" width="96" height="8" rx="4" fill="#ecfdf5" />
        <rect x="196" y="152" width="64" height="8" rx="4" fill="#a7f3d0" />
        <path d="M290 152l6 6 12-12" stroke="#065f46" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* persona izquierda */}
      <g>
        <circle cx="92" cy="196" r="20" fill="#fde7d4" />
        <path d="M72 192c0-16 12-24 22-24s20 8 20 20c-8-6-24-6-42 4z" fill="#134e4a" />
        <path d="M52 290c0-36 18-58 40-58s40 22 40 58z" fill="#06b6d4" />
        <rect x="100" y="250" width="30" height="44" rx="6" fill="#0e7490" transform="rotate(-12 115 272)" />
      </g>
      {/* persona derecha */}
      <g>
        <circle cx="268" cy="214" r="19" fill="#e7c3a3" />
        <path d="M248 210c2-14 12-20 21-20 10 0 18 6 19 18-10-4-26-4-40 2z" fill="#0f172a" fillOpacity="0.85" />
        <path d="M228 300c0-34 18-54 40-54s40 20 40 54z" fill="#ffffff" />
        <path d="M252 250l16 22 16-22" fill="none" stroke="#99f6e4" strokeWidth="4" />
      </g>
      {/* candado */}
      <g transform="translate(160 202)">
        <rect x="0" y="16" width="40" height="32" rx="8" fill="#ffffff" />
        <path d="M8 18v-6a12 12 0 0 1 24 0v6" stroke="#ffffff" strokeWidth="6" fill="none" />
        <circle cx="20" cy="31" r="4.5" fill="#0f766e" />
        <rect x="18" y="32" width="4" height="8" rx="2" fill="#0f766e" />
      </g>
    </svg>
  );
}

/** Lista de chats vacía. */
export function EmptyChatsIllustration() {
  return (
    <svg viewBox="0 0 240 180" {...svgProps} aria-label="Bandeja de chats vacía">
      <ellipse cx="120" cy="160" rx="90" ry="10" fill="var(--surface-3)" />
      <rect x="62" y="22" width="116" height="134" rx="16" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
      <rect x="62" y="22" width="116" height="30" rx="16" fill="#0f766e" />
      <rect x="62" y="40" width="116" height="12" fill="#0f766e" />
      <circle cx="80" cy="37" r="6" fill="#5eead4" />
      <rect x="92" y="33" width="44" height="7" rx="3.5" fill="#99f6e4" />
      <g opacity="0.9">
        <rect x="76" y="66" width="62" height="18" rx="9" fill="var(--surface-3)" />
        <rect x="102" y="92" width="62" height="18" rx="9" fill="#a7f3d0" />
        <rect x="76" y="118" width="44" height="18" rx="9" fill="var(--surface-3)" />
      </g>
      <g transform="translate(160 96)">
        <circle r="26" fill="#10b981" />
        <path d="M-10 0h20M0 -10v20" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" />
      </g>
      <circle cx="44" cy="58" r="5" fill="#67e8f9" />
      <circle cx="200" cy="40" r="4" fill="#5eead4" />
      <circle cx="30" cy="110" r="3" fill="#6ee7b7" />
    </svg>
  );
}

/** Panel principal sin conversación abierta (escritorio). */
export function SelectChatIllustration() {
  return (
    <svg viewBox="0 0 360 240" {...svgProps} aria-label="Computador y celular sincronizados">
      <ellipse cx="180" cy="222" rx="150" ry="12" fill="#0f766e" fillOpacity="0.08" />
      <rect x="56" y="34" width="210" height="140" rx="12" fill="var(--surface)" stroke="#99f6e4" strokeWidth="3" />
      <rect x="68" y="46" width="62" height="116" rx="6" fill="#f0fdfa" />
      <g fill="#99f6e4">
        <circle cx="80" cy="60" r="6" /><rect x="90" y="56" width="32" height="7" rx="3.5" />
        <circle cx="80" cy="82" r="6" /><rect x="90" y="78" width="28" height="7" rx="3.5" />
        <circle cx="80" cy="104" r="6" /><rect x="90" y="100" width="34" height="7" rx="3.5" />
      </g>
      <rect x="140" y="56" width="70" height="16" rx="8" fill="#ccfbf1" />
      <rect x="170" y="80" width="84" height="16" rx="8" fill="#a7f3d0" />
      <rect x="140" y="104" width="56" height="16" rx="8" fill="#ccfbf1" />
      <path d="M36 186h250l-12 16H48z" fill="#5eead4" />
      <rect x="250" y="88" width="66" height="120" rx="12" fill="#0f766e" />
      <rect x="256" y="100" width="54" height="96" rx="6" fill="#ecfeff" />
      <rect x="262" y="110" width="30" height="10" rx="5" fill="#a5f3fc" />
      <rect x="272" y="126" width="32" height="10" rx="5" fill="#6ee7b7" />
      <rect x="262" y="142" width="26" height="10" rx="5" fill="#a5f3fc" />
      <g transform="translate(268 160)">
        <rect x="0" y="9" width="20" height="16" rx="4" fill="#0f766e" />
        <path d="M4 10V6a6 6 0 0 1 12 0v4" stroke="#0f766e" strokeWidth="3" fill="none" />
      </g>
      <path d="M232 60c18-18 40-18 52 0" stroke="#22d3ee" strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="4 6" />
      <circle cx="300" cy="40" r="5" fill="#34d399" />
      <circle cx="40" cy="70" r="4" fill="#22d3ee" />
    </svg>
  );
}

/** Error de carga: nube desconectada. */
export function ErrorIllustration() {
  return (
    <svg viewBox="0 0 220 160" {...svgProps} aria-label="Sin conexión">
      <ellipse cx="110" cy="146" rx="70" ry="8" fill="var(--surface-3)" />
      <path d="M62 108a28 28 0 0 1 4-56 36 36 0 0 1 68-6 26 26 0 0 1 24 50z" fill="var(--surface)" stroke="#99f6e4" strokeWidth="3" />
      <path d="M92 86l8-8 8 8 8-8 8 8" stroke="#0f766e" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M102 112c4-4 12-4 16 0" stroke="#0f766e" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d="M150 116v18M142 126l8 8 8-8" stroke="#22d3ee" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <circle cx="44" cy="40" r="4" fill="#67e8f9" />
      <circle cx="184" cy="30" r="5" fill="#6ee7b7" />
    </svg>
  );
}

/** Sin resultados de búsqueda. */
export function NoResultsIllustration() {
  return (
    <svg viewBox="0 0 200 150" {...svgProps} aria-label="Sin resultados">
      <ellipse cx="100" cy="138" rx="64" ry="7" fill="var(--surface-3)" />
      <circle cx="88" cy="66" r="40" fill="var(--surface)" stroke="#5eead4" strokeWidth="8" />
      <path d="M118 96l34 34" stroke="#0f766e" strokeWidth="12" strokeLinecap="round" />
      <path d="M74 60h28M74 76h18" stroke="#99f6e4" strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}
