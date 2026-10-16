import type { PaymentRecord } from '@parla/types';
import type { PaymentRow } from './payments.repository';

export function toPaymentRecord(payment: PaymentRow): PaymentRecord {
  return {
    id: payment.id,
    plan: payment.plan,
    amount: payment.amount,
    currency: payment.currency,
    status: payment.status,
    provider: payment.provider,
    createdAt: payment.createdAt.toISOString(),
    paidAt: payment.paidAt?.toISOString() ?? null,
  };
}
