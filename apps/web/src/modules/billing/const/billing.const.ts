import type { PaymentStatus, PlanId } from '@parla/types';

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  approved: 'Pagado',
  rejected: 'Rechazado',
};

export const PLAN_ACCENTS: Record<PlanId, string> = {
  free: 'from-cyan-500 to-teal-600',
  team: 'from-teal-600 to-emerald-600',
  business: 'from-teal-800 to-cyan-800',
};

/** Tarjeta de prueba que se muestra en el pago simulado (no se cobra nada). */
export const SANDBOX_CARD = { number: '4242 4242 4242 4242', expiry: '12/29', cvc: '123' };
