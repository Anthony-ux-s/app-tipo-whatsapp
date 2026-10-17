import { Inject, Injectable } from '@nestjs/common';
import type { AuthResponse, ResetPasswordRequest, VerificationProof, VerificationStarted } from '@parla/types';
import { UnauthorizedError } from '../../../../kernel/domain-error';
import { assertPasswordStrength } from '../../../../kernel/identifier';
import { maskEmail, parseEmail } from '../../../../kernel/phone';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../../infra/identity/password-hasher.port';
import { TOKEN_SERVICE, type TokenService } from '../../../../infra/identity/token-service.port';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../../messaging/conversations/conversations.repository';
import { ConversationEvents } from '../../messaging/conversations/conversation-events';
import { SendMessageUseCase } from '../../messaging/conversations/use-cases/send-message.use-case';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth/auth.repository';
import { toSessionUser } from '../user.mapper';
import { CodeVerifier } from '../verification/code-verifier';

/**
 * «¿Olvidaste tu contraseña?»: código al correo verificado. Responde lo mismo exista o no la cuenta,
 * para no revelar qué correos están en Parla.
 */
@Injectable()
export class ForgotPasswordUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly verifier: CodeVerifier,
  ) {}

  async execute(rawEmail: string): Promise<VerificationStarted> {
    const email = parseEmail(rawEmail);
    const user = await this.users.findByVerifiedEmail(email);
    return this.verifier.send({
      channel: 'email',
      purpose: 'reset_password',
      target: email,
      sentTo: maskEmail(email),
      userId: user?.id,
      deliver: Boolean(user),
    });
  }
}

@Injectable()
export class VerifyResetCodeUseCase {
  constructor(private readonly verifier: CodeVerifier) {}

  async execute(rawEmail: string, code: string): Promise<VerificationProof> {
    const { proof } = await this.verifier.verify({ purpose: 'reset_password', target: parseEmail(rawEmail) }, code);
    return { verificationToken: proof };
  }
}

/**
 * Contraseña nueva. La clave privada estaba cifrada con la anterior, así que el navegador trae claves
 * nuevas. En cada chat su copia de la clave queda pendiente y aparece un aviso: otra persona del chat
 * decide si se la vuelve a compartir (como el «cambió el código de seguridad» de WhatsApp).
 */
@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly verifier: CodeVerifier,
    private readonly sendMessage: SendMessageUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(input: ResetPasswordRequest): Promise<AuthResponse> {
    assertPasswordStrength(input.password);
    const verified = await this.verifier.consumeProof(input.verificationToken, 'reset_password');
    const user = await this.users.findByVerifiedEmail(verified.target);
    if (!user) throw new UnauthorizedError('La verificación venció. Vuelve a pedir el código.');

    const updated = await this.users.update(user.id, {
      passwordHash: await this.hasher.hash(input.password),
      publicKey: input.publicKey,
      keyBackup: input.keyBackup,
    });

    for (const conversationId of await this.conversations.markKeysPending(user.id)) {
      const others = (await this.conversations.participantIds(conversationId)).filter((id) => id !== user.id);
      await this.sendMessage.postSystem(conversationId, user.id, `${user.displayName} restableció su cuenta y cambió su clave de seguridad`, others);
      await this.events.conversationChanged(conversationId, [...others, user.id]);
    }

    return { token: await this.tokens.issue(user.id), user: toSessionUser(updated, 'online') };
  }
}
