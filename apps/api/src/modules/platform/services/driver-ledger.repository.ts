import type { LedgerEntryKind, PayoutStatus } from '@parla/types';

export interface LedgerEntryRecord {
  id: string;
  driverId: string;
  orderId: string | null;
  kind: LedgerEntryKind;
  amountCents: number;
  /** posted (cuenta) | pending | paid | failed (depósitos). */
  status: 'posted' | PayoutStatus;
  transferId: string | null;
  failureReason: string | null;
  reason: 'manual' | 'auto' | null;
  createdAt: Date;
}

export interface LedgerTotals {
  /** Neto ganado (tarifa − comisión + propina) en el periodo, y cuántas entregas. */
  netCents: number;
  deliveries: number;
  tipsCents: number;
  commissionCents: number;
}

export interface DriverLedgerRepository {
  /**
   * Anota una entrega (tarifa, comisión y propina). Idempotente: si ya estaba anotada, no hace nada.
   * Devuelve true si la anotó ahora.
   */
  recordDelivery(entry: { driverId: string; orderId: string; feeCents: number; commissionCents: number; tipCents: number }): Promise<boolean>;
  /** Saldo disponible (lo que no falló, menos lo reservado en depósitos en curso). */
  balance(driverId: string): Promise<{ availableCents: number; pendingPayoutCents: number }>;
  totals(driverId: string, since?: Date): Promise<LedgerTotals>;
  list(driverId: string, limit: number): Promise<LedgerEntryRecord[]>;
  /**
   * Reserva todo el saldo en un depósito pendiente (atómico: no deja dos en curso ni deja reservar
   * más de lo que hay). Devuelve el movimiento creado o el motivo por el que no se pudo.
   */
  reservePayout(driverId: string, minCents: number, reason: 'manual' | 'auto'): Promise<LedgerEntryRecord | 'no_balance' | 'pending'>;
  findPayout(id: string): Promise<LedgerEntryRecord | null>;
  /** Cierra un depósito pendiente: pagado (con su transferencia) o fallido (el saldo vuelve). */
  settlePayout(id: string, status: 'paid' | 'failed', transferId: string | null, failureReason: string | null): Promise<LedgerEntryRecord | null>;
  /** Depósitos que siguen pendientes desde antes de `before` (la transferencia quedó sin confirmar). */
  stuckPayouts(before: Date): Promise<LedgerEntryRecord[]>;
  /** Repartidores con saldo para el depósito automático, cuenta de PagaYa y sin depósito en curso. */
  duePayouts(minCents: number): Promise<string[]>;
}

export const DRIVER_LEDGER_REPOSITORY = Symbol('DRIVER_LEDGER_REPOSITORY');
