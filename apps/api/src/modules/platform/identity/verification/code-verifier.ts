import { Inject, Injectable } from '@nestjs/common';
import type { VerificationStarted } from '@parla/types';
import { APP_ENV, type AppEnv } from '../../../../config/env.validation';
import { DomainError, UnauthorizedError } from '../../../../kernel/domain-error';
import {
  assertCanSend,
  assertCodeFormat,
  checkCode,
  CODE_TTL_MS,
  emailContent,
  generateCode,
  generateProof,
  hashSecret,
  PROOF_TTL_MS,
  RESEND_AFTER_MS,
  smsText,
  type VerificationChannel,
  type VerificationPurpose,
} from '../../../../kernel/verification-rules';
import { DeliveryFailedError, VERIFICATION_SENDER, type VerificationSender } from '../../../../infra/messaging/verification-sender.port';
import { VERIFICATION_CODES_REPOSITORY, type VerificationCodesRepository, type VerificationRecord } from './verification-codes.repository';

/** El envío falló del lado del proveedor: mensaje claro, sin detalles internos. */
class CodeNotSentError extends DomainError {
  readonly kind = 'conflict' as const;
}

interface SendInput {
  channel: VerificationChannel;
  purpose: VerificationPurpose;
  target: string;
  /** Lo que se muestra («+57 *** *** 4567»). */
  sentTo: string;
  userId?: string;
  /** false = no enviar de verdad (p. ej. correo sin cuenta en «olvidé mi contraseña»), pero responder igual. */
  deliver?: boolean;
}

/**
 * Códigos de un solo uso: genera, guarda solo el hash, envía (OneSignal o modo de prueba) y verifica.
 * Al verificar entrega un comprobante de un solo uso para el paso siguiente (registrarse, restablecer).
 */
@Injectable()
export class CodeVerifier {
  constructor(
    @Inject(VERIFICATION_CODES_REPOSITORY) private readonly codes: VerificationCodesRepository,
    @Inject(VERIFICATION_SENDER) private readonly sender: VerificationSender,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async send(input: SendInput): Promise<VerificationStarted> {
    const now = new Date();
    assertCanSend(await this.codes.listRecent(input.target, input.purpose, new Date(now.getTime() - 3_600_000)), now);

    const code = generateCode();
    await this.codes.create({
      channel: input.channel,
      purpose: input.purpose,
      target: input.target,
      userId: input.userId ?? null,
      codeHash: hashSecret(code, this.env.jwtSecret),
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
    });

    if (input.deliver !== false) {
      try {
        if (input.channel === 'sms') {
          await this.sender.sendSms(input.target, smsText(code, new URL(this.env.publicWebUrl).host));
        } else {
          const { subject, html } = emailContent(input.purpose, code);
          await this.sender.sendEmail(input.target, subject, html);
        }
      } catch (error) {
        if (error instanceof DeliveryFailedError) {
          throw new CodeNotSentError(input.channel === 'sms' ? 'No pudimos enviar el SMS. Revisa el número e inténtalo de nuevo.' : 'No pudimos enviar el correo. Inténtalo de nuevo.');
        }
        throw error;
      }
    }

    return {
      sentTo: input.sentTo,
      expiresInSeconds: CODE_TTL_MS / 1000,
      resendInSeconds: RESEND_AFTER_MS / 1000,
      // Solo para probar en desarrollo sin OneSignal: el código vuelve a la pantalla.
      ...(this.sender.provider === 'dev' && !this.env.production && input.deliver !== false ? { devCode: code } : {}),
    };
  }

  /** Verifica el código y devuelve el comprobante para el paso siguiente. */
  async verify(query: { purpose: VerificationPurpose; target?: string; userId?: string }, rawCode: string): Promise<{ proof: string; record: VerificationRecord }> {
    const code = assertCodeFormat(rawCode);
    const pending = await this.codes.findLatestPending(query);
    const now = new Date();
    try {
      checkCode(pending, hashSecret(code, this.env.jwtSecret), now);
    } catch (error) {
      if (pending) await this.codes.countAttempt(pending.id);
      throw error;
    }
    const proof = generateProof();
    await this.codes.markVerified(pending!.id, hashSecret(proof, this.env.jwtSecret), now);
    return { proof, record: pending! };
  }

  /** Usa el comprobante una sola vez; devuelve a qué destino corresponde. */
  async consumeProof(proof: string, purpose: VerificationPurpose): Promise<VerificationRecord> {
    const record = await this.codes.findByProof(hashSecret(proof, this.env.jwtSecret));
    const now = new Date();
    const expired = !record?.verifiedAt || now.getTime() - record.verifiedAt.getTime() > PROOF_TTL_MS;
    if (!record || record.purpose !== purpose || expired || !(await this.codes.consume(record.id, now))) {
      throw new UnauthorizedError('La verificación venció. Vuelve a pedir el código.');
    }
    return record;
  }
}
