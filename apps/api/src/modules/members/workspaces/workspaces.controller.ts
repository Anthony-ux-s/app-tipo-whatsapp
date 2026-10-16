import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { WorkspaceDetail, WorkspaceSummary } from '@parla/types';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import {
  CreateWorkspaceUseCase,
  GetWorkspaceUseCase,
  ListMyWorkspacesUseCase,
} from '../../platform/workspaces/use-cases/member-use-cases';

class CreateWorkspaceDto {
  @IsString() @MaxLength(60) name: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsIn(['teal', 'emerald', 'cyan']) color?: string;
}

/** Puerta de los miembros a sus espacios de trabajo. Quien crea un espacio queda como administrador. */
@Controller('workspaces')
export class WorkspacesController {
  constructor(
    private readonly listMine: ListMyWorkspacesUseCase,
    private readonly getWorkspace: GetWorkspaceUseCase,
    private readonly createWorkspace: CreateWorkspaceUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<WorkspaceSummary[]> {
    return this.listMine.execute(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() body: CreateWorkspaceDto): Promise<WorkspaceSummary> {
    return this.createWorkspace.execute(user.userId, body);
  }

  @Get(':id')
  one(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<WorkspaceDetail> {
    return this.getWorkspace.execute(user.userId, id);
  }
}
