import type { Product } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { errorMessage, http } from '@shared/utils/http';
import { discountPercent } from '../utils/services.utils';

/**
 * Ofertas: los productos rebajados de MercaYa (se compran con el mismo carrito). Cuando se conecte otro
 * servicio, sus ofertas reales se suman aquí.
 */
export function useOffers() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const change = useCartStore((s) => s.change);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setError(null);
    http
      .get<Product[]>('/services/mercado/products?q=')
      .then((list) => alive && setProducts(list))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [attempt]);

  /** Productos en oferta, del mayor descuento al menor. */
  const marketOffers = useMemo(
    () =>
      (products ?? [])
        .filter((p) => discountPercent(p.priceCents, p.listPriceCents) > 0)
        .sort((a, b) => discountPercent(b.priceCents, b.listPriceCents) - discountPercent(a.priceCents, a.listPriceCents)),
    [products],
  );

  return {
    marketOffers,
    catalog: products,
    marketLoading: !products && !error,
    error,
    count: cartCount(items),
    estimate: cartEstimateCents(items),
    quantityOf: (productId: string) => items[productId]?.quantity ?? 0,
    add: (product: Product) => change(product, 1),
    subtract: (product: Product) => change(product, -1),
    retry: () => setAttempt((n) => n + 1),
    goToCart: () => navigate('/app/servicios/mercado/carrito'),
  };
}
