import { Inject, Injectable } from '@nestjs/common';
import type { AccountExport } from '@parla/types';
import { ConflictError, UnauthorizedError } from '../../../../../kernel/domain-error';
import { EXPORT_NOTE } from '../../../../../kernel/legal';
import { PASSWORD_HASHER, type PasswordHasher } from '../../../../../infra/identity/password-hasher.port';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../../workspaces/workspaces.repository';
import { AUTH_REPOSITORY, type AuthRepository } from '../auth.repository';

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
        lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      preferences: user.preferences,
      termsVersion: user.termsVersion,
      termsAcceptedAt: user.termsAcceptedAt?.toISOString() ?? null,
      workspaces: data.workspaces.map((w) => ({ ...w, joinedAt: w.joinedAt.toISOString() })),
      conversations: data.conversations.map((c) => ({ ...c, joinedAt: c.joinedAt.toISOString() })),
      activity: { messagesSent: data.messagesSent, tasksCreated: data.tasksCreated, tasksAssigned: data.tasksAssigned },
      note: EXPORT_NOTE,
    };
  }
}

/**
 * Derecho de supresión: elimina la cuenta. Se exige la contraseña y que ningún espacio con más gente
 * se quede sin administrador. Los espacios donde la persona estaba sola se borran.
 */
@Injectable()
export class DeleteAccountUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(userId: string, password: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) throw new UnauthorizedError('Tu cuenta ya no existe');
    if (!(await this.hasher.verify(password, user.passwordHash))) throw new UnauthorizedError('La contraseña no es correcta');

    const mine = await this.workspaces.listForUser(userId);
    const alone: string[] = [];
    for (const ws of mine) {
      if (ws.memberCount <= 1) {
        alone.push(ws.id);
        continue;
      }
      if (ws.role === 'admin' && (await this.workspaces.countAdmins(ws.id)) <= 1) {
        throw new ConflictError(`Nombra a otro administrador en «${ws.name}» antes de eliminar tu cuenta`);
      }
    }

    const shared = mine.filter((ws) => !alone.includes(ws.id));
    const audience = await Promise.all(shared.map(async (ws) => ({ ws, members: await this.workspaces.listMembers(ws.id) })));
    for (const id of alone) await this.workspaces.delete(id);
    await this.users.anonymize(userId, new Date());
    for (const { ws, members } of audience) {
      this.realtime.toUsers(members.map((m) => m.user.id).filter((id) => id !== userId), 'workspace:changed', { workspaceId: ws.id });
    }
  }
}
