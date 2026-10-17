import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import { DeliveryFailedError, type VerificationSender } from './verification-sender.port';

const API = 'https://api.onesignal.com/notifications';
const TIMEOUT_MS = 10_000;

interface OneSignalResponse {
  id?: string;
  errors?: unknown;
}

/**
 * Envía los códigos con la API de mensajes de OneSignal (canal SMS y canal correo).
 * https://documentation.onesignal.com/reference/sms · https://documentation.onesignal.com/reference/email
 * El SMS necesita un número emisor (Twilio) configurado en el panel de OneSignal.
 */
@Injectable()
export class OneSignalSender implements VerificationSender {
  readonly provider = 'onesignal' as const;
  private readonly logger = new Logger('OneSignal');

  constructor(@Inject(APP_ENV) private readonly env: AppEnv) {}

  /** Solo se usa este adaptador cuando OneSignal está configurado (ver InfraModule). */
  private get config() {
    if (!this.env.oneSignal) throw new DeliveryFailedError('OneSignal no está configurado');
    return this.env.oneSignal;
  }

  async sendSms(phone: string, text: string): Promise<void> {
    await this.post('sms', {
      target_channel: 'sms',
      include_phone_numbers: [phone],
      contents: { en: text, es: text },
      ...(this.config.smsFrom ? { sms_from: this.config.smsFrom } : {}),
    });
  }

  async sendEmail(to: string, subject: string, html: string): Promise<void> {
    await this.post('email', {
      target_channel: 'email',
      email_to: [to],
      email_subject: subject,
      email_body: html,
      email_from_name: 'Parla',
    });
  }

  private async post(channel: 'sms' | 'email', body: Record<string, unknown>): Promise<void> {
    const { appId, apiKey } = this.config;
    const response = await fetch(`${API}?c=${channel}`, {
      method: 'POST',
      headers: { authorization: `Key ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ app_id: appId, ...body }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    }).catch((error: unknown) => {
      throw new DeliveryFailedError(`OneSignal no respondió: ${String(error)}`);
    });
    const result = (await response.json().catch(() => ({}))) as OneSignalResponse;
    // 200 con id vacío también es un fallo («All included players are not subscribed»).
    if (!response.ok || !result.id) {
      this.logger.error(`Envío por ${channel} rechazado (${response.status}): ${JSON.stringify(result.errors ?? result)}`);
      throw new DeliveryFailedError('OneSignal rechazó el envío');
    }
  }
}
