/** Entrega códigos de verificación por SMS y correo (OneSignal en producción). */
export interface VerificationSender {
  /** 'onesignal' envía de verdad; 'dev' solo los registra en consola para probar sin cuenta. */
  readonly provider: 'onesignal' | 'dev';
  sendSms(phone: string, text: string): Promise<void>;
  sendEmail(to: string, subject: string, html: string): Promise<void>;
}

export const VERIFICATION_SENDER = Symbol('VERIFICATION_SENDER');

/** El proveedor rechazó el envío (número inválido, sin saldo, plan sin SMS…). */
export class DeliveryFailedError extends Error {}
