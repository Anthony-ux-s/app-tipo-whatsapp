import { Star } from 'lucide-react';

/** Estrellas de solo lectura (1 a 5), con el número para lectores de pantalla. */
export function Stars({ value, className = 'size-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={`${value} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${className} ${n <= Math.round(value) ? 'fill-amber-400 text-amber-400' : 'text-ink-faint'}`} />
      ))}
    </span>
  );
}

/** Elegir de 1 a 5 estrellas (botones grandes, cómodos en el celular). */
export function StarPicker({ value, onChange, label }: { value: number | null; onChange: (n: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} ${n === 1 ? 'estrella' : 'estrellas'}`}
          onClick={() => onChange(n)}
          className="rounded-full p-1 transition-transform duration-150 hover:scale-110 active:scale-95"
        >
          <Star className={`size-8 ${value !== null && n <= value ? 'fill-amber-400 text-amber-400' : 'text-ink-faint'}`} />
        </button>
      ))}
    </div>
  );
}
