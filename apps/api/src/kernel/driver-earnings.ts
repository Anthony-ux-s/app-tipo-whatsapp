import { ValidationError } from './domain-error';

/** Reparto y depósitos del repartidor (se configura con variables de entorno; ver `parseDriverPay`). */
export interface DriverPayConfig {
  /** Porcentaje de la tarifa de delivery que gana el repartidor; Rapidito se queda con el resto. */
  sharePercent: number;
  /** Mínimo para el depósito automático diario. */
  minAutoPayoutCents: number;
  /** Mínimo para «Retirar ahora». */
  minManualPayoutCents: number;
  /** Lo máximo que puede deber a Parla por comisiones de deliveries cobrados en mano antes de no poder tomar más pedidos. */
  maxDebtCents: number;
}

/** Valores por defecto: 90 % para el repartidor (Parla recibe el 10 % del delivery), depósito automático desde S/ 5, retiro desde S/ 1 y deuda máxima de S/ 30. */
export const DEFAULT_DRIVER_PAY: DriverPayConfig = { sharePercent: 90, minAutoPayoutCents: 500, minManualPayoutCents: 100, maxDebtCents: 3000 };

/** Hora del depósito automático (la corre el gateway con RAPIDITO_PAYOUT_AT); se muestra al repartidor. */
export const AUTO_PAYOUT_AT = '23:00';

/**
 * Lee la configuración de las variables de entorno (en soles para que sea fácil de escribir) y la
 * valida al arrancar: un valor mal escrito no deja levantar el core, en vez de pagar mal.
 *   DRIVER_SHARE_PERCENT            90   (de 50 a 100; admite decimales, p. ej. 92.5)
 *   DRIVER_MIN_AUTO_PAYOUT_SOLES    5
 *   DRIVER_MIN_MANUAL_PAYOUT_SOLES  1
 *   DRIVER_MAX_DEBT_SOLES            30   (lo que puede deber a Parla por comisiones antes de no poder tomar pedidos)
 */
export function parseDriverPay(env: Record<string, string | undefined>): DriverPayConfig {
  const read = (name: string, fallback: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const n = Number(raw.replace(',', '.'));
    if (!Number.isFinite(n)) throw new Error(`${name} debe ser un número (llegó «${raw}»)`);
    return n;
  };
  const sharePercent = read('DRIVER_SHARE_PERCENT', DEFAULT_DRIVER_PAY.sharePercent);
  if (sharePercent < 50 || sharePercent > 100) throw new Error('DRIVER_SHARE_PERCENT debe estar entre 50 y 100');
  const toCents = (soles: number, name: string) => {
    const cents = Math.round(soles * 100);
    if (cents < 100) throw new Error(`${name} debe ser al menos 1 (sol)`);
    return cents;
  };
  const minAutoPayoutCents = toCents(read('DRIVER_MIN_AUTO_PAYOUT_SOLES', DEFAULT_DRIVER_PAY.minAutoPayoutCents / 100), 'DRIVER_MIN_AUTO_PAYOUT_SOLES');
  const minManualPayoutCents = toCents(read('DRIVER_MIN_MANUAL_PAYOUT_SOLES', DEFAULT_DRIVER_PAY.minManualPayoutCents / 100), 'DRIVER_MIN_MANUAL_PAYOUT_SOLES');
  const maxDebtCents = Math.round(read('DRIVER_MAX_DEBT_SOLES', DEFAULT_DRIVER_PAY.maxDebtCents / 100) * 100);
  if (maxDebtCents < 0) throw new Error('DRIVER_MAX_DEBT_SOLES no puede ser negativo');
  return { sharePercent, minAutoPayoutCents, minManualPayoutCents, maxDebtCents };
}

/**
 * Reparto de una entrega: la comisión de Rapidito es (100 − porcentaje del repartidor) % de la
 * tarifa, redondeada al céntimo; el repartidor recibe el resto de la tarifa y la propina completa
 * (la propina nunca paga comisión).
 */
export function splitDelivery(
  feeCents: number,
  tipCents: number,
  sharePercent = DEFAULT_DRIVER_PAY.sharePercent,
): { commissionCents: number; driverFeeCents: number; earningsCents: number } {
  if (!Number.isInteger(feeCents) || feeCents < 0 || !Number.isInteger(tipCents) || tipCents < 0) {
    throw new ValidationError('Montos inválidos');
  }
  const commissionCents = Math.round((feeCents * (100 - sharePercent)) / 100);
  const driverFeeCents = feeCents - commissionCents;
  return { commissionCents, driverFeeCents, earningsCents: driverFeeCents + tipCents };
}

/** Número de PagaYa (celular peruano de 9 dígitos que empieza en 9). */
export function normalizePayoutPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').replace(/^51(?=9\d{8}$)/, '');
  if (!/^9\d{8}$/.test(digits)) throw new ValidationError('Escribe tu número de PagaYa: 9 dígitos y empieza en 9');
  return digits;
}
