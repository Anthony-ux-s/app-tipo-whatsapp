import type { LedgerEntryRecord } from './driver-ledger.repository';

/** Un movimiento de la billetera de una tienda (positivo suma, negativo resta). */
export type StoreLedgerEntryRecord = Omit<LedgerEntryRecord, 'driverId' | 'kind'> & {
  businessId: string;
  kind: 'sale' | 'commission' | 'payout';
};

/**
 * La billetera de una tienda: lo que vendió (productos), la comisión de Parla y los depósitos a su PagaYa.
 * Mismo recorrido que el de los repartidores: apartar el saldo en un depósito pendiente → transferir → cerrarlo.
 */
export interface StoreLedgerRepository {
  /** Anota una venta entregada (productos y comisión). Idempotente por pedido. Devuelve true si la anotó ahora. */
  recordSale(entry: { businessId: string; orderId: string; saleCents: number; commissionCents: number }): Promise<boolean>;
  balance(businessId: string): Promise<{ availableCents: number; pendingPayoutCents: number }>;
  list(businessId: string, limit: number): Promise<StoreLedgerEntryRecord[]>;
  /** Reserva todo el saldo en un depósito pendiente (atómico: no deja dos en curso ni reservar de más). */
  reservePayout(businessId: string, minCents: number, reason: 'manual' | 'auto'): Promise<StoreLedgerEntryRecord | 'no_balance' | 'pending'>;
  findPayout(id: string): Promise<StoreLedgerEntryRecord | null>;
  settlePayout(id: string, status: 'paid' | 'failed', transferId: string | null, failureReason: string | null): Promise<StoreLedgerEntryRecord | null>;
  stuckPayouts(before: Date): Promise<StoreLedgerEntryRecord[]>;
  /** Tiendas con saldo para el depósito automático, número de PagaYa y sin depósito en curso. */
  duePayouts(minCents: number): Promise<string[]>;
}

export const STORE_LEDGER_REPOSITORY = Symbol('STORE_LEDGER_REPOSITORY');
