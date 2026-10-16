import type { PaymentProvider } from '@parla/types';

export interface CheckoutInput {
  paymentId: string;
  title: string;
  amount: number;
  currency: string;
  /** A dónde vuelve la persona después de pagar. */
  returnUrl: string;
}

export interface CheckoutResult {
  checkoutUrl: string;
  providerRef: string | null;
}

/** Resultado de consultar un pago en la pasarela (después de un aviso o webhook). */
export interface ProviderPayment {
  paymentId: string;
  status: 'approved' | 'rejected' | 'pending';
  providerRef: string;
  amount: number;
  currency: string;
}

export interface WebhookInput {
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  headers: Record<string, string | undefined>;
}

/** Cobro de los planes. El negocio nunca nombra al proveedor: usa este puerto. */
export interface PaymentGateway {
  readonly provider: PaymentProvider;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Interpreta un webhook del proveedor y consulta el pago real; null si no es un aviso de pago. */
  resolveWebhook(input: WebhookInput): Promise<ProviderPayment | null>;
}

export const PAYMENT_GATEWAY = Symbol('PAYMENT_GATEWAY');
