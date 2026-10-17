import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { ConflictError, UnauthorizedError, ValidationError } from './domain-error';

export type VerificationChannel = 'sms' | 'email';
export type VerificationPurpose = 'register' | 'email' | 'reset_password';

export const CODE_LENGTH = 6;
export const CODE_TTL_MS = 10 * 60_000;
export const MAX_ATTEMPTS = 5;
/** Espera mínima entre dos envíos al mismo destino. */
export const RESEND_AFTER_MS = 60_000;
/** Envíos por destino en una hora (frena el abuso de SMS, que cuestan dinero). */
export const MAX_SENDS_PER_HOUR = 5;
/** El comprobante de un teléfono o correo verificado sirve para terminar el registro en este plazo. */
export const PROOF_TTL_MS = 30 * 60_000;

/** Código numérico de 6 cifras con azar criptográfico. */
export function generateCode(): string {
  return String(randomInt(0, 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
}

/** Comprobante largo y aleatorio (va en la URL del paso siguiente, no se adivina). */
export function generateProof(): string {
  return randomBytes(24).toString('base64url');
}

/** Solo se guarda el HMAC (con el secreto del servidor): una copia de la base no revela códigos. */
export function hashSecret(secret: string, pepper: string): string {
  return createHmac('sha256', pepper).update(secret).digest('hex');
}

export function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function assertCodeFormat(code: string): string {
  const clean = code.replace(/\s/g, '');
  if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(clean)) throw new ValidationError(`El código tiene ${CODE_LENGTH} números`);
  return clean;
}

/** Antes de enviar: no más de un código por minuto ni de cinco por hora al mismo destino. */
export function assertCanSend(recent: { createdAt: Date }[], now: Date): void {
  const lastHour = recent.filter((r) => now.getTime() - r.createdAt.getTime() < 3_600_000);
  if (lastHour.length >= MAX_SENDS_PER_HOUR) {
    throw new ConflictError('Pediste demasiados códigos. Espera una hora e inténtalo de nuevo.');
  }
  const last = lastHour.reduce<Date | null>((max, r) => (!max || r.createdAt > max ? r.createdAt : max), null);
  if (last && now.getTime() - last.getTime() < RESEND_AFTER_MS) {
    const seconds = Math.ceil((RESEND_AFTER_MS - (now.getTime() - last.getTime())) / 1000);
    throw new ConflictError(`Espera ${seconds} s para pedir otro código.`);
  }
}

export interface PendingCode {
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  verifiedAt: Date | null;
}

/** Al verificar: vencido, sin intentos o equivocado → error claro (y el intento cuenta). */
export function checkCode(pending: PendingCode | null, codeHash: string, now: Date): void {
  if (!pending || pending.verifiedAt) throw new UnauthorizedError('Pide un código nuevo');
  if (pending.expiresAt <= now) throw new UnauthorizedError('El código venció. Pide uno nuevo.');
  if (pending.attempts >= MAX_ATTEMPTS) throw new UnauthorizedError('Demasiados intentos. Pide un código nuevo.');
  if (!sameHash(pending.codeHash, codeHash)) {
    const left = MAX_ATTEMPTS - pending.attempts - 1;
    throw new UnauthorizedError(left > 0 ? `Código incorrecto. Te quedan ${left} intentos.` : 'Código incorrecto. Pide uno nuevo.');
  }
}

/** Texto del SMS. La última línea («@dominio #código») permite que Android lo lea solo (WebOTP). */
export function smsText(code: string, webHost: string): string {
  return `Tu código de Parla es ${code}. Vence en 10 minutos. No lo compartas con nadie.\n\n@${webHost} #${code}`;
}

export function emailContent(purpose: VerificationPurpose, code: string): { subject: string; html: string } {
  const subject = purpose === 'reset_password' ? `${code} es tu código para restablecer Parla` : `${code} es tu código para confirmar tu correo en Parla`;
  const intro =
    purpose === 'reset_password'
      ? 'Pediste restablecer tu contraseña de Parla. Escribe este código en la app:'
      : 'Escribe este código en Parla para confirmar tu correo:';
  const html = `<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#111b21">
<h2 style="color:#0f766e;margin:0 0 12px">Parla</h2>
<p>${intro}</p>
<p style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:16px 0">${code}</p>
<p style="color:#54656f;font-size:13px">Vence en 10 minutos. Si no fuiste tú, ignora este correo: nadie puede entrar sin el código.</p>
</div>`;
  return { subject, html };
}
