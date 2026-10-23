import { Inject, Injectable } from '@nestjs/common';
import type { GoogleSignInResponse, VerificationProof, VerificationStarted } from '@parla/types';
import { ConflictError } from '../../../../../kernel/domain-error';
import { maskEmail, maskPhone, parseEmail, parsePhone } from '../../../../../kernel/phone';
import { FirebaseTokenVerifier } from '../../../../../infra/auth/firebase-token.verifier';
import { ForbiddenError, UnauthorizedError } from '../../../../../kernel/domain-error';
import { TOKEN_SERVICE, type TokenService } from '../../../../../infra/identity/token-service.port';
import { toSessionUser } from '../../user.mapper';
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

/** Registro con correo, paso 1: el código llega al correo que escribió la persona (Brevo). */
@Injectable()
export class StartEmailRegistrationUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly verifier: CodeVerifier,
  ) {}

  async execute(rawEmail: string): Promise<VerificationStarted> {
    const email = parseEmail(rawEmail);
    if (await this.users.findByVerifiedEmail(email)) throw new ConflictError('Ese correo ya tiene una cuenta. Inicia sesión.');
    return this.verifier.send({ channel: 'email', purpose: 'register', target: email, sentTo: maskEmail(email) });
  }
}

/** Registro con correo, paso 2: el código correcto entrega el comprobante para crear la cuenta. */
@Injectable()
export class VerifyEmailRegistrationUseCase {
  constructor(private readonly verifier: CodeVerifier) {}

  async execute(rawEmail: string, code: string): Promise<VerificationProof> {
    const { proof } = await this.verifier.verify({ purpose: 'register', target: parseEmail(rawEmail) }, code);
    return { verificationToken: proof };
  }
}

/**
 * «Continuar con Google»: Firebase comprueba la cuenta de Google y aquí solo se valida su resultado. Con cuenta
 * existente entrega la sesión (la contraseña de Parla sigue siendo necesaria para abrir las claves del navegador);
 * sin cuenta entrega el comprobante del correo para registrarse.
 */
@Injectable()
export class GoogleSignInUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly verifier: CodeVerifier,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(FIREBASE_VERIFIER) private readonly firebase: FirebaseTokenVerifier | null,
  ) {}

  async execute(idToken: string): Promise<GoogleSignInResponse> {
    if (!this.firebase) throw new UnauthorizedError('Entrar con Google no está activado en este servidor.');
    const identity = await this.firebase.verifyGoogleToken(idToken);
    const email = parseEmail(identity.email);
    const user = await this.users.findByVerifiedEmail(email);
    if (user) {
      if (user.blockedAt) throw new ForbiddenError('Tu cuenta está suspendida. Escríbenos a soporte para revisarla.');
      return { kind: 'login', auth: { token: await this.tokens.issue(user.id), user: toSessionUser(user, 'online') } };
    }
    return { kind: 'register', verificationToken: await this.verifier.grantProof({ channel: 'email', purpose: 'register', target: email }), email, displayName: identity.name };
  }
}
