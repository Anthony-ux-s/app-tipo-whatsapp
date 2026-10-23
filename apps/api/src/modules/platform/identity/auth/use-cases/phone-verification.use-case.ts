import { Inject, Injectable } from '@nestjs/common';
import type { VerificationProof, VerificationStarted } from '@parla/types';
import { ConflictError } from '../../../../../kernel/domain-error';
import { maskPhone, parsePhone } from '../../../../../kernel/phone';
import { FirebaseTokenVerifier } from '../../../../../infra/auth/firebase-token.verifier';
import { UnauthorizedError } from '../../../../../kernel/domain-error';
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

/** Paso 1 y 2 con Firebase: Firebase manda el SMS y comprueba el código; aquí solo se valida su resultado. */
export const FIREBASE_VERIFIER = Symbol('FIREBASE_VERIFIER');

@Injectable()
export class VerifyFirebasePhoneUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly verifier: CodeVerifier,
    @Inject(FIREBASE_VERIFIER) private readonly firebase: FirebaseTokenVerifier | null,
  ) {}

  async execute(idToken: string): Promise<VerificationProof> {
    if (!this.firebase) throw new UnauthorizedError('La verificación con Firebase no está activada en este servidor.');
    const identity = await this.firebase.verifyPhoneToken(idToken);
    const phone = parsePhone(identity.phone);
    if (await this.users.findByPhone(phone)) throw new ConflictError('Ese número ya tiene una cuenta. Inicia sesión.');
    return { verificationToken: await this.verifier.grantProof({ channel: 'sms', purpose: 'register', target: phone }) };
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
