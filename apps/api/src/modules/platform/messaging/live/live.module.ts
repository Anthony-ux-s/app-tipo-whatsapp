import { Module } from '@nestjs/common';
import { AuthModule } from '../../identity/auth/auth.module';
import { WorkspacesEngineModule } from '../../workspaces/workspaces-engine.module';
import { CallsEngineModule } from '../calls/calls-engine.module';
import { MessagingEngineModule } from '../conversations/messaging-engine.module';
import { LiveGateway } from './live.gateway';

@Module({
  imports: [AuthModule, WorkspacesEngineModule, MessagingEngineModule, CallsEngineModule],
  providers: [LiveGateway],
})
export class LiveModule {}
