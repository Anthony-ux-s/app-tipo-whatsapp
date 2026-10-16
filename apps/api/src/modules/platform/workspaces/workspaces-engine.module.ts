import { Module } from '@nestjs/common';
import { PrismaWorkspacesRepository } from './prisma-workspaces.repository';
import {
  ChangeMemberRoleUseCase,
  RegenerateInviteUseCase,
  RemoveMemberUseCase,
  UpdateWorkspaceUseCase,
} from './use-cases/admin-use-cases';
import {
  CreateWorkspaceUseCase,
  GetWorkspaceUseCase,
  JoinByInviteUseCase,
  ListMyWorkspacesUseCase,
  PreviewInviteUseCase,
} from './use-cases/member-use-cases';
import { WORKSPACES_REPOSITORY } from './workspaces.repository';

const USE_CASES = [
  ListMyWorkspacesUseCase,
  GetWorkspaceUseCase,
  CreateWorkspaceUseCase,
  PreviewInviteUseCase,
  JoinByInviteUseCase,
  UpdateWorkspaceUseCase,
  ChangeMemberRoleUseCase,
  RemoveMemberUseCase,
  RegenerateInviteUseCase,
];

/** El MOTOR de espacios de trabajo: puerto, adaptador y casos de uso, sin una sola ruta. */
@Module({
  providers: [{ provide: WORKSPACES_REPOSITORY, useClass: PrismaWorkspacesRepository }, ...USE_CASES],
  exports: [WORKSPACES_REPOSITORY, ...USE_CASES],
})
export class WorkspacesEngineModule {}
