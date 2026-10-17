import { Inject, Injectable } from '@nestjs/common';
import type { SessionUser, VerificationStarted } from '@parla/types';
import { ConflictError, NotFoundError } from '../../../../../kernel/domain-error';
import { maskEmail, parseEmail } from '../../../../../kernel/phone';
import { CodeVerifier } from '../../verification/code-verifier';
import { toSessionUser } from '../../user.mapper';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

/** Agregar o cambiar el correo de recuperación: primero llega un código al correo. */
@Injectable()
export class StartEmailVerificationUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly verifier: CodeVerifier,
  ) {}

  async execute(userId: string, rawEmail: string): Promise<VerificationStarted> {
    const email = parseEmail(rawEmail);
    const owner = await this.users.findByVerifiedEmail(email);
    if (owner && owner.id !== userId) throw new ConflictError('Ese correo ya está en otra cuenta de Parla');
    return this.verifier.send({ channel: 'email', purpose: 'email', target: email, sentTo: maskEmail(email), userId });
  }
}

/** El código correcto deja el correo verificado en la cuenta. */
@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly verifier: CodeVerifier,
  ) {}

  async execute(userId: string, code: string): Promise<SessionUser> {
    const { record } = await this.verifier.verify({ purpose: 'email', userId }, code);
    const owner = await this.users.findByVerifiedEmail(record.target);
    if (owner && owner.id !== userId) throw new ConflictError('Ese correo ya está en otra cuenta de Parla');
    if (!(await this.users.findById(userId))) throw new NotFoundError('Usuario no encontrado');
    const updated = await this.users.update(userId, { email: record.target, emailVerifiedAt: new Date() });
    return toSessionUser(updated, 'online');
  }
}
