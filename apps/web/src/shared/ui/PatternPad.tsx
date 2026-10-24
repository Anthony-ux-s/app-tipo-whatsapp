import { useRef, useState, type PointerEvent } from 'react';

interface PatternPadProps {
  /** El patrón dibujado: los puntos (0 al 8, de arriba a la izquierda a abajo a la derecha) en orden. */
  onComplete: (pattern: string) => void;
  disabled?: boolean;
  error?: boolean;
  size?: number;
}

const COLS = 3;
/** Qué tan cerca (en fracción de la celda) hay que pasar de un punto para tomarlo. */
const HIT = 0.42;

/** Cuadrícula de 3×3 para dibujar un patrón con el dedo o el mouse, uniendo los puntos sin repetir. */
export function PatternPad({ onComplete, disabled = false, error = false, size = 260 }: PatternPadProps) {
  const [path, setPath] = useState<number[]>([]);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const host = useRef<HTMLDivElement>(null);
  const drawing = useRef(false);
  const cell = size / COLS;
  const center = (i: number) => ({ x: (i % COLS) * cell + cell / 2, y: Math.floor(i / COLS) * cell + cell / 2 });

  const local = (event: PointerEvent): { x: number; y: number } => {
    const box = host.current!.getBoundingClientRect();
    return { x: ((event.clientX - box.left) / box.width) * size, y: ((event.clientY - box.top) / box.height) * size };
  };
  const dotAt = (p: { x: number; y: number }): number | null => {
    for (let i = 0; i < COLS * COLS; i++) {
      const c = center(i);
      if (Math.hypot(p.x - c.x, p.y - c.y) <= cell * HIT) return i;
    }
    return null;
  };
  const take = (p: { x: number; y: number }) => {
    const dot = dotAt(p);
    if (dot !== null) setPath((current) => (current.includes(dot) ? current : [...current, dot]));
  };

  const down = (event: PointerEvent) => {
    if (disabled) return;
    host.current?.setPointerCapture(event.pointerId);
    drawing.current = true;
    setPath([]);
    const p = local(event);
    setPointer(p);
    take(p);
  };
  const move = (event: PointerEvent) => {
    if (!drawing.current) return;
    const p = local(event);
    setPointer(p);
    take(p);
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    setPointer(null);
    setPath((final) => {
      if (final.length > 0) onComplete(final.join(''));
      // Se limpia enseguida si fue un error, o tras un instante para que se alcance a ver.
      window.setTimeout(() => setPath([]), 350);
      return final;
    });
  };

  const color = error ? '#e11d48' : 'var(--color-brand, #0d9488)';
  const points = path.map(center);
  return (
    <div
      ref={host}
      data-testid="pattern-pad"
      role="application"
      aria-label="Dibuja tu patrón uniendo los puntos"
      className={`relative touch-none select-none ${error ? 'animate-shake' : ''}`}
      style={{ width: size, height: size }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <svg width={size} height={size} className="pointer-events-none absolute inset-0">
        {points.length > 1 && <polyline points={points.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke={color} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} />}
        {drawing.current && pointer && points.length > 0 && <line x1={points[points.length - 1]!.x} y1={points[points.length - 1]!.y} x2={pointer.x} y2={pointer.y} stroke={color} strokeWidth={6} strokeLinecap="round" opacity={0.5} />}
        {Array.from({ length: COLS * COLS }, (_, i) => {
          const c = center(i);
          const on = path.includes(i);
          return (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={on ? 16 : 7} fill={on ? color : 'var(--color-ink-faint, #94a3b8)'} opacity={on ? 0.25 : 1} />
              {on && <circle cx={c.x} cy={c.y} r={7} fill={color} />}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
