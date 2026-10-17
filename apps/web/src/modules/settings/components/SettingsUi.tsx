import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

/** Contenedor de cada pantalla de Ajustes: ancho de lectura cómodo y desplazamiento propio. */
export function SettingsPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex-1 overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-3 pt-3 pb-8 sm:px-4 md:gap-6 md:px-6 md:pt-6 lg:px-8">{children}</div>
    </div>
  );
}

/** Encabezado de una sección: volver a Ajustes, título y explicación. */
export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="flex items-start gap-2">
      <Link
        to=".."
        relative="path"
        aria-label="Volver a Ajustes"
        title="Volver a Ajustes"
        className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink"
      >
        <ArrowLeft className="size-5" />
      </Link>
      <div className="min-w-0 pt-1">
        <h1 className="text-xl font-extrabold text-ink md:text-2xl">{title}</h1>
        <p className="mt-0.5 text-sm text-ink-soft">{description}</p>
      </div>
    </header>
  );
}

/** Bloque con título pequeño en mayúsculas y filas separadas por líneas finas. */
export function SettingsGroup({ title, children, footer }: { title?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <section>
      {title && <h2 className="mb-2 px-4 text-xs font-bold tracking-wider text-ink-faint uppercase">{title}</h2>}
      <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface shadow-float">{children}</div>
      {footer && <p className="mt-2 px-4 text-xs text-ink-faint">{footer}</p>}
    </section>
  );
}

/** Contenido libre dentro de un grupo (formularios, interruptores, textos). */
export function SettingsBlock({ children }: { children: ReactNode }) {
  return <div className="p-4 md:px-5">{children}</div>;
}

interface SettingsRowProps {
  to: string;
  icon: LucideIcon;
  title: string;
  summary?: string;
}

/** Fila que abre una sección: ícono, título, resumen y flecha. */
export function SettingsRow({ to, icon: Icon, title, summary }: SettingsRowProps) {
  return (
    <Link to={to} className="group flex items-center gap-4 px-4 py-3.5 transition-colors duration-200 hover:bg-surface-2 md:px-5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand dark:bg-teal-950/60 dark:text-teal-300">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-ink">{title}</span>
        {summary && <span className="block truncate text-sm text-ink-soft">{summary}</span>}
      </span>
      <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
    </Link>
  );
}

/** Dato de solo lectura: etiqueta a la izquierda, valor a la derecha. */
export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-5">
      <span className="text-sm text-ink-soft">{label}</span>
      <span className="truncate text-right text-[15px] font-medium text-ink">{value}</span>
    </div>
  );
}
