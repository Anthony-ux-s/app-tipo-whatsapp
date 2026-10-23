import { Inject, Injectable } from '@nestjs/common';
import type { AuthResponse, LoginRequest } from '@parla/types';
import { DomainError, ForbiddenError, UnauthorizedError } from '../../../../../kernel/domain-error';
import { parseIdentifier, type Identifier } from '../../../../../kernel/identifier';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../../../infra/identity/password-hasher.port';
import { TOKEN_SERVICE, type TokenService } from '../../../../../infra/identity/token-service.port';
import { toSessionUser } from '../../user.mapper';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

const INVALID = 'Usuario, correo, teléfono o contraseña incorrectos';
const SUSPENDED = 'Tu cuenta está suspendida. Escríbenos a soporte para revisarla.';

@Injectable()
export class LoginUseCase {
  private dummyHash: Promise<string> | undefined;

  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  async execute(input: LoginRequest): Promise<AuthResponse> {
    let identifier: Identifier;
    try {
      identifier = parseIdentifier(input.identifier);
    } catch (error) {
      if (error instanceof DomainError) throw new UnauthorizedError(INVALID);
      throw error;
    }

    const user =
      'phone' in identifier
        ? await this.users.findByPhone(identifier.phone)
        : 'email' in identifier
          ? await this.users.findByVerifiedEmail(identifier.email)
          : await this.users.findByUsername(identifier.username);

    // Se compara siempre para no revelar por tiempo de respuesta si la cuenta existe.
    this.dummyHash ??= this.hasher.hash('parla-cuenta-inexistente');
    const hash = user?.passwordHash ?? (await this.dummyHash);
    const matches = await this.hasher.verify(input.password, hash);
    if (!user || !matches) throw new UnauthorizedError(INVALID);
    if (user.blockedAt) throw new ForbiddenError(SUSPENDED);

    return { token: await this.tokens.issue(user.id), user: toSessionUser(user, 'online') };
  }
}
