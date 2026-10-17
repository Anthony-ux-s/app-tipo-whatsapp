import { Module } from '@nestjs/common';
import { AuthModule } from '../../identity/auth/auth.module';
import { WorkspacesEngineModule } from '../../workspaces/workspaces-engine.module';
import { MessagingEngineModule } from '../conversations/messaging-engine.module';
import { PushEngineModule } from '../push/push-engine.module';
import { RealtimeBridgeController } from './realtime-bridge.controller';
import {
  ConversationContextUseCase,
  LogCallUseCase,
  NotifyIncomingCallUseCase,
  PresenceChangedUseCase,
} from './use-cases/realtime-bridge.use-cases';

/** Puente entre el core y el servicio de tiempo real en Elixir (rutas /api/internal/*). */
@Module({
  imports: [AuthModule, WorkspacesEngineModule, MessagingEngineModule, PushEngineModule],
  controllers: [RealtimeBridgeController],
  providers: [PresenceChangedUseCase, ConversationContextUseCase, LogCallUseCase, NotifyIncomingCallUseCase],
})
export class RealtimeBridgeModule {}
