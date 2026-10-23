import { Inject, Injectable } from '@nestjs/common';
import type { AuthResponse, RegisterRequest } from '@parla/types';
import { ConflictError, ValidationError } from '../../../../../kernel/domain-error';
import { assertPasswordStrength, isValidUsername, normalizeUsername } from '../../../../../kernel/identifier';
import { assertTermsAccepted, TERMS_VERSION } from '../../../../../kernel/legal';
import { pickAvatarColor } from '../../../../../kernel/palette';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../../../infra/identity/password-hasher.port';
import { TOKEN_SERVICE, type TokenService } from '../../../../../infra/identity/token-service.port';
import { CodeVerifier } from '../../verification/code-verifier';
import { toSessionUser } from '../../user.mapper';
import { DEFAULT_PREFERENCES } from '../../user.record';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

export const USERNAME_RULE = 'El usuario debe tener de 3 a 24 letras minúsculas, números, punto o guion bajo';

/**
 * Paso 3 del registro: con el teléfono (SMS) o el correo ya verificado, nombre (obligatorio), usuario
 * (opcional) y contraseña, que protege la copia cifrada de las claves.
 */
@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
    private readonly verifier: CodeVerifier,
  ) {}

  async execute(input: RegisterRequest): Promise<AuthResponse> {
    const username = input.username?.trim() ? normalizeUsername(input.username) : null;
    const displayName = input.displayName.trim();
    if (username && !isValidUsername(username)) throw new ValidationError(USERNAME_RULE);
    if (displayName.length < 2) throw new ValidationError('Escribe tu nombre');
    assertPasswordStrength(input.password);
    assertTermsAccepted(input.acceptTerms);
    if (username && (await this.users.findByUsername(username))) throw new ConflictError('Ese nombre de usuario ya está en uso');

    // El comprobante se usa una sola vez: dos registros con el mismo SMS no crean dos cuentas.
    const verified = await this.verifier.consumeProof(input.verificationToken, 'register');
    // El comprobante dice si se verificó un teléfono (SMS) o un correo: la cuenta se crea con ese dato.
    const byEmail = verified.channel === 'email';
    const contact = verified.target;
    if (byEmail ? await this.users.findByVerifiedEmail(contact) : await this.users.findByPhone(contact)) {
      throw new ConflictError(byEmail ? 'Ese correo ya tiene una cuenta. Inicia sesión.' : 'Ese número ya tiene una cuenta. Inicia sesión.');
    }
    // Quien se registra con el correo y no elige usuario recibe uno sugerido (así siempre tiene un @usuario).
    const handle = username ?? (byEmail ? await this.freeUsername(contact) : null);

    const user = await this.users.create({
      phone: byEmail ? null : contact,
      phoneVerifiedAt: byEmail ? null : verified.verifiedAt!,
      ...(byEmail ? { email: contact, emailVerifiedAt: verified.verifiedAt! } : {}),
      username: handle,
      displayName,
      avatarColor: pickAvatarColor(handle ?? contact),
      passwordHash: await this.hasher.hash(input.password),
      publicKey: input.publicKey,
      keyBackup: input.keyBackup,
      preferences: DEFAULT_PREFERENCES,
      termsVersion: TERMS_VERSION,
      termsAcceptedAt: new Date(),
    });

    if (byEmail) void this.verifier.sendWelcome(contact, displayName);
    return { token: await this.tokens.issue(user.id), user: toSessionUser(user, 'online') };
  }

  /** «rosa.perez@correo.com» → «rosa.perez», o «rosa.perez4821» si ya está en uso. */
  private async freeUsername(email: string): Promise<string> {
    const base = email.split('@')[0].toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 18).padEnd(3, '0');
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate = attempt === 0 ? base : `${base}${Math.floor(1000 + Math.random() * 9000)}`;
      if (isValidUsername(candidate) && !(await this.users.findByUsername(candidate))) return candidate;
    }
    return `usuario${Date.now().toString(36)}`.slice(0, 24);
  }
}
