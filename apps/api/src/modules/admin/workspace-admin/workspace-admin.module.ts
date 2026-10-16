import { Module } from '@nestjs/common';
import { WorkspacesEngineModule } from '../../platform/workspaces/workspaces-engine.module';
import { WorkspaceAdminController } from './workspace-admin.controller';

@Module({
  imports: [WorkspacesEngineModule],
  controllers: [WorkspaceAdminController],
})
export class WorkspaceAdminModule {}
