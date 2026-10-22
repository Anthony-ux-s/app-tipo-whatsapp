import { ShoppingBasket, type LucideIcon } from 'lucide-react';

/** Ofertas por categoría: hoy, las de las tiendas de Mercado (productos rebajados). */
export type OfferCategory = 'mercado';

export const OFFER_CATEGORY_INFO: Record<OfferCategory, { title: string; subtitle: string; icon: LucideIcon; gradient: string }> = {
  mercado: { title: 'Mercado', subtitle: 'Precios rebajados en tiendas de Mercado, con delivery', icon: ShoppingBasket, gradient: 'from-teal-600 to-emerald-600' },
};
