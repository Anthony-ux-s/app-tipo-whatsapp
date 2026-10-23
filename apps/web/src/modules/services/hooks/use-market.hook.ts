import type { Product } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { errorMessage, http } from '@shared/utils/http';
import { parseShoppingQuery } from '../utils/services.utils';

const EMPTY: Record<string, never> = {};

export interface ProductGroup {
  /** Lo que se buscó («azúcar»); null = catálogo completo. */
  term: string | null;
  products: Product[];
}


/**
 * Tienda: se escribe la lista como se habla («un kilo de azúcar, arroz»), se busca cada cosa y
 * se arma el carrito.
 */
export function useMarket(storeId: string) {
  const navigate = useNavigate();
  const cartService = useCartStore((s) => s.service);
  const allItems = useCartStore((s) => s.items);
  // El carrito de otra tienda no cuenta aquí (al agregar algo, se empieza uno nuevo).
  const items = cartService === storeId ? allItems : EMPTY;
  const change = useCartStore((s) => s.change);
  const [query, setQuery] = useState('');
  const [terms, setTerms] = useState<string[]>([]);
  const products = useQuery({
    queryKey: ['products', storeId, terms],
    queryFn: async (): Promise<ProductGroup[]> => {
      const searchProducts = (q: string) => http.get<Product[]>(`/services/${encodeURIComponent(storeId)}/products?q=${encodeURIComponent(q)}`);
      return terms.length
        ? Promise.all(terms.map(async (term) => ({ term, products: await searchProducts(term) })))
        : [{ term: null, products: await searchProducts('') }];
    },
    // Mientras llega otra búsqueda no se muestra la anterior, como antes.
    staleTime: 60_000,
  });
  const groups = products.data ?? null;
  const error = groups ? null : products.error ? errorMessage(products.error) : null;

  const count = cartCount(items);
  const estimate = useMemo(() => cartEstimateCents(items), [items]);

  return {
    query,
    terms,
    groups,
    error,
    count,
    estimate,
    quantityOf: (productId: string) => items[productId]?.quantity ?? 0,
    onQueryChange: (value: string) => setQuery(value),
    search: (event?: FormEvent) => {
      event?.preventDefault();
      const found = parseShoppingQuery(query);
      setTerms(found);
      // Lo que busca sirve para mostrarle primero las ofertas que le interesan (no frena la búsqueda).
      for (const term of found) void http.post('/interests/search', { service: storeId, term }).catch(() => undefined);
    },
    clearSearch: () => {
      setQuery('');
      setTerms([]);
    },
    add: (product: Product) => change(product, 1, storeId),
    subtract: (product: Product) => change(product, -1, storeId),
    retry: () => void products.refetch(),
    goToCart: () => navigate(`/app/servicios/${storeId}/carrito`),
    back: (category?: string) => navigate(category ? `/app/servicios/c/${category}` : '/app/servicios'),
  };
}
