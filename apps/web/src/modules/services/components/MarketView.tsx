import { Search, X } from 'lucide-react';
import { EmptyState, ErrorState } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { useMarket } from '../hooks/use-market.hook';
import { ProductCard } from './ProductCard';
import { CartBar, PageHeader, ServicePage } from './ServicesUi';

/** Mercado (tienda MercaYa): se escribe la lista como se habla y se arma el carrito. */
export function MarketView() {
  const m = useMarket();
  return (
    <ServicePage
      footer={<CartBar count={m.count} estimateCents={m.estimate} onOpen={m.goToCart} />}
    >
      <PageHeader title="Mercado" subtitle="Tienda MercaYa · delivery MotoYa · pago con QR" onBack={m.back} />

      <form onSubmit={m.search} className="flex flex-col gap-2" role="search">
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3.5 size-5 text-ink-faint" />
          <input
            type="search"
            value={m.query}
            onChange={(e) => m.onQueryChange(e.target.value)}
            placeholder="¿Qué necesitas? ej. un kilo de azúcar, arroz"
            aria-label="Buscar productos"
            className="h-12 w-full rounded-2xl bg-surface pr-24 pl-11 text-[15px] text-ink shadow-float outline-none placeholder:text-ink-faint focus:ring-2 focus:ring-teal-500/40"
          />
          <button type="submit" className="absolute right-1.5 h-9 rounded-xl bg-brand px-4 text-sm font-bold text-white hover:bg-brand-strong">
            Buscar
          </button>
        </label>
        {m.terms.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
            Buscando:
            {m.terms.map((term) => (
              <span key={term} className="rounded-full bg-teal-100 px-2.5 py-1 font-semibold text-teal-900 dark:bg-teal-900/60 dark:text-teal-100">
                {term}
              </span>
            ))}
            <button type="button" onClick={m.clearSearch} className="inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold hover:bg-surface-3">
              <X className="size-3.5" /> Ver todo
            </button>
          </div>
        )}
      </form>

      {m.error && <ErrorState message={m.error} onRetry={m.retry} />}

      {!m.groups && !m.error && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="h-60 animate-pulse rounded-2xl bg-surface-3" />
          ))}
        </div>
      )}

      {m.groups?.map((group) => (
        <section key={group.term ?? 'todo'} aria-label={group.term ? `Resultados para ${group.term}` : 'Todos los productos'}>
          {group.term && <h2 className="mb-2 px-1 text-sm font-bold text-ink-soft">«{group.term}»</h2>}
          {group.products.length === 0 ? (
            <EmptyState compact illustration={<NoResultsIllustration />} title="Sin resultados" description={`MercaYa no tiene «${group.term}» por ahora.`} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {group.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={m.quantityOf(product.id)}
                  onAdd={() => m.add(product)}
                  onSubtract={() => m.subtract(product)}
                />
              ))}
            </div>
          )}
        </section>
      ))}
    </ServicePage>
  );
}
