import { Inject, Injectable } from '@nestjs/common';
import type { AuthResponse, RegisterRequest } from '@parla/types';
import { ConflictError, ValidationError } from '../../../../../kernel/domain-error';
import {
  assertPasswordStrength,
  isValidPhone,
  isValidUsername,
  normalizePhone,
  normalizeUsername,
} from '../../../../../kernel/identifier';
import { pickAvatarColor } from '../../../../../kernel/palette';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../../../infra/identity/password-hasher.port';
import { TOKEN_SERVICE, type TokenService } from '../../../../../infra/identity/token-service.port';
import { toSessionUser } from '../../user.mapper';
import { DEFAULT_PREFERENCES } from '../../user.record';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

@Injectable()
export class RegisterUserUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(TOKEN_SERVICE) private readonly tokens: TokenService,
  ) {}

  async execute(input: RegisterRequest): Promise<AuthResponse> {
    const phone = input.phone?.trim() ? normalizePhone(input.phone) : null;
    const username = input.username?.trim() ? normalizeUsername(input.username) : null;
    const displayName = input.displayName.trim();

    if (!phone && !username) throw new ValidationError('Indica un teléfono o un nombre de usuario');
    if (phone && !isValidPhone(phone)) {
      throw new ValidationError('Escribe el teléfono con indicativo, por ejemplo +57 300 123 4567');
    }
    if (username && !isValidUsername(username)) {
      throw new ValidationError('El usuario debe tener de 3 a 24 letras minúsculas, números, punto o guion bajo');
    }
    if (displayName.length < 2) throw new ValidationError('Escribe tu nombre');
    assertPasswordStrength(input.password);

    if (phone && (await this.users.findByPhone(phone))) {
      throw new ConflictError('Ese teléfono ya tiene una cuenta');
    }
    if (username && (await this.users.findByUsername(username))) {
      throw new ConflictError('Ese nombre de usuario ya está en uso');
    }

    const user = await this.users.create({
      phone,
      username,
      displayName,
      avatarColor: pickAvatarColor(username ?? phone ?? displayName),
      passwordHash: await this.hasher.hash(input.password),
      publicKey: input.publicKey,
      keyBackup: input.keyBackup,
      preferences: DEFAULT_PREFERENCES,
    });

    return { token: await this.tokens.issue(user.id), user: toSessionUser(user, 'online') };
  }
}
