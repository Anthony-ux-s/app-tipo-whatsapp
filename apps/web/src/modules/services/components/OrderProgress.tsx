import { Check } from 'lucide-react';
import type { ReactNode } from 'react';

interface OrderProgressProps {
  /** Nombres de los pasos, en orden. */
  steps: readonly string[];
  /** Paso en el que va el pedido (0 = el primero). Si `finished`, todos quedan hechos. */
  current: number;
  finished?: boolean;
  /** Lo que pasa ahora, dicho en una frase, y la explicación corta de qué sigue. */
  title: string;
  description?: string;
  /** Botones de lo que toca hacer en este paso. */
  children?: ReactNode;
}

/**
 * El pedido paso a paso: los pasos arriba (hechos, el actual y los que faltan) y debajo, en grande, qué
 * está pasando ahora y qué hay que hacer. Pensado para el celular: letras chicas y un solo paso a la vista.
 */
export function OrderProgress({ steps, current, finished = false, title, description, children }: OrderProgressProps) {
  const position = finished ? steps.length : current + 1;
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-surface p-3 shadow-float md:p-5" aria-label="Seguimiento del pedido" data-testid="order-progress">
      <ol className="flex items-start" aria-label="Pasos del pedido">
        {steps.map((label, index) => {
          const done = finished || index < current;
          const active = !finished && index === current;
          return (
            <li key={label} className="relative flex min-w-0 flex-1 flex-col items-center gap-1 text-center" aria-current={active ? 'step' : undefined}>
              {index > 0 && <span aria-hidden="true" className={`absolute top-3 right-1/2 h-0.5 w-full ${done || active ? 'bg-brand' : 'bg-line'}`} />}
              <span
                className={`relative flex size-6 items-center justify-center rounded-full text-[11px] font-bold transition-colors duration-300 ${done ? 'bg-brand text-white' : active ? 'bg-teal-100 text-ink ring-2 ring-teal-500 dark:bg-teal-900/60' : 'bg-surface-3 text-ink-faint'}`}
              >
                {done ? <Check className="size-3.5" /> : index + 1}
              </span>
              <span className={`text-[10px] leading-tight font-semibold md:text-xs ${done || active ? 'text-ink' : 'text-ink-faint'}`}>{label}</span>
            </li>
          );
        })}
      </ol>
      <div className="flex flex-col gap-1 rounded-xl bg-surface-2 p-3" data-testid="order-progress-now">
        <p className="text-[10px] font-bold tracking-wider text-ink-faint uppercase">{finished ? 'Listo' : `Paso ${position} de ${steps.length}`}</p>
        <h2 className="text-[15px] leading-snug font-extrabold text-ink md:text-base">{title}</h2>
        {description && <p className="text-[13px] leading-snug text-ink-soft md:text-sm">{description}</p>}
        {children && <div className="mt-2 flex flex-col gap-2">{children}</div>}
      </div>
    </section>
  );
}
