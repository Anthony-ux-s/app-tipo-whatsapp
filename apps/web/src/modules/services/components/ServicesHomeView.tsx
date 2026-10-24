import type { ServiceId, StoreSummary } from '@parla/types';
import { BadgeCheck, ChevronRight, Lock, Search, Store } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router';
import { useBusinessStore } from '@shared/stores/business.store';
import { useSessionStore } from '@shared/stores/session.store';
import { ProfileButton } from '@shared/ui/ProfileButton';
import { EmptyState, ErrorState } from '@shared/ui/States';
import { NoResultsIllustration } from '@shared/ui/illustrations';
import { formatSoles } from '@shared/utils/money';
import { isServiceId, SERVICE_IDS, SERVICE_VISUALS } from '../const/services.const';
import { useProductSearch, useAllStores } from '../hooks/use-product-search.hook';
import { useServices } from '../hooks/use-services.hook';
import { ProductCard } from './ProductCard';
import { CartBar, OrderStatusBadge, PageHeader, ServicePage } from './ServicesUi';

/** Ícono 3D (Fluent Emoji, MIT) en /public/services. */
function Art({ name, className }: { name: string; className: string }) {
  return <img src={`/services/${name}.png`} alt="" className={`object-contain ${className}`} draggable={false} />;
}

