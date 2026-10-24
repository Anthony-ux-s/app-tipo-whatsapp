import type { Product, ServiceId, StoreSummary } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { errorMessage, http } from '@shared/utils/http';

/** Cuántas tiendas abiertas se consultan por búsqueda (cada una responde con su propio catálogo). */
const MAX_STORES = 15;
const MIN_CHARS = 2;

export interface SearchStore {
  id: string;
  name: string;
}

interface SearchEntry {
  product: Product;
  store: SearchStore;
}

/** Todas las tiendas aprobadas, de todas las categorías (las abiertas primero). */
export function useAllStores() {
  const query = useQuery({ queryKey: ['stores', 'list', 'all'], queryFn: () => http.get<StoreSummary[]>('/stores'), staleTime: 60_000 });
  const stores = useMemo(() => (query.data ? [...query.data].sort((a, b) => Number(b.open) - Number(a.open)) : null), [query.data]);
  return { stores, error: stores ? null : query.error ? errorMessage(query.error) : null, retry: () => void query.refetch() };
}

/**
 * Busca un producto en todas las tiendas a la vez (zapatillas, audífonos…): la persona ve los productos sin
 * tener que saber qué tienda los vende. El carrito es de una sola tienda: al agregar algo de otra, se reemplaza.
 */
export function useProductSearch(stores: StoreSummary[] | null) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  const [category, setCategory] = useState<ServiceId | 'todos'>('todos');
  useEffect(() => {
    const timer = setTimeout(() => setTerm(text.trim()), 350);
    return () => clearTimeout(timer);
  }, [text]);

  // Sin texto se muestran todos los productos; con 1 letra aún no se busca.
  const active = stores !== null && (term.length === 0 || term.length >= MIN_CHARS);
  const targets = useMemo(() => (stores ?? []).filter((s) => s.open && (category === 'todos' || s.service === category)).slice(0, MAX_STORES), [stores, category]);
  const query = useQuery({
    queryKey: ['stores', 'search', category, term.toLowerCase(), targets.map((s) => s.id).join(',')],
    enabled: active,
    queryFn: async (): Promise<SearchEntry[]> => {
      const results = await Promise.allSettled(targets.map((s) => http.get<Product[]>(`/services/${encodeURIComponent(s.id)}/products?q=${encodeURIComponent(term)}`)));
      if (targets.length > 0 && results.every((r) => r.status === 'rejected')) throw (results[0] as PromiseRejectedResult).reason;
      const all: SearchEntry[] = [];
      results.forEach((r, i) => {
        if (r.status !== 'fulfilled') return;
        for (const product of r.value) all.push({ product, store: { id: targets[i]!.id, name: targets[i]!.name } });
      });
      return all;
    },
  });

  const cartService = useCartStore((s) => s.service);
  const items = useCartStore((s) => s.items);
  const change = useCartStore((s) => s.change);
  const storeOf = useMemo(() => new Map((query.data ?? []).map((e) => [e.product, e.store] as const)), [query.data]);
  const own = (storeId: string) => (cartService === storeId ? items : {});

  return {
    text,
    setText,
    category,
    setCategory,
    searching: term.length >= MIN_CHARS,
    tooShort: text.trim().length > 0 && text.trim().length < MIN_CHARS,
    term,
    products: query.data ? query.data.map((e) => e.product) : null,
    loading: active && query.isPending,
    error: query.error && !query.data ? errorMessage(query.error) : null,
    retry: () => void query.refetch(),
    storeOf: (product: Product) => storeOf.get(product) ?? null,
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
    count: cartCount(items),
    estimate: cartEstimateCents(items),
    goToCart: () => navigate(cartService ? `/app/servicios/${cartService}/carrito` : '/app/servicios'),
  };
}
