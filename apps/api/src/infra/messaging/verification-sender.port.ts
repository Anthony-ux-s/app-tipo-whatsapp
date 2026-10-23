/** Entrega códigos de verificación por SMS y correo (OneSignal o Brevo en producción). */
export interface VerificationSender {
  /** 'onesignal' y 'brevo' envían de verdad; 'dev' solo los registra en consola para probar sin cuenta. */
  readonly provider: 'onesignal' | 'brevo' | 'dev';
  /** Si el canal usa el modo de prueba (el código vuelve a la pantalla). Sin esto vale `provider`. */
  isDev?(channel: 'sms' | 'email'): boolean;
  sendSms(phone: string, text: string): Promise<void>;
  /** `text` es la versión sin formato, para los programas de correo que no muestran HTML. */
  sendEmail(to: string, subject: string, html: string, text?: string): Promise<void>;
}

export const VERIFICATION_SENDER = Symbol('VERIFICATION_SENDER');

/** El proveedor rechazó el envío (número inválido, sin saldo, plan sin SMS…). */
export class DeliveryFailedError extends Error {}