/** Servicios dentro de Parla: todos los productos de todas las tiendas en tarjetas, con botones de categoría y buscador. */
export function ServicesHomeView() {
  const s = useServices();
  const business = useBusinessStore((b) => b.business);
  const isSupport = useSessionStore((st) => !!st.user?.isAdmin);
  const storesIn = (id: ServiceId) => s.categories?.find((c) => c.service === id)?.stores ?? 0;
  const all = useAllStores();
  const search = useProductSearch(all.stores);
  return (
    <ServicePage wide footer={<CartBar count={search.count} estimateCents={search.estimate} onOpen={search.goToCart} />}>
      <PageHeader title="Servicios" subtitle="Compra, paga y recibe sin salir de Parla." action={<ProfileButton />} />

      {s.error && <ErrorState message={s.error} onRetry={s.retry} />}

      <label className="relative block">
        <span className="sr-only">Buscar productos en todas las tiendas</span>
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-faint" />
        <input
          type="search"
          value={search.text}
          onChange={(e) => search.setText(e.target.value)}
          placeholder="Busca zapatillas, audífonos, ropa, un martillo…"
          data-testid="global-search"
          className="h-12 w-full rounded-2xl bg-surface pr-4 pl-11 text-[15px] text-ink shadow-float outline-none ring-1 ring-line focus:ring-2 focus:ring-brand"
        />
      </label>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-start">
      <div className="flex min-w-0 flex-col gap-5 md:gap-6">
      {search.tooShort && <p className="px-1 text-sm text-ink-soft">Escribe al menos 2 letras para buscar.</p>}

      <nav aria-label="Categorías" className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0" data-testid="category-chips">
        {(['todos', ...SERVICE_IDS] as const).map((id) => {
          const active = search.category === id;
          const label = id === 'todos' ? 'Todos' : SERVICE_VISUALS[id].title;
          const count = id === 'todos' ? null : storesIn(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => search.setCategory(id)}
              aria-pressed={active}
              data-testid={`service-${id}`}
              className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-sm font-semibold ring-1 transition-colors duration-200 ${active ? 'bg-brand text-white ring-brand' : 'bg-surface text-ink ring-line hover:bg-surface-2'}`}
            >
              {id !== 'todos' && <Art name={SERVICE_VISUALS[id].art} className="size-5" />}
              {label}
              {count !== null && count > 0 && <span className={`text-xs ${active ? 'text-white/80' : 'text-ink-faint'}`}>{count}</span>}
            </button>
          );
        })}
      </nav>

      <ProductResults search={search} />

      {business === null && !isSupport && (
        <Link
          to="/app/negocio/nueva"
          data-testid="open-store-banner"
          className="group flex items-center gap-3 rounded-2xl bg-gradient-to-br from-teal-50 to-amber-50 p-3 ring-1 ring-teal-100 transition-colors duration-200 hover:ring-teal-300 md:px-4 dark:from-teal-950/50 dark:to-amber-950/20 dark:ring-teal-900"
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/80 text-brand dark:bg-black/20 dark:text-teal-300">
            <Store className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-ink">¿Tienes una tienda? Ábrela en Parla</span>
            <span className="block text-xs text-ink-soft">Registra tu negocio, sube tus productos y recibe pedidos con delivery.</span>
          </span>
          <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      )}

      <Link
        to="/app/pedidos"
        className="group flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-float transition-colors duration-200 hover:bg-surface-2 md:px-4"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-50 to-amber-100 ring-1 ring-amber-200/70 dark:from-orange-950 dark:to-amber-900 dark:ring-amber-800">
          <Art name="pedidos" className="size-7 drop-shadow-[0_3px_4px_rgba(15,23,42,0.18)]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-ink">Mis pedidos</span>
          <span className="block truncate text-xs text-ink-soft">
            {s.latestOrder ? `Último: ${formatSoles(s.latestOrder.totalCents)} · ${s.latestOrder.lines.length} productos` : 'Aquí verás tus compras y su seguimiento'}
          </span>
        </span>
        {s.latestOrder && <OrderStatusBadge status={s.latestOrder.status} />}
        <ChevronRight className="size-5 shrink-0 text-ink-faint transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>

      <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-faint">
        <Lock className="size-3.5" /> Los precios y el total los confirma la tienda; pagas con QR y el delivery llega a tu puerta.
      </p>
      </div>
      <StoresSidebar stores={all.stores} error={all.error} onRetry={all.retry} />
      </div>
    </ServicePage>
  );
}

/** Los productos de todas las tiendas (o los que coinciden con la búsqueda), en tarjetas. */
function ProductResults({ search }: { search: ReturnType<typeof useProductSearch> }) {
  const pool = useMemo(() => (search.products ?? []).flatMap((product) => { const st = search.storeOf(product); return st ? [{ product, storeId: st.id, storeName: st.name }] : []; }), [search.products]);
  if (search.error) return <ErrorState message={search.error} onRetry={search.retry} />;
  if (search.loading || !search.products) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Buscando">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-60 animate-pulse rounded-2xl bg-surface-3" />
        ))}
      </div>
    );
  }
  if (search.products.length === 0) {
    return <EmptyState compact illustration={<NoResultsIllustration />} title={search.term ? "No encontramos eso" : "Aún no hay productos"} description={search.term ? `Ninguna tienda abierta tiene «${search.term}» por ahora. Prueba con otra palabra.` : "Las tiendas abiertas todavía no tienen productos en esta categoría."} />;
  }
  return (
    <section aria-label="Resultados" className="flex flex-col gap-3">
      <p className="px-1 text-sm text-ink-soft" data-testid="search-count">
        {search.products.length} {search.products.length === 1 ? 'producto' : 'productos'}{search.term ? ` para «${search.term}»` : ''}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" data-testid="search-results">
        {search.products.map((product) => (
          <ProductCard key={`${search.storeOf(product)?.id}-${product.id}`} product={product} storeId={search.storeOf(product)?.id} storeName={search.storeOf(product)?.name} pool={pool} quantity={search.quantityOf(product)} onAdd={() => search.add(product)} onSubtract={() => search.subtract(product)} />
        ))}
      </div>
    </section>
  );
}

/** Todas las tiendas de Parla, a la derecha (o debajo en el celular). */
function StoresSidebar({ stores, error, onRetry }: { stores: StoreSummary[] | null; error: string | null; onRetry: () => void }) {
  return (
    <aside aria-label="Todas las tiendas" data-testid="all-stores" className="rounded-2xl bg-surface p-3 shadow-float lg:sticky lg:top-0">
      <h2 className="px-1 pb-2 text-sm font-bold text-ink">Todas las tiendas{stores ? ` (${stores.length})` : ''}</h2>
      {error && <ErrorState message={error} onRetry={onRetry} />}
      {!stores && !error && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-3" />
          ))}
        </div>
      )}
      {stores?.length === 0 && <p className="px-1 py-3 text-sm text-ink-soft">Aún no hay tiendas.</p>}
      {stores && stores.length > 0 && (
        <ul className="flex max-h-[28rem] flex-col gap-1 overflow-y-auto lg:max-h-[calc(100vh-14rem)]">
          {stores.map((store) => (
            <li key={store.id}>
              <Link to={`/app/servicios/${store.id}`} data-testid="all-stores-item" className="flex items-center gap-3 rounded-xl p-2 transition-colors duration-200 hover:bg-surface-2">
                <img src={`/services/${isServiceId(store.service) ? SERVICE_VISUALS[store.service].art : 'mercado'}.png`} alt="" className="size-9 shrink-0 object-contain" draggable={false} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 truncate text-sm font-semibold text-ink">
                    <span className="truncate">{store.name}</span>
                    {store.verified && <BadgeCheck className="size-3.5 shrink-0 text-brand dark:text-teal-300" aria-label="Verificada" />}
                  </span>
                  <span className="block truncate text-xs text-ink-soft">
                    {isServiceId(store.service) ? SERVICE_VISUALS[store.service].title : store.service} · {store.open ? 'Abierta' : 'Cerrada'}
                  </span>
                </span>
                <ChevronRight className="size-4 shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
