import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import { DeliveryFailedError, type VerificationSender } from './verification-sender.port';

const API = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10_000;

/**
 * Envía los correos (códigos de verificación y bienvenida) con la API de correo transaccional de Brevo.
 * https://developers.brevo.com/reference/sendtransacemail · El plan gratis de Brevo manda hasta 300 correos al día.
 * Brevo no manda SMS: para eso se usa otro proveedor (ver InfraModule).
 */
@Injectable()
export class BrevoSender implements VerificationSender {
  readonly provider = 'brevo' as const;
  private readonly logger = new Logger('Brevo');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  private get config() {
    if (!this.env.brevo) throw new DeliveryFailedError('Brevo no está configurado');
    return this.env.brevo;
  }

  async sendSms(): Promise<void> {
    throw new DeliveryFailedError('Brevo solo envía correos en Parla');
  }

  async sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    const { apiKey, senderEmail, senderName } = this.config;
    const response = await fetch(API, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ sender: { name: senderName, email: senderEmail }, to: [{ email: to }], subject, htmlContent: html, ...(text ? { textContent: text } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new DeliveryFailedError(`Brevo no respondió: ${String(error)}`);
    });
    if (response.ok) return;
    const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
    // Sin el correo ni el código en el registro: solo qué respondió Brevo (clave mala, remitente sin verificar…).
    this.logger.error(`Envío por correo rechazado (${response.status}): ${body.code ?? ''} ${body.message ?? ''}`.trim());
    throw new DeliveryFailedError(`Brevo rechazó el envío (${response.status})`);
  }
}
