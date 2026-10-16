interface LogoMarkProps {
  className?: string;
}

/** Marca de Parla: dos burbujas entrelazadas con una marca de verificación. */
export function LogoMark({ className = 'size-9' }: LogoMarkProps) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path
        d="M20 5h17a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8h-1v6l-7-6h-9a8 8 0 0 1-8-8V13a8 8 0 0 1 8-8z"
        fill="#34d399"
      />
      <path
        d="M11 15h16a8 8 0 0 1 8 8v10a8 8 0 0 1-8 8H17l-8 6v-6.4A8 8 0 0 1 3 33V23a8 8 0 0 1 8-8z"
        fill="#0f766e"
        stroke="var(--surface)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M12.5 28.5l4.5 4.5 8.5-9"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface LogoProps {
  className?: string;
  tone?: 'brand' | 'light';
}

export function Logo({ className = '', tone = 'brand' }: LogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark className="size-9" />
      <span
        className={`font-display text-2xl font-extrabold tracking-tight ${tone === 'light' ? 'text-white' : 'text-ink'}`}
      >
        parla
      </span>
    </span>
  );
}
