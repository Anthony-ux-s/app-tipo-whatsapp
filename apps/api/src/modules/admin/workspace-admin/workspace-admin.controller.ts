import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import type { ChangeMemberRoleRequest, UpdateWorkspaceRequest, WorkspaceDetail, WorkspaceRole } from '@parla/types';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import {
  ChangeMemberRoleUseCase,
  RegenerateInviteUseCase,
  RemoveMemberUseCase,
  UpdateWorkspaceUseCase,
} from '../../platform/workspaces/use-cases/admin-use-cases';

class UpdateWorkspaceDto implements UpdateWorkspaceRequest {
  @IsOptional() @IsString() @MaxLength(60) name?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsBoolean() allowMemberGroups?: boolean;
}

class ChangeRoleDto implements ChangeMemberRoleRequest {
  @IsIn(['admin', 'member']) role: WorkspaceRole;
}

/** Puerta del administrador: configuración, roles, miembros e invitaciones. Los permisos los exige el caso de uso. */
@Controller('admin/workspaces')
export class WorkspaceAdminController {
  constructor(
    private readonly updateWorkspace: UpdateWorkspaceUseCase,
    private readonly changeRole: ChangeMemberRoleUseCase,
    private readonly removeMember: RemoveMemberUseCase,
    private readonly regenerateInvite: RegenerateInviteUseCase,
  ) {}

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: UpdateWorkspaceDto): Promise<WorkspaceDetail> {
    return this.updateWorkspace.execute(user.userId, id, body);
  }

  @Patch(':id/members/:userId')
  role(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: ChangeRoleDto,
  ): Promise<WorkspaceDetail> {
    return this.changeRole.execute(user.userId, id, userId, body.role);
  }

  @Delete(':id/members/:userId')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string): Promise<WorkspaceDetail> {
    return this.removeMember.execute(user.userId, id, userId);
  }

  @Post(':id/invite-code')
  invite(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<WorkspaceDetail> {
    return this.regenerateInvite.execute(user.userId, id);
  }
}
