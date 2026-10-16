import { Module } from '@nestjs/common';
import { MessagingEngineModule } from '../../platform/messaging/conversations/messaging-engine.module';
import { ChatsController } from './chats.controller';

@Module({
  imports: [MessagingEngineModule],
  controllers: [ChatsController],
})
export class ChatsModule {}
