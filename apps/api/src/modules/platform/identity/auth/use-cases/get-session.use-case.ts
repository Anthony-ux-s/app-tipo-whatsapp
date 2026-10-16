import { Inject, Injectable } from '@nestjs/common';
import type { SessionUser } from '@parla/types';
import { UnauthorizedError } from '../../../../../kernel/domain-error';
import { toSessionUser } from '../../user.mapper';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

@Injectable()
export class GetSessionUseCase {
  constructor(@Inject(AUTH_REPOSITORY) private readonly users: AuthRepository) {}

  async execute(userId: string): Promise<SessionUser> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedError('Tu cuenta ya no existe');
    return toSessionUser(user, 'online');
  }
}
