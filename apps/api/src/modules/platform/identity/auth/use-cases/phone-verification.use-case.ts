import { Inject, Injectable } from '@nestjs/common';
import type { VerificationProof, VerificationStarted } from '@parla/types';
import { ConflictError } from '../../../../../kernel/domain-error';
import { maskPhone, parsePhone } from '../../../../../kernel/phone';
import { CodeVerifier } from '../../verification/code-verifier';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

/** Paso 1 del registro: el código por SMS al número que escribió la persona. */
@Injectable()
export class StartPhoneVerificationUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly verifier: CodeVerifier,
  ) {}

  async execute(rawPhone: string): Promise<VerificationStarted> {
    const phone = parsePhone(rawPhone);
    if (await this.users.findByPhone(phone)) throw new ConflictError('Ese número ya tiene una cuenta. Inicia sesión.');
    return this.verifier.send({ channel: 'sms', purpose: 'register', target: phone, sentTo: maskPhone(phone) });
  }
}

/** Paso 2 del registro: el código correcto entrega el comprobante para crear la cuenta. */
@Injectable()
export class VerifyPhoneUseCase {
  constructor(private readonly verifier: CodeVerifier) {}

  async execute(rawPhone: string, code: string): Promise<VerificationProof> {
    const { proof } = await this.verifier.verify({ purpose: 'register', target: parsePhone(rawPhone) }, code);
    return { verificationToken: proof };
  }
}
