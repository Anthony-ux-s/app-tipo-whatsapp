import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import type { CheckoutInput, CheckoutResult, PaymentGateway, ProviderPayment } from './payment-gateway.port';

/**
 * Pasarela de prueba: no cobra nada. Lleva a una pantalla de pago simulado dentro de Parla donde el
 * administrador aprueba o rechaza el pago. Sirve para desarrollo, demos y pruebas automáticas.
 */
@Injectable()
export class SandboxPaymentGateway implements PaymentGateway {
  readonly provider = 'sandbox' as const;

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    return { checkoutUrl: `${this.env.publicWebUrl}/pago/${input.paymentId}`, providerRef: `sandbox-${input.paymentId}` };
  }

  async resolveWebhook(): Promise<ProviderPayment | null> {
    return null;
  }
}
