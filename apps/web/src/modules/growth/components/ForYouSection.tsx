import type { Product } from '@parla/types';
import { Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ForYou } from '../utils/roulette.utils';

/** «Pensado para ti»: las ofertas de lo que la persona más compra y busca. No se dibuja si no hay nada. */
export function ForYouSection({ forYou, render }: { forYou: ForYou; render: (product: Product) => ReactNode }) {
  if (!forYou.products.length) return null;
  const why = forYou.categories.length ? `Porque sueles comprar y buscar ${forYou.categories.join(' y ')}` : 'Según lo que compras y buscas';
  return (
    <section aria-label="Ofertas para ti" data-testid="for-you" className="flex flex-col gap-3 rounded-3xl bg-gradient-to-br from-teal-50 to-amber-50 p-3 ring-1 ring-teal-100 md:p-4 dark:from-teal-950/50 dark:to-amber-950/20 dark:ring-teal-900">
      <header className="flex items-center gap-3 px-1">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-white">
          <Sparkles className="size-[18px]" />
        </span>
        <span className="min-w-0">
          <span className="block font-bold text-ink">Pensado para ti</span>
          <span className="block truncate text-xs text-ink-soft">{why}</span>
        </span>
      </header>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{forYou.products.map((p) => render(p))}</div>
    </section>
  );
}
