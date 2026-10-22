import type { Product, StoreSummary } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
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

/**
 * Ofertas: los productos rebajados de varias tiendas de Mercado (se compran con el mismo carrito, que es
 * de una sola tienda: al agregar algo de otra tienda, el carrito anterior se reemplaza).
 */
export function useOffers() {
  const navigate = useNavigate();
  const cartService = useCartStore((s) => s.service);
  const items = useCartStore((s) => s.items);
  const change = useCartStore((s) => s.change);
  const [products, setProducts] = useState<Product[] | null>(null);
  /** De qué tienda es cada producto (por referencia: dos tiendas pueden repetir códigos). */
  const [storeOf, setStoreOf] = useState<Map<Product, OfferStore>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    setProducts(null);
    (async () => {
      const stores = (await http.get<StoreSummary[]>('/stores?service=mercado')).filter((s) => s.open).slice(0, MAX_STORES);
      const results = await Promise.allSettled(stores.map((s) => http.get<Product[]>(`/services/${encodeURIComponent(s.id)}/products?q=`)));
      // Si todas fallaron, es un error; si solo falló alguna, se muestran las demás.
      if (stores.length > 0 && results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
      const owners = new Map<Product, OfferStore>();
      const all: Product[] = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        for (const product of r.value) {
          owners.set(product, { id: stores[i]!.id, name: stores[i]!.name });
          all.push(product);
        }
      });
      if (alive) {
        setStoreOf(owners);
        setProducts(all);
      }
    })().catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [attempt]);

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
    retry: () => setAttempt((n) => n + 1),
    goToCart: () => navigate(cartService ? `/app/servicios/${cartService}/carrito` : '/app/servicios'),
  };
}
