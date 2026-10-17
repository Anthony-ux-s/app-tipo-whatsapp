import type { Product } from '@parla/types';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { errorMessage, http } from '@shared/utils/http';
import { parseShoppingQuery } from '../utils/services.utils';

export interface ProductGroup {
  /** Lo que se buscó («azúcar»); null = catálogo completo. */
  term: string | null;
  products: Product[];
}

const searchProducts = (q: string) => http.get<Product[]>(`/services/mercado/products?q=${encodeURIComponent(q)}`);

/**
 * Mercado: se escribe la lista como se habla («un kilo de azúcar, arroz»), se busca cada cosa y
 * se arma el carrito.
 */
export function useMarket() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const change = useCartStore((s) => s.change);
  const [query, setQuery] = useState('');
  const [terms, setTerms] = useState<string[]>([]);
  const [groups, setGroups] = useState<ProductGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setGroups(null);
    setError(null);
    const requests = terms.length
      ? terms.map(async (term) => ({ term, products: await searchProducts(term) }))
      : [searchProducts('').then((products) => ({ term: null, products }))];
    Promise.all(requests)
      .then((found) => alive && setGroups(found))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [terms, attempt]);

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
      setTerms(parseShoppingQuery(query));
    },
    clearSearch: () => {
      setQuery('');
      setTerms([]);
    },
    add: (product: Product) => change(product, 1),
    subtract: (product: Product) => change(product, -1),
    retry: () => setAttempt((n) => n + 1),
    goToCart: () => navigate('/app/servicios/mercado/carrito'),
    back: () => navigate('/app/servicios'),
  };
}
