import { Module } from '@nestjs/common';
import { WorkspacesEngineModule } from '../../platform/workspaces/workspaces-engine.module';
import { InvitesController } from './invites.controller';

@Module({
  imports: [WorkspacesEngineModule],
  controllers: [InvitesController],
})
export class InvitesModule {}
