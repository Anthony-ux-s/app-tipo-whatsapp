import { Module } from '@nestjs/common';
import { WorkspacesEngineModule } from '../../workspaces/workspaces-engine.module';
import { ConversationEvents } from './conversation-events';
import { CONVERSATIONS_REPOSITORY } from './conversations.repository';
import { PrismaConversationsRepository } from './prisma-conversations.repository';
import { CreateDirectConversationUseCase } from './use-cases/create-direct-conversation.use-case';
import { CreateGroupConversationUseCase } from './use-cases/create-group-conversation.use-case';
import { GetConversationUseCase } from './use-cases/get-conversation.use-case';
import { ListConversationsUseCase } from './use-cases/list-conversations.use-case';
import { ListMessagesUseCase } from './use-cases/list-messages.use-case';
import { AddParticipantsUseCase, LeaveConversationUseCase } from './use-cases/manage-participants.use-case';
import { DownloadMediaUseCase, UploadMediaUseCase } from './use-cases/media.use-case';
import { MarkDeliveredUseCase, MarkReadUseCase } from './use-cases/receipts.use-case';
import { SendMessageUseCase } from './use-cases/send-message.use-case';

const USE_CASES = [
  ListConversationsUseCase,
  GetConversationUseCase,
  CreateDirectConversationUseCase,
  CreateGroupConversationUseCase,
  AddParticipantsUseCase,
  LeaveConversationUseCase,
  ListMessagesUseCase,
  SendMessageUseCase,
  MarkDeliveredUseCase,
  MarkReadUseCase,
  UploadMediaUseCase,
  DownloadMediaUseCase,
];

/** El MOTOR de mensajería: lo comparten todas las puertas (rutas HTTP y socket). */
@Module({
  imports: [WorkspacesEngineModule],
  providers: [
    { provide: CONVERSATIONS_REPOSITORY, useClass: PrismaConversationsRepository },
    ConversationEvents,
    ...USE_CASES,
  ],
  exports: [CONVERSATIONS_REPOSITORY, ...USE_CASES],
})
export class MessagingEngineModule {}
