import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import { InMemoryWorkspacesRepository, makeUser, RecordingRealtime } from '../../../../testing/in-memory.fakes';
import { ChangeMemberRoleUseCase, RemoveMemberUseCase } from './admin-use-cases';
import { GetWorkspaceUseCase, JoinByInviteUseCase } from './member-use-cases';

describe('administración del espacio de trabajo', () => {
  const admin = makeUser({ displayName: 'Laura' });
  const member = makeUser({ displayName: 'Andrés' });
  const outsider = makeUser({ displayName: 'Externo' });
  let repo: InMemoryWorkspacesRepository;
  let realtime: RecordingRealtime;
  let changeRole: ChangeMemberRoleUseCase;
  let remove: RemoveMemberUseCase;
  let getWorkspace: GetWorkspaceUseCase;

  beforeEach(() => {
    repo = new InMemoryWorkspacesRepository();
    repo.workspaces.push({
      id: 'w1',
      name: 'Café Andino',
      description: '',
      color: 'teal',
      inviteCode: 'andino2026',
      allowMemberGroups: true,
      creatorId: admin.id,
      createdAt: new Date(),
      memberCount: 2,
      plan: 'free',
      planExpiresAt: null,
    });
    repo.add(admin, 'w1', 'admin');
    repo.add(member, 'w1', 'member');
    realtime = new RecordingRealtime();
    getWorkspace = new GetWorkspaceUseCase(repo, new PresenceRegistry());
    changeRole = new ChangeMemberRoleUseCase(repo, realtime, getWorkspace);
    remove = new RemoveMemberUseCase(repo, realtime, getWorkspace);
  });

  it('el administrador asciende a un colaborador y todos reciben el aviso', async () => {
    const detail = await changeRole.execute(admin.id, 'w1', member.id, 'admin');
    expect(detail.members.find((m) => m.user.id === member.id)?.role).toBe('admin');
    expect(realtime.events('workspace:changed')[0].userIds).toEqual(expect.arrayContaining([admin.id, member.id]));
  });

  it('un colaborador no puede cambiar roles', async () => {
    await expect(changeRole.execute(member.id, 'w1', admin.id, 'member')).rejects.toThrow(ForbiddenError);
  });

  it('alguien de fuera ni siquiera ve el espacio (404)', async () => {
    await expect(changeRole.execute(outsider.id, 'w1', member.id, 'admin')).rejects.toThrow(NotFoundError);
    await expect(getWorkspace.execute(outsider.id, 'w1')).rejects.toThrow(NotFoundError);
  });

  it('no se puede dejar el espacio sin administradores', async () => {
    const second = makeUser();
    repo.add(second, 'w1', 'admin');
    await changeRole.execute(second.id, 'w1', admin.id, 'member');
    await expect(changeRole.execute(second.id, 'w1', second.id, 'member')).rejects.toThrow(ConflictError);
  });

  it('el administrador no puede quitarse a sí mismo, pero sí a otros', async () => {
    await expect(remove.execute(admin.id, 'w1', admin.id)).rejects.toThrow(ValidationError);
    const detail = await remove.execute(admin.id, 'w1', member.id);
    expect(detail.members.map((m) => m.user.id)).toEqual([admin.id]);
  });

  it('solo el administrador ve el código de invitación', async () => {
    expect((await getWorkspace.execute(admin.id, 'w1')).inviteCode).toBe('andino2026');
    expect((await getWorkspace.execute(member.id, 'w1')).inviteCode).toBeNull();
  });

  it('unirse con el enlace deja a la persona como colaboradora (y no dos veces)', async () => {
    const join = new JoinByInviteUseCase(repo, realtime);
    const ws = await join.execute(outsider.id, 'andino2026');
    expect(ws.role).toBe('member');
    await expect(join.execute(outsider.id, 'andino2026')).rejects.toThrow(ConflictError);
    await expect(join.execute(outsider.id, 'codigo-malo')).rejects.toThrow(NotFoundError);
  });
});
