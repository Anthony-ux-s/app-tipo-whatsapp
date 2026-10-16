import { Inject, Injectable } from '@nestjs/common';
import type { SessionUser, UpdateProfileRequest } from '@parla/types';
import { NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { isAvatarColor } from '../../../../../kernel/palette';
import { toSessionUser } from '../../user.mapper';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

@Injectable()
export class UpdateProfileUseCase {
  constructor(@Inject(AUTH_REPOSITORY) private readonly users: AuthRepository) {}

  async execute(userId: string, input: UpdateProfileRequest): Promise<SessionUser> {
    const current = await this.users.findById(userId);
    if (!current) throw new NotFoundError('Usuario no encontrado');

    const displayName = input.displayName?.trim();
    if (displayName !== undefined && displayName.length < 2) throw new ValidationError('Escribe tu nombre');
    if (input.avatarColor !== undefined && !isAvatarColor(input.avatarColor)) {
      throw new ValidationError('Color de avatar no disponible');
    }

    const updated = await this.users.update(userId, {
      displayName,
      about: input.about?.trim(),
      avatarColor: input.avatarColor,
      preferences: input.preferences ? { ...current.preferences, ...input.preferences } : undefined,
    });
    return toSessionUser(updated, 'online');
  }
}
