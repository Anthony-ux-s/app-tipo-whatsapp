import type { Product } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { cartCount, cartEstimateCents, useCartStore } from '@shared/stores/cart.store';
import { errorMessage, http } from '@shared/utils/http';
import { SHOWCASE_OFFERS, type OfferCategory, type OfferTab } from '../const/offers.const';
import { discountPercent } from '../utils/services.utils';

/**
 * Ofertas de todos los servicios. Las del Mercado son productos rebajados de MercaYa (se compran con
 * el mismo carrito); las de restaurantes y salud se muestran mientras se conecta su sistema.
 */
export function useOffers() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const change = useCartStore((s) => s.change);
  const [tab, setTab] = useState<OfferTab>('todas');
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

  const shows = (category: OfferCategory) => tab === 'todas' || tab === category;

  return {
    tab,
    selectTab: setTab,
    shows,
    marketOffers,
    marketLoading: !products && !error,
    error,
    restaurantOffers: SHOWCASE_OFFERS.filter((o) => o.category === 'restaurantes'),
    healthOffers: SHOWCASE_OFFERS.filter((o) => o.category === 'salud'),
    count: cartCount(items),
    estimate: cartEstimateCents(items),
    quantityOf: (productId: string) => items[productId]?.quantity ?? 0,
    add: (product: Product) => change(product, 1),
    subtract: (product: Product) => change(product, -1),
    retry: () => setAttempt((n) => n + 1),
    goToCart: () => navigate('/app/servicios/mercado/carrito'),
  };
}
