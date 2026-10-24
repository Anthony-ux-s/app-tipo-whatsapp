import type { ServiceId } from '@parla/types';
import { Check, Menu, Package, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { EmptyState, ErrorState } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { SERVICE_IDS, SERVICE_VISUALS } from '../const/services.const';
import { useAllStores, useProductSearch } from '../hooks/use-product-search.hook';
import { useServices } from '../hooks/use-services.hook';
import { ProductCard } from './ProductCard';
import { CartBar, PageHeader, ServicePage } from './ServicesUi';

/** Ícono 3D (Fluent Emoji, MIT) en /public/services. */
function Art({ name, className }: { name: string; className: string }) {
  return <img src={`/services/${name}.png`} alt="" className={`object-contain ${className}`} draggable={false} />;
}

/**
 * Servicios: los productos de todas las tiendas en tarjetas. Arriba, en una sola fila, el buscador y el menú ☰ para
 * filtrar por categoría. El cliente compra productos, no «una tienda»: por eso no hay lista de tiendas.
 */
export function ServicesHomeView() {
  const s = useServices();
  const all = useAllStores();
  const search = useProductSearch(all.stores);
  const storesIn = (id: ServiceId) => s.categories?.find((c) => c.service === id)?.stores ?? 0;
  return (
    <ServicePage wide footer={<CartBar count={search.count} estimateCents={search.estimate} onOpen={search.goToCart} />}>
      <PageHeader
        title="Servicios"
        action={
          <span className="flex items-center gap-1">
            <Link to="/app/pedidos" aria-label="Mis pedidos" title="Mis pedidos" data-testid="my-orders-button" className="inline-flex size-10 items-center justify-center rounded-full text-ink-soft transition-colors duration-200 hover:bg-surface-3 hover:text-ink">
              <Package className="size-5" />
            </Link>
            <ProfileButton />
          </span>
        }
      />

      {s.error && <ErrorState message={s.error} onRetry={s.retry} />}

      <div className="flex items-center gap-2">
        <label className="relative block min-w-0 flex-1">
          <span className="sr-only">Buscar productos en todas las tiendas</span>
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-faint" />
          <input
            type="search"
            value={search.text}
            onChange={(e) => search.setText(e.target.value)}
            placeholder="Busca zapatillas, audífonos, ropa…"
            data-testid="global-search"
            className="h-12 w-full rounded-2xl bg-surface pr-4 pl-11 text-[15px] text-ink shadow-float ring-1 ring-line outline-none focus:ring-2 focus:ring-brand"
          />
        </label>
        <CategoryMenu value={search.category} onChange={search.setCategory} countOf={storesIn} />
      </div>
      {search.tooShort && <p className="px-1 text-sm text-ink-soft">Escribe al menos 2 letras para buscar.</p>}

      <ProductResults search={search} />
    </ServicePage>
  );
}

/** Botón ☰ que abre la lista de categorías (Todos, Mercado, Tecnología…) y filtra los productos. */
function CategoryMenu({ value, onChange, countOf }: { value: ServiceId | 'todos'; onChange: (id: ServiceId | 'todos') => void; countOf: (id: ServiceId) => number }) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const options: (ServiceId | 'todos')[] = ['todos', ...SERVICE_IDS];
  const labelOf = (id: ServiceId | 'todos') => (id === 'todos' ? 'Todos' : SERVICE_VISUALS[id].title);
  return (
    <div ref={host} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Categorías: ${labelOf(value)}`}
        title="Categorías"
        data-testid="category-menu"
        className={`inline-flex h-12 items-center gap-2 rounded-2xl px-3.5 text-sm font-semibold shadow-float ring-1 transition-colors duration-200 ${value === 'todos' ? 'bg-surface text-ink ring-line hover:bg-surface-2' : 'bg-brand text-white ring-brand'}`}
      >
        <Menu className="size-5" />
        {value !== 'todos' && <span className="hidden max-w-24 truncate sm:inline">{labelOf(value)}</span>}
      </button>
      {open && (
        <ul role="menu" aria-label="Categorías" className="absolute right-0 z-20 mt-2 w-60 overflow-hidden rounded-2xl bg-surface p-1.5 shadow-pop ring-1 ring-line">
          {options.map((id) => {
            const active = value === id;
            const count = id === 'todos' ? 0 : countOf(id);
            return (
              <li key={id} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={active}
                  data-testid={`service-${id}`}
                  onClick={() => {
                    onChange(id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition-colors ${active ? 'bg-teal-50 text-ink dark:bg-teal-950/60' : 'text-ink hover:bg-surface-2'}`}
                >
                  {id === 'todos' ? <Menu className="size-5 shrink-0 text-ink-soft" /> : <Art name={SERVICE_VISUALS[id].art} className="size-6 shrink-0" />}
                  <span className="min-w-0 flex-1 truncate">{labelOf(id)}</span>
                  {id !== 'todos' && count > 0 && <span className="text-xs font-normal text-ink-faint">{count}</span>}
                  {active && <Check className="size-4 shrink-0 text-brand dark:text-teal-300" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Los productos de todas las tiendas (o los que coinciden con la búsqueda), en tarjetas. */
function ProductResults({ search }: { search: ReturnType<typeof useProductSearch> }) {
  const pool = useMemo(
    () =>
      (search.products ?? []).flatMap((product) => {
        const st = search.storeOf(product);
        return st ? [{ product, storeId: st.id, storeName: st.name }] : [];
      }),
    [search.products], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (search.error) return <ErrorState message={search.error} onRetry={search.retry} />;
  if (search.loading || !search.products) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-busy="true" aria-label="Buscando">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="h-60 animate-pulse rounded-2xl bg-surface-3" />
        ))}
      </div>
    );
  }
  if (search.products.length === 0) {
    return (
      <EmptyState
        compact
        illustration={<NoResultsIllustration />}
        title={search.term ? 'No encontramos eso' : 'Aún no hay productos'}
        description={search.term ? `Ninguna tienda abierta tiene «${search.term}» por ahora. Prueba con otra palabra.` : 'Las tiendas abiertas todavía no tienen productos en esta categoría.'}
      />
    );
  }
  return (
    <section aria-label="Resultados" className="flex flex-col gap-3">
      <p className="px-1 text-sm text-ink-soft" data-testid="search-count">
        {search.products.length} {search.products.length === 1 ? 'producto' : 'productos'}
        {search.term ? ` para «${search.term}»` : ''}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" data-testid="search-results">
        {search.products.map((product) => (
          <ProductCard
            key={`${search.storeOf(product)?.id}-${product.id}`}
            product={product}
            storeId={search.storeOf(product)?.id}
            storeName={search.storeOf(product)?.name}
            pool={pool}
            quantity={search.quantityOf(product)}
            onAdd={() => search.add(product)}
            onSubtract={() => search.subtract(product)}
          />
        ))}
      </div>
    </section>
  );
}
