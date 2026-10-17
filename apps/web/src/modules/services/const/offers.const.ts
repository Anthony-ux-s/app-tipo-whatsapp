import {
  Activity,
  Drumstick,
  Eye,
  Fish,
  HeartPulse,
  Pill,
  Pizza,
  Sandwich,
  ShoppingBasket,
  Soup,
  Stethoscope,
  Syringe,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';

export type OfferCategory = 'mercado' | 'restaurantes' | 'salud';
export type OfferTab = 'todas' | OfferCategory;

export const OFFER_TABS: { id: OfferTab; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'mercado', label: 'Mercado' },
  { id: 'restaurantes', label: 'Restaurantes' },
  { id: 'salud', label: 'Salud' },
];

export const OFFER_CATEGORY_INFO: Record<OfferCategory, { title: string; subtitle: string; icon: LucideIcon; gradient: string }> = {
  mercado: { title: 'Mercado', subtitle: 'Precios rebajados en MercaYa, con delivery', icon: ShoppingBasket, gradient: 'from-teal-600 to-emerald-600' },
  restaurantes: { title: 'Restaurantes', subtitle: 'Combos y platos del día', icon: UtensilsCrossed, gradient: 'from-orange-500 to-rose-500' },
  salud: { title: 'Salud', subtitle: 'Farmacia, consultas y chequeos', icon: HeartPulse, gradient: 'from-cyan-700 to-teal-700' },
};

/**
 * Oferta de un servicio que aún no tiene sistema externo conectado (restaurantes y salud): se muestra
 * para que la gente la conozca, pero todavía no se puede pedir.
 */
export interface ShowcaseOffer {
  id: string;
  category: Exclude<OfferCategory, 'mercado'>;
  title: string;
  merchant: string;
  detail: string;
  priceCents: number;
  listPriceCents: number;
  icon: LucideIcon;
}

export const SHOWCASE_OFFERS: ShowcaseOffer[] = [
  { id: 'res-pollo', category: 'restaurantes', title: '1/4 de pollo a la brasa', merchant: 'La Brasa del Barrio', detail: 'Con papas y ensalada', priceCents: 1890, listPriceCents: 2390, icon: Drumstick },
  { id: 'res-ceviche', category: 'restaurantes', title: 'Ceviche clásico', merchant: 'Cevichería El Muelle', detail: 'Para 1 persona · con chicha', priceCents: 2490, listPriceCents: 3290, icon: Fish },
  { id: 'res-pizza', category: 'restaurantes', title: 'Pizza familiar americana', merchant: 'Horno de Leña', detail: '2 × 1 los martes', priceCents: 3990, listPriceCents: 5990, icon: Pizza },
  { id: 'res-menu', category: 'restaurantes', title: 'Menú del día', merchant: 'Sazón Casera', detail: 'Entrada, segundo y refresco', priceCents: 1200, listPriceCents: 1500, icon: Soup },
  { id: 'res-sanguche', category: 'restaurantes', title: 'Sánguche de chicharrón', merchant: 'Desayunos Don Lucho', detail: 'Con café pasado', priceCents: 1090, listPriceCents: 1390, icon: Sandwich },
  { id: 'sal-vitaminas', category: 'salud', title: 'Vitamina C 1 g · 30 tabletas', merchant: 'Farmacia Vida', detail: 'Entrega en el día', priceCents: 1990, listPriceCents: 2890, icon: Pill },
  { id: 'sal-consulta', category: 'salud', title: 'Consulta de medicina general', merchant: 'Clínica Familiar', detail: 'Presencial o por videollamada', priceCents: 4900, listPriceCents: 7000, icon: Stethoscope },
  { id: 'sal-chequeo', category: 'salud', title: 'Chequeo preventivo', merchant: 'Laboratorio Andino', detail: 'Hemograma, glucosa y colesterol', priceCents: 8900, listPriceCents: 13900, icon: Activity },
  { id: 'sal-vista', category: 'salud', title: 'Examen de la vista', merchant: 'Óptica Clara', detail: 'Incluye medida de lunas', priceCents: 2500, listPriceCents: 4000, icon: Eye },
  { id: 'sal-vacuna', category: 'salud', title: 'Vacuna contra la influenza', merchant: 'Farmacia Vida', detail: 'Aplicación incluida', priceCents: 3500, listPriceCents: 4500, icon: Syringe },
];
