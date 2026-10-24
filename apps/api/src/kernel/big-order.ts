import type { BigOrderRules } from '@parla/types';

/**
 * Pedido grande: una obra, mucha cantidad. No sigue el flujo automático normal: la tienda lo confirma con el
 * cliente (stock físico, tiempo, si hace falta camioneta) antes de prepararlo. Es grande si el total llega al
 * umbral de la tienda **o** si lleva tantas unidades como su umbral de unidades.
 *
 * Los umbrales son de cada tienda (una ferretería de FerroHub trae los suyos); si no los tiene valen los de
 * `BIG_ORDER_TOTAL_CENTS` (S/ 600) y `BIG_ORDER_UNITS` (25).
 */
const DEFAULT_TOTAL_CENTS = 60_000;
const DEFAULT_UNITS = 25;

const positive = (raw: string | undefined, fallback: number): number => {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
};

/** Solo dígitos, para armar el enlace https://wa.me/… */
export const whatsappDigits = (raw: string | null | undefined): string => (raw ?? '').replace(/\D/g, '');

/** Los umbrales de una tienda: los suyos o, si no los tiene, los generales. */
export function bigOrderRulesOf(own: { bigOrderCents: number | null; bigOrderUnits: number | null; adminWhatsapp: string }): BigOrderRules {
  return {
    totalCents: own.bigOrderCents ?? positive(process.env.BIG_ORDER_TOTAL_CENTS, DEFAULT_TOTAL_CENTS),
    units: own.bigOrderUnits ?? positive(process.env.BIG_ORDER_UNITS, DEFAULT_UNITS),
    whatsapp: whatsappDigits(own.adminWhatsapp) || null,
  };
}

export const orderUnits = (lines: { quantity: number }[]): number => lines.reduce((sum, line) => sum + line.quantity, 0);

export function isBigOrder(order: { totalCents: number; lines: { quantity: number }[] }, rules: BigOrderRules): boolean {
  return order.totalCents >= rules.totalCents || orderUnits(order.lines) >= rules.units;
}

/** Minutos sin que la tienda lo acepte: al primero se le vuelve a avisar y al segundo se avisa a soporte. */
export function bigOrderEscalation(): { firstMinutes: number; secondMinutes: number } {
  const first = positive(process.env.BIG_ORDER_REMIND_MINUTES, 10);
  return { firstMinutes: first, secondMinutes: Math.max(first + 1, positive(process.env.BIG_ORDER_SUPPORT_MINUTES, 20)) };
}
