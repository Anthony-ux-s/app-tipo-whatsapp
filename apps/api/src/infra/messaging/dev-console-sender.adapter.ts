import { Injectable, Logger } from '@nestjs/common';
import type { VerificationSender } from './verification-sender.port';

/**
 * Desarrollo sin OneSignal: no envía nada, deja el mensaje en la consola del core. El caso de uso,
 * además, devuelve el código a la pantalla («modo de prueba»). Nunca se usa en producción.
 */
@Injectable()
export class DevConsoleSender implements VerificationSender {
  readonly provider = 'dev' as const;
  private readonly logger = new Logger('SMS/correo (modo de prueba)');

  async sendSms(phone: string, text: string): Promise<void> {
    this.logger.log(`SMS a ${phone}: ${text.split('\n')[0]}`);
  }

  async sendEmail(to: string, subject: string, _html?: string, _text?: string): Promise<void> {
    this.logger.log(`Correo a ${to}: ${subject}`);
  }
}
