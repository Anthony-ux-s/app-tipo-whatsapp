import { Module } from '@nestjs/common';
import { TasksEngineModule } from '../../platform/collaboration/tasks/tasks-engine.module';
import { MessagingEngineModule } from '../../platform/messaging/conversations/messaging-engine.module';
import { ChatsController } from './chats.controller';

@Module({
  imports: [MessagingEngineModule, TasksEngineModule],
  controllers: [ChatsController],
})
export class ChatsModule {}
