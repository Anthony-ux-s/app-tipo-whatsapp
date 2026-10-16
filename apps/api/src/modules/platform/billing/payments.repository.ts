import type { PaidPlanId, PaymentProvider, PaymentStatus } from '@parla/types';

export interface PaymentRow {
  id: string;
  workspaceId: string;
  createdById: string;
  plan: PaidPlanId;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerRef: string | null;
  checkoutUrl: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

export interface NewPayment {
  workspaceId: string;
  createdById: string;
  plan: PaidPlanId;
  amount: number;
  currency: string;
  provider: PaymentProvider;
}

export interface PaymentsRepository {
  create(input: NewPayment): Promise<PaymentRow>;
  attachCheckout(id: string, checkoutUrl: string, providerRef: string | null): Promise<void>;
  findById(id: string): Promise<PaymentRow | null>;
  /** Cambia el estado solo si sigue pendiente; devuelve false si otro aviso ya lo resolvió. */
  settle(id: string, status: Exclude<PaymentStatus, 'pending'>, providerRef: string, at: Date): Promise<boolean>;
  listForWorkspace(workspaceId: string, take: number): Promise<PaymentRow[]>;
}

export const PAYMENTS_REPOSITORY = Symbol('PAYMENTS_REPOSITORY');
