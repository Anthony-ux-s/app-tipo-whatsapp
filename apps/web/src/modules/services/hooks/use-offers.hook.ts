import type { Product, StoreSummary } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { errorMessage, http } from '@shared/utils/http';
import { discountPercent } from '../utils/services.utils';

/** Cuántas tiendas abiertas se consultan para armar las ofertas. */
const MAX_STORES = 6;

export interface OfferStore {
  id: string;
  name: string;
}

interface OfferEntry {
  product: Product;
  store: OfferStore;
}

/**
 * Ofertas: los productos rebajados de varias tiendas de Mercado (se compran con el mismo carrito, que es
 * de una sola tienda: al agregar algo de otra tienda, el carrito anterior se reemplaza).
 */
export function useOffers() {
  const navigate = useNavigate();
  const cartService = useCartStore((s) => s.service);
  const items = useCartStore((s) => s.items);
  const change = useCartStore((s) => s.change);
  const query = useQuery({
    queryKey: ['offers'],
    queryFn: async (): Promise<OfferEntry[]> => {
      const stores = (await http.get<StoreSummary[]>('/stores?service=mercado')).filter((s) => s.open).slice(0, MAX_STORES);
      const results = await Promise.allSettled(stores.map((s) => http.get<Product[]>(`/services/${encodeURIComponent(s.id)}/products?q=`)));
      // Si todas fallaron, es un error; si solo falló alguna, se muestran las demás.
      if (stores.length > 0 && results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
      const all: OfferEntry[] = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        for (const product of r.value) all.push({ product, store: { id: stores[i]!.id, name: stores[i]!.name } });
      });
      return all;
    },
  });
  const products = useMemo(() => (query.data ? query.data.map((e) => e.product) : null), [query.data]);
  /** De qué tienda es cada producto (por referencia: dos tiendas pueden repetir códigos). */
  const storeOf = useMemo(() => new Map((query.data ?? []).map((e) => [e.product, e.store] as const)), [query.data]);
  const error = products ? null : query.error ? errorMessage(query.error) : null;

  /** Productos en oferta, del mayor descuento al menor. */
  const offers = useMemo(
    () =>
      (products ?? [])
        .filter((p) => discountPercent(p.priceCents, p.listPriceCents) > 0)
        .sort((a, b) => discountPercent(b.priceCents, b.listPriceCents) - discountPercent(a.priceCents, a.listPriceCents)),
    [products],
  );

  const own = (storeId: string) => (cartService === storeId ? items : {});

  return {
    offers,
    catalog: products,
    storeOf: (product: Product) => storeOf.get(product) ?? null,
    loading: !products && !error,
    error,
    count: cartCount(items),
    estimate: cartEstimateCents(items),
    quantityOf: (product: Product) => {
      const store = storeOf.get(product);
      return store ? (own(store.id)[product.id]?.quantity ?? 0) : 0;
    },
    add: (product: Product) => {
      const store = storeOf.get(product);
      if (store) change(product, 1, store.id);
    },
    subtract: (product: Product) => {
      const store = storeOf.get(product);
      if (store) change(product, -1, store.id);
    },
    retry: () => void query.refetch(),
    goToCart: () => navigate(cartService ? `/app/servicios/${cartService}/carrito` : '/app/servicios'),
  };
}
