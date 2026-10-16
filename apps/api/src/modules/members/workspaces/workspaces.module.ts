import { Module } from '@nestjs/common';
import { WorkspacesEngineModule } from '../../platform/workspaces/workspaces-engine.module';
import { WorkspacesController } from './workspaces.controller';

@Module({
  imports: [WorkspacesEngineModule],
  controllers: [WorkspacesController],
})
export class WorkspacesModule {}
