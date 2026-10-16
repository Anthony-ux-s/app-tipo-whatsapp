import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import type { CheckoutInput, CheckoutResult, PaymentGateway, ProviderPayment, WebhookInput } from './payment-gateway.port';

const API = 'https://api.mercadopago.com';

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

interface MpPayment {
  id: number | string;
  status: string;
  external_reference: string | null;
  transaction_amount: number;
  currency_id: string;
}

/**
 * MercadoPago Checkout Pro: cada pago cubre un mes del plan (prepago, sin cobros automáticos).
 * Se activa con MERCADOPAGO_ACCESS_TOKEN. El webhook nunca se cree "tal cual": se vuelve a consultar el
 * pago en la API de MercadoPago con nuestro token, y si hay MERCADOPAGO_WEBHOOK_SECRET se verifica la firma.
 */
@Injectable()
export class MercadoPagoPaymentGateway implements PaymentGateway {
  readonly provider = 'mercadopago' as const;
  private readonly logger = new Logger('MercadoPago');
  private fetcher: FetchLike = (url, init) => fetch(url, init);

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Solo para pruebas: reemplaza la red por un doble. */
  useFetch(fetcher: FetchLike): this {
    this.fetcher = fetcher;
    return this;
  }

  private headers(): Record<string, string> {
    return { authorization: `Bearer ${this.env.mercadoPago.accessToken}`, 'content-type': 'application/json' };
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const response = await this.fetcher(`${API}/checkout/preferences`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        items: [{ id: input.paymentId, title: input.title, quantity: 1, currency_id: input.currency, unit_price: input.amount }],
        external_reference: input.paymentId,
        back_urls: { success: input.returnUrl, failure: input.returnUrl, pending: input.returnUrl },
        auto_return: 'approved',
        statement_descriptor: 'PARLA',
        ...(this.env.publicApiUrl ? { notification_url: `${this.env.publicApiUrl}/api/billing/webhooks/mercadopago` } : {}),
      }),
    });
    if (!response.ok) {
      this.logger.error(`MercadoPago respondió ${response.status} al crear el pago`);
      throw new Error('No se pudo iniciar el pago con MercadoPago. Inténtalo de nuevo en unos minutos.');
    }
    const body = (await response.json()) as { id: string; init_point: string; sandbox_init_point?: string };
    const url = this.env.mercadoPago.useSandboxUrl && body.sandbox_init_point ? body.sandbox_init_point : body.init_point;
    return { checkoutUrl: url, providerRef: body.id };
  }

  async resolveWebhook({ query, body, headers }: WebhookInput): Promise<ProviderPayment | null> {
    const type = String(query.type ?? query.topic ?? (body as { type?: unknown }).type ?? '');
    const dataId = String(query['data.id'] ?? query.id ?? (body as { data?: { id?: unknown } }).data?.id ?? '');
    if (type !== 'payment' || !/^\d+$/.test(dataId)) return null;
    if (this.env.mercadoPago.webhookSecret && !this.validSignature(dataId, headers)) {
      this.logger.warn('Webhook de MercadoPago con firma inválida: se ignora');
      return null;
    }

    const response = await this.fetcher(`${API}/v1/payments/${dataId}`, { headers: this.headers() });
    if (!response.ok) throw new Error(`MercadoPago respondió ${response.status} al consultar el pago`);
    const payment = (await response.json()) as MpPayment;
    if (!payment.external_reference) return null;
    return {
      paymentId: payment.external_reference,
      status: payment.status === 'approved' ? 'approved' : ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status) ? 'rejected' : 'pending',
      providerRef: String(payment.id),
      amount: Math.round(payment.transaction_amount),
      currency: payment.currency_id,
    };
  }

  /** Firma x-signature "ts=...,v1=..." sobre "id:<data.id>;request-id:<x-request-id>;ts:<ts>;". */
  private validSignature(dataId: string, headers: Record<string, string | undefined>): boolean {
    const signature = headers['x-signature'] ?? '';
    const parts = Object.fromEntries(signature.split(',').map((p) => p.trim().split('=') as [string, string]));
    if (!parts.ts || !parts.v1) return false;
    const manifest = `id:${dataId};request-id:${headers['x-request-id'] ?? ''};ts:${parts.ts};`;
    const expected = createHmac('sha256', this.env.mercadoPago.webhookSecret!).update(manifest).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(parts.v1);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
