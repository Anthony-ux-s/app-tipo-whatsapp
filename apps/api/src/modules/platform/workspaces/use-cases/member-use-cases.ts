import { Inject, Injectable } from '@nestjs/common';
import type {
  CreateWorkspaceRequest,
  InvitePreview,
  WorkspaceDetail,
  WorkspaceSummary,
} from '@parla/types';
import { ConflictError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { generateInviteCode } from '../../../../kernel/invite-code';
import { isAvatarColor } from '../../../../kernel/palette';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { toWorkspaceDetail, toWorkspaceSummary } from '../workspace.mapper';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../workspaces.repository';

@Injectable()
export class ListMyWorkspacesUseCase {
  constructor(@Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository) {}

  async execute(userId: string): Promise<WorkspaceSummary[]> {
    const rows = await this.workspaces.listForUser(userId);
    return rows.map((ws) => toWorkspaceSummary(ws, ws.role));
  }
}

@Injectable()
export class GetWorkspaceUseCase {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(userId: string, workspaceId: string): Promise<WorkspaceDetail> {
    const role = await this.workspaces.roleOf(workspaceId, userId);
    const ws = role ? await this.workspaces.findById(workspaceId) : null;
    // 404 y no 403: no se revela si existe un espacio al que no perteneces.
    if (!role || !ws) throw new NotFoundError('Espacio de trabajo no encontrado');
    const members = await this.workspaces.listMembers(workspaceId);
    return toWorkspaceDetail(ws, role, members, (id) => this.presence.statusOf(id));
  }
}

@Injectable()
export class CreateWorkspaceUseCase {
  constructor(@Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository) {}

  async execute(userId: string, input: CreateWorkspaceRequest): Promise<WorkspaceSummary> {
    const name = input.name.trim();
    if (name.length < 3) throw new ValidationError('El nombre del espacio debe tener al menos 3 caracteres');
    const color = input.color && isAvatarColor(input.color) ? input.color : 'teal';
    const ws = await this.workspaces.create({
      name,
      description: input.description?.trim() ?? '',
      color,
      inviteCode: generateInviteCode(),
      creatorId: userId,
    });
    return toWorkspaceSummary(ws, 'admin');
  }
}

@Injectable()
export class PreviewInviteUseCase {
  constructor(@Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository) {}

  async execute(userId: string, code: string): Promise<InvitePreview> {
    const ws = await this.workspaces.findByInviteCode(code);
    if (!ws) throw new NotFoundError('Este enlace de invitación no es válido o fue renovado');
    return {
      workspaceId: ws.id,
      name: ws.name,
      description: ws.description,
      color: ws.color,
      memberCount: ws.memberCount,
      alreadyMember: (await this.workspaces.roleOf(ws.id, userId)) !== null,
    };
  }
}

@Injectable()
export class JoinByInviteUseCase {
  constructor(
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(userId: string, code: string): Promise<WorkspaceSummary> {
    const ws = await this.workspaces.findByInviteCode(code);
    if (!ws) throw new NotFoundError('Este enlace de invitación no es válido o fue renovado');
    if ((await this.workspaces.roleOf(ws.id, userId)) !== null) {
      throw new ConflictError('Ya eres miembro de este espacio');
    }
    await this.workspaces.addMember(ws.id, userId, 'member');
    const members = await this.workspaces.listMembers(ws.id);
    this.realtime.toUsers(
      members.map((m) => m.user.id),
      'workspace:changed',
      { workspaceId: ws.id },
    );
    return toWorkspaceSummary({ ...ws, memberCount: members.length }, 'member');
  }
}
