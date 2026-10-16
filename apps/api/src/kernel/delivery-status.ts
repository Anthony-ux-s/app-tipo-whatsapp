import type { DeliveryStatus } from '@parla/types';

export interface ReceiptState {
  deliveredAt: Date | null;
  readAt: Date | null;
}

/**
 * Estado visible de un mensaje para quien lo envió.
 * sent → delivered (todos los destinatarios lo recibieron) → read (todos lo leyeron).
 * En grupos manda el destinatario más atrasado, como en WhatsApp.
 */
export function aggregateDeliveryStatus(receipts: readonly ReceiptState[]): DeliveryStatus {
  if (receipts.length === 0) return 'read';
  if (receipts.every((r) => r.readAt)) return 'read';
  if (receipts.every((r) => r.deliveredAt || r.readAt)) return 'delivered';
  return 'sent';
}

const ORDER: Record<DeliveryStatus, number> = { sent: 0, delivered: 1, read: 2 };

/** Un estado nunca retrocede: leído no vuelve a entregado. */
export function isForwardTransition(from: DeliveryStatus, to: DeliveryStatus): boolean {
  return ORDER[to] > ORDER[from];
}
