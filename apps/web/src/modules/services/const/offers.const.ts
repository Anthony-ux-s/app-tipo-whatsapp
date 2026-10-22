import { ShoppingBasket, type LucideIcon } from 'lucide-react';

/** Solo hay ofertas de los servicios conectados: hoy, el Mercado (productos rebajados de la tienda). */
export type OfferCategory = 'mercado';

export const OFFER_CATEGORY_INFO: Record<OfferCategory, { title: string; subtitle: string; icon: LucideIcon; gradient: string }> = {
  mercado: { title: 'Mercado', subtitle: 'Precios rebajados en MercaYa, con delivery', icon: ShoppingBasket, gradient: 'from-teal-600 to-emerald-600' },
};
