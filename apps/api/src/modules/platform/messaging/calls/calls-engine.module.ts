import { Module } from '@nestjs/common';
import { WorkspacesEngineModule } from '../../workspaces/workspaces-engine.module';
import { MessagingEngineModule } from '../conversations/messaging-engine.module';
import { PushEngineModule } from '../push/push-engine.module';
import { CallCoordinator } from './use-cases/call-coordinator';

/** El MOTOR de llamadas: estado de las llamadas en curso y señalización (sin rutas). */
@Module({
  imports: [MessagingEngineModule, PushEngineModule, WorkspacesEngineModule],
  providers: [CallCoordinator],
  exports: [CallCoordinator],
})
export class CallsEngineModule {}
