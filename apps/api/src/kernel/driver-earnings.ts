import { ValidationError } from './domain-error';

/** El repartidor gana el 95 % de la tarifa de delivery; Rapidito se queda con el 5 %. */
export const DRIVER_SHARE_PERCENT = 95;
export const RAPIDITO_COMMISSION_PERCENT = 100 - DRIVER_SHARE_PERCENT;

/** Mínimo para el depósito automático diario (los retiros manuales piden al menos S/ 1). */
export const MIN_AUTO_PAYOUT_CENTS = 500;
export const MIN_MANUAL_PAYOUT_CENTS = 100;

/** Hora del depósito automático (la corre el gateway); se muestra al repartidor. */
export const AUTO_PAYOUT_AT = '23:00';

/**
 * Reparto de una entrega: la comisión es el 5 % de la tarifa, redondeado al céntimo; el repartidor
 * recibe el resto de la tarifa y la propina completa (la propina nunca paga comisión).
 */
export function splitDelivery(feeCents: number, tipCents: number): { commissionCents: number; driverFeeCents: number; earningsCents: number } {
  if (!Number.isInteger(feeCents) || feeCents < 0 || !Number.isInteger(tipCents) || tipCents < 0) {
    throw new ValidationError('Montos inválidos');
  }
  const commissionCents = Math.round((feeCents * RAPIDITO_COMMISSION_PERCENT) / 100);
  const driverFeeCents = feeCents - commissionCents;
  return { commissionCents, driverFeeCents, earningsCents: driverFeeCents + tipCents };
}

/** Número de PagaYa (celular peruano de 9 dígitos que empieza en 9). */
export function normalizePayoutPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
  if (!/^9\d{8}$/.test(digits)) throw new ValidationError('Escribe tu número de PagaYa: 9 dígitos y empieza en 9');
  return digits;
}
