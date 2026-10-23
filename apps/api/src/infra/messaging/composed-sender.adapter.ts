import type { VerificationSender } from './verification-sender.port';

/** Un proveedor para los SMS y otro para los correos (p. ej. SMS con OneSignal y correo con Brevo). */
export class ComposedSender implements VerificationSender {
  readonly provider: VerificationSender['provider'];

  constructor(
    private readonly sms: VerificationSender,
    private readonly email: VerificationSender,
  ) {
    this.provider = email.provider !== 'dev' ? email.provider : sms.provider;
  }

  isDev(channel: 'sms' | 'email'): boolean {
    return (channel === 'sms' ? this.sms : this.email).provider === 'dev';
  }

  sendSms(phone: string, text: string): Promise<void> {
    return this.sms.sendSms(phone, text);
  }

  sendEmail(to: string, subject: string, html: string, text?: string): Promise<void> {
    return this.email.sendEmail(to, subject, html, text);
  }
}
