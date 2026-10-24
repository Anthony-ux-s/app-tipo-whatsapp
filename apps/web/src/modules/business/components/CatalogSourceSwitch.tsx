import type { CatalogSource } from '@parla/types';
import { Plug, Tags } from 'lucide-react';
import { Link } from 'react-router';

const OPTIONS: { source: CatalogSource; to: string; title: string; description: string; icon: typeof Tags }[] = [
  {
    source: 'native',
    to: '/app/negocio/catalogo',
    title: 'Catálogo de Parla',
    description: 'Subes tus productos aquí, uno por uno o con un archivo, y Parla los muestra a tus clientes.',
    icon: Tags,
  },
  {
    source: 'api',
    to: '/app/negocio/conectar',
    title: 'Mi propio sistema',
    description: 'Si ya tienes un sistema o una tienda en línea, Parla consulta tus productos y precios directamente de ahí.',
    icon: Plug,
  },
];

/** Las dos formas de tener productos en la tienda; se puede pasar de una a otra cuando quiera. */
export function CatalogSourceSwitch({ current, source }: { current: CatalogSource; source: CatalogSource }) {
  return (
    <nav className="grid gap-2 sm:grid-cols-2" aria-label="De dónde salen tus productos" data-testid="catalog-source-switch">
      {OPTIONS.map((option) => {
        const shown = option.source === current;
        const Icon = option.icon;
        return (
          <Link
            key={option.source}
            to={option.to}
            aria-current={shown ? 'page' : undefined}
            className={`flex flex-col gap-1 rounded-2xl p-3 transition-colors duration-200 ${shown ? 'bg-teal-50 ring-2 ring-brand dark:bg-teal-950/60' : 'bg-surface shadow-float hover:bg-surface-2'}`}
          >
            <span className="flex items-center gap-2 text-[15px] font-bold text-ink">
              <Icon className="size-[18px] text-brand dark:text-teal-300" /> {option.title}
              {option.source === source && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-ink dark:bg-emerald-900/50 dark:text-ink">En uso</span>}
            </span>
            <span className="text-xs text-ink-soft">{option.description}</span>
          </Link>
        );
      })}
    </nav>
  );
}
