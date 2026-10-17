import { Inject, Injectable } from '@nestjs/common';
import type { SessionUser, UpdateProfileRequest } from '@parla/types';
import { ConflictError, NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { isValidUsername, normalizeUsername } from '../../../../../kernel/identifier';
import { isAvatarColor } from '../../../../../kernel/palette';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { toPublicUser, toSessionUser } from '../../user.mapper';
import type { UserRecord } from '../../user.record';
import { AUTH_REPOSITORY, type AuthRepository, type ProfileChanges } from '../auth.repository';
import { USERNAME_RULE } from './register-user.use-case';

/** Avisa a los contactos que cambió cómo se ve alguien (nombre, usuario, foto). */
@Injectable()
export class ProfileEvents {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly presence: PresenceRegistry,
  ) {}

  async changed(user: UserRecord): Promise<void> {
    const contacts = await this.users.contactIds(user.id);
    this.realtime.toUsers([...contacts, user.id], 'profile:updated', toPublicUser(user, this.presence.statusOf(user.id)));
  }
}

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: ProfileEvents,
  ) {}

  async execute(userId: string, input: UpdateProfileRequest): Promise<SessionUser> {
    const found = await this.users.findById(userId);
    if (!found) throw new NotFoundError('Usuario no encontrado');
    const current = { ...found };

    const displayName = input.displayName?.trim();
    if (displayName !== undefined && displayName.length < 2) throw new ValidationError('Escribe tu nombre');
    if (input.avatarColor !== undefined && !isAvatarColor(input.avatarColor)) {
      throw new ValidationError('Color de avatar no disponible');
    }

    const changes: ProfileChanges = {
      displayName,
      about: input.about?.trim(),
      avatarColor: input.avatarColor,
      preferences: input.preferences ? { ...current.preferences, ...input.preferences } : undefined,
    };
    if (input.username !== undefined) {
      // El usuario es opcional: vacío lo quita; si no, debe ser válido y libre.
      const username = input.username.trim() ? normalizeUsername(input.username) : null;
      if (username && !isValidUsername(username)) throw new ValidationError(USERNAME_RULE);
      if (username && username !== current.username && (await this.users.findByUsername(username))) {
        throw new ConflictError('Ese nombre de usuario ya está en uso');
      }
      changes.username = username;
    }

    const updated = await this.users.update(userId, changes);
    const visibleChange = updated.displayName !== current.displayName || updated.username !== current.username || updated.about !== current.about || updated.avatarColor !== current.avatarColor;
    if (visibleChange) await this.events.changed(updated);
    return toSessionUser(updated, 'online');
  }
}
