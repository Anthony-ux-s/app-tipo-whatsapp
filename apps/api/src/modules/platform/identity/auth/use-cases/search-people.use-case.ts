import { Inject, Injectable } from '@nestjs/common';
import type { PublicUser } from '@parla/types';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { toPublicUser } from '../../user.mapper';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

const MAX_RESULTS = 50;

/** Directorio de Parla: como en WhatsApp, puedes escribirle a cualquier persona registrada. */
@Injectable()
export class SearchPeopleUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(userId: string, query: string): Promise<PublicUser[]> {
    const people = await this.users.searchDirectory(userId, query.slice(0, 60), MAX_RESULTS);
    return people.map((u) => toPublicUser(u, this.presence.statusOf(u.id)));
  }
}
