import type { OrderStatus } from '@parla/types';
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
  if (status === 'paid') return 1;
  const index = ORDER_STEPS.findIndex((step) => step.status === status);
  return index === -1 ? 0 : index;
}

/** El pedido ya no va a cambiar. */
export function isFinalStatus(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'payment_expired' || status === 'cancelled';
}

/** «14:35» de vencimiento o «vencido». */
export function minutesLeft(expiresAt: string, now: number): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
}
