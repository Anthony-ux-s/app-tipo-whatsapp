import { Inject, Injectable } from '@nestjs/common';
import type { UpdateWorkspaceRequest, WorkspaceDetail, WorkspaceRole } from '@parla/types';
import { NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { generateInviteCode } from '../../../../kernel/invite-code';
import { assertIsAdmin, assertKeepsAnAdmin } from '../../../../kernel/workspace-permissions';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../workspaces.repository';
import { GetWorkspaceUseCase } from './member-use-cases';

/** Base de los casos de uso de administración: exige rol admin y avisa a los miembros del cambio. */
abstract class AdminAction {
  constructor(
    protected readonly workspaces: WorkspacesRepository,
    protected readonly realtime: RealtimePublisher,
    protected readonly getWorkspace: GetWorkspaceUseCase,
  ) {}

  protected async requireAdmin(workspaceId: string, userId: string): Promise<void> {
    const role = await this.workspaces.roleOf(workspaceId, userId);
    if (role === null) throw new NotFoundError('Espacio de trabajo no encontrado');
    assertIsAdmin(role);
  }

  protected async notifyAndReturn(
    workspaceId: string,
    actorId: string,
    extraUserIds: string[] = [],
  ): Promise<WorkspaceDetail> {
    const detail = await this.getWorkspace.execute(actorId, workspaceId);
    this.realtime.toUsers(
      [...detail.members.map((m) => m.user.id), ...extraUserIds],
      'workspace:changed',
      { workspaceId },
    );
    return detail;
  }

  protected async requireMemberRole(workspaceId: string, userId: string): Promise<WorkspaceRole> {
    const role = await this.workspaces.roleOf(workspaceId, userId);
    if (role === null) throw new NotFoundError('Esa persona no es miembro del espacio');
    return role;
  }
}

@Injectable()
export class UpdateWorkspaceUseCase extends AdminAction {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) workspaces: WorkspacesRepository,
    @Inject(REALTIME_PUBLISHER) realtime: RealtimePublisher,
    getWorkspace: GetWorkspaceUseCase,
  ) {
    super(workspaces, realtime, getWorkspace);
  }

  async execute(actorId: string, workspaceId: string, input: UpdateWorkspaceRequest): Promise<WorkspaceDetail> {
    await this.requireAdmin(workspaceId, actorId);
    const name = input.name?.trim();
    if (name !== undefined && name.length < 3) {
      throw new ValidationError('El nombre del espacio debe tener al menos 3 caracteres');
    }
    await this.workspaces.update(workspaceId, {
      name,
      description: input.description?.trim(),
      allowMemberGroups: input.allowMemberGroups,
    });
    return this.notifyAndReturn(workspaceId, actorId);
  }
}

@Injectable()
export class ChangeMemberRoleUseCase extends AdminAction {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) workspaces: WorkspacesRepository,
    @Inject(REALTIME_PUBLISHER) realtime: RealtimePublisher,
    getWorkspace: GetWorkspaceUseCase,
  ) {
    super(workspaces, realtime, getWorkspace);
  }

  async execute(actorId: string, workspaceId: string, userId: string, role: WorkspaceRole): Promise<WorkspaceDetail> {
    await this.requireAdmin(workspaceId, actorId);
    const current = await this.requireMemberRole(workspaceId, userId);
    if (current !== role) {
      assertKeepsAnAdmin(await this.workspaces.countAdmins(workspaceId), current, role);
      await this.workspaces.changeRole(workspaceId, userId, role);
    }
    return this.notifyAndReturn(workspaceId, actorId);
  }
}

@Injectable()
export class RemoveMemberUseCase extends AdminAction {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) workspaces: WorkspacesRepository,
    @Inject(REALTIME_PUBLISHER) realtime: RealtimePublisher,
    getWorkspace: GetWorkspaceUseCase,
  ) {
    super(workspaces, realtime, getWorkspace);
  }

  async execute(actorId: string, workspaceId: string, userId: string): Promise<WorkspaceDetail> {
    await this.requireAdmin(workspaceId, actorId);
    if (actorId === userId) throw new ValidationError('No puedes quitarte a ti mismo del espacio');
    const current = await this.requireMemberRole(workspaceId, userId);
    assertKeepsAnAdmin(await this.workspaces.countAdmins(workspaceId), current, 'removed');
    await this.workspaces.removeMember(workspaceId, userId);
    return this.notifyAndReturn(workspaceId, actorId, [userId]);
  }
}

@Injectable()
export class RegenerateInviteUseCase extends AdminAction {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) workspaces: WorkspacesRepository,
    @Inject(REALTIME_PUBLISHER) realtime: RealtimePublisher,
    getWorkspace: GetWorkspaceUseCase,
  ) {
    super(workspaces, realtime, getWorkspace);
  }

  async execute(actorId: string, workspaceId: string): Promise<WorkspaceDetail> {
    await this.requireAdmin(workspaceId, actorId);
    await this.workspaces.update(workspaceId, { inviteCode: generateInviteCode() });
    return this.getWorkspace.execute(actorId, workspaceId);
  }
}
