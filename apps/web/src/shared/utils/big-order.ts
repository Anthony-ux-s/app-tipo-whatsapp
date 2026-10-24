import type { BigOrderRules } from '@parla/types';

/** Mismo criterio que el servidor: grande si el total llega al umbral de la tienda o si lleva suficientes unidades. */
export function isBigOrder(order: { totalCents: number; units: number }, rules: BigOrderRules): boolean {
  return order.totalCents >= rules.totalCents || order.units >= rules.units;
}

/** Enlace para escribir por WhatsApp (https://wa.me/<país+número>) con el texto ya puesto. */
export function whatsappLink(digits: string, text: string): string {
  return `https://wa.me/${digits.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
