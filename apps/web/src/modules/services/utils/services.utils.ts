import type { OrderStatus, Product } from '@parla/types';
import { FILLER_WORDS, MAX_SEARCH_TERMS, ORDER_STEPS } from '../const/services.const';

/**
 * Convierte un pedido escrito como se habla («un kilo de azúcar, arroz y 2 latas de atún») en
 * términos de búsqueda: ["azúcar", "arroz", "atún"].
 */
export function parseShoppingQuery(query: string): string[] {
  const terms = query
    .split(/,|;|\n|\s+y\s+|\s+e\s+/i)
    .map((part) =>
      part
        .split(/\s+/)
        .filter((word) => word && !/^\d+([.,]\d+)?$/.test(word) && !FILLER_WORDS.has(word.toLowerCase()))
        .join(' ')
        .trim(),
    )
    .filter(Boolean);
  return [...new Set(terms.map((t) => t.toLowerCase()))].slice(0, MAX_SEARCH_TERMS);
}

/** Paso actual del pedido en la línea de tiempo (0 = pago). */
export function orderStepIndex(status: OrderStatus): number {
  // Pagado: el negocio ya lo tiene, falta que lo acepte y lo prepare.
  if (status === 'paid') return 1;
  // Listo: se está buscando al repartidor.
  if (status === 'searching_driver') return 2;
  const index = ORDER_STEPS.findIndex((step) => step.status === status);
  return index === -1 ? 0 : index;
}

/** Descuento redondeado («-15 %»); 0 si no hay precio normal mayor. */
export function discountPercent(priceCents: number, listPriceCents: number | undefined): number {
  if (!listPriceCents || listPriceCents <= priceCents) return 0;
  return Math.round(((listPriceCents - priceCents) / listPriceCents) * 100);
}

/** El pedido ya no va a cambiar. */
export function isFinalStatus(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'payment_expired' || status === 'cancelled' || status === 'rejected';
}

/** «14:35» de vencimiento o «vencido». */
export function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
}

/**
 * Las presentaciones de un producto (unidad, caja, rollo…): en las tiendas de FerroHub cada una es un producto
 * con id «7-caja» y nombre «Cinta (Caja x12)». Se agrupan las que comparten el id base y el nombre sin paréntesis.
 */
export function variantsOf(product: Product, all: Product[]): Product[] {
  const base = (id: string) => id.slice(0, Math.max(0, id.lastIndexOf('-')));
  const stem = (name: string) => name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const key = base(product.id);
  if (!key) return [product];
  const group = all.filter((p) => base(p.id) === key && stem(p.name) === stem(product.name));
  return group.length > 1 ? group : [product];
}
