import { Controller, Get, Param, Post } from '@nestjs/common';
import type { InvitePreview, WorkspaceSummary } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { JoinByInviteUseCase, PreviewInviteUseCase } from '../../platform/workspaces/use-cases/member-use-cases';

/** Enlaces de invitación: ver a qué espacio invitan y unirse como colaborador. */
@Controller('invites')
export class InvitesController {
  constructor(
    private readonly previewInvite: PreviewInviteUseCase,
    private readonly joinByInvite: JoinByInviteUseCase,
  ) {}

  @Get(':code')
  preview(@CurrentUser() user: AuthUser, @Param('code') code: string): Promise<InvitePreview> {
    return this.previewInvite.execute(user.userId, code);
  }

  @Post(':code/join')
  join(@CurrentUser() user: AuthUser, @Param('code') code: string): Promise<WorkspaceSummary> {
    return this.joinByInvite.execute(user.userId, code);
  }
}
