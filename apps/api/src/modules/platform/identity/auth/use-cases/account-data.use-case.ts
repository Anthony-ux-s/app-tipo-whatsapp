import { Inject, Injectable } from '@nestjs/common';
import type { AccountExport } from '@parla/types';
import { UnauthorizedError } from '../../../../../kernel/domain-error';
import { EXPORT_NOTE } from '../../../../../kernel/legal';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../../../infra/identity/password-hasher.port';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';
import { avatarUrlOf } from '../../user.mapper';

/** Derecho de acceso y portabilidad: copia de los datos personales de la cuenta. */
@Injectable()
export class ExportAccountUseCase {
  constructor(@Inject(AUTH_REPOSITORY) private readonly users: AuthRepository) {}

  async execute(userId: string): Promise<AccountExport> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedError('Tu cuenta ya no existe');
    const data = await this.users.exportData(userId);
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        username: user.username,
        phone: user.phone,
        displayName: user.displayName,
        about: user.about,
        avatarColor: user.avatarColor,
        avatarUrl: avatarUrlOf(user),
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      preferences: user.preferences,
      termsVersion: user.termsVersion,
      termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
      conversations: data.conversations.map((c) => ({ ...c, joinedAt: c.joinedAt.toISOString() })),
      activity: {
        messagesSent: data.messagesSent,
        tasksCreated: data.tasksCreated,
        tasksAssigned: data.tasksAssigned,
        ordersPlaced: data.ordersPlaced,
      },
      note: EXPORT_NOTE,
    };
  }
}

/**
 * Derecho de supresión: elimina la cuenta. Se exige la contraseña. La cuenta se anonimiza (sus
 * mensajes siguen en los chats de los demás como «Cuenta eliminada») y sus contactos dejan de verla
 * en línea.
 */
@Injectable()
export class DeleteAccountUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(userId: string, password: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedError('Tu cuenta ya no existe');
    if (!(await this.hasher.verify(password, user.passwordHash))) throw new UnauthorizedError('La contraseña no es correcta');

    const contacts = await this.users.contactIds(userId);
    await this.users.anonymize(userId, new Date());
    this.realtime.toUsers(contacts, 'presence', { userId, presence: 'offline', lastSeenAt: null });
  }
}
