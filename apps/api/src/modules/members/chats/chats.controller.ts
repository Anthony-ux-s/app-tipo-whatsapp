import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  StreamableFile,
  UploadedFile as UploadedBlob,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { ConversationSummary, Message, MessagePage, ThreadPage, UploadedFile } from '@parla/types';
import { GetThreadUseCase } from '../../platform/messaging/conversations/use-cases/get-thread.use-case';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { CreateDirectConversationUseCase } from '../../platform/messaging/conversations/use-cases/create-direct-conversation.use-case';
import { CreateGroupConversationUseCase } from '../../platform/messaging/conversations/use-cases/create-group-conversation.use-case';
import { GetConversationUseCase } from '../../platform/messaging/conversations/use-cases/get-conversation.use-case';
import { ListConversationsUseCase } from '../../platform/messaging/conversations/use-cases/list-conversations.use-case';
import { ListMessagesUseCase } from '../../platform/messaging/conversations/use-cases/list-messages.use-case';
import {
  AddParticipantsUseCase,
  LeaveConversationUseCase,
} from '../../platform/messaging/conversations/use-cases/manage-participants.use-case';
import {
  DownloadMediaUseCase,
  MAX_UPLOAD_BYTES,
  UploadMediaUseCase,
} from '../../platform/messaging/conversations/use-cases/media.use-case';
import { MarkDeliveredUseCase, MarkReadUseCase } from '../../platform/messaging/conversations/use-cases/receipts.use-case';
import { ReshareKeysUseCase } from '../../platform/messaging/conversations/use-cases/reshare-keys.use-case';
import { SendMessageUseCase } from '../../platform/messaging/conversations/use-cases/send-message.use-case';
import {
  AddParticipantsDto,
  CreateDirectDto,
  CreateGroupDto,
  MarkDeliveredDto,
  ReshareKeysDto,
  SendMessageDto,
} from './dto/chats.dto';

/** Puerta de los miembros al motor de mensajería. El dueño de cada acción sale del token. */
@Controller('chats')
export class ChatsController {
  constructor(
    private readonly listConversations: ListConversationsUseCase,
    private readonly getConversation: GetConversationUseCase,
    private readonly createDirect: CreateDirectConversationUseCase,
    private readonly createGroup: CreateGroupConversationUseCase,
    private readonly addParticipants: AddParticipantsUseCase,
    private readonly leaveConversation: LeaveConversationUseCase,
    private readonly reshareKeys: ReshareKeysUseCase,
    private readonly listMessages: ListMessagesUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly markDelivered: MarkDeliveredUseCase,
    private readonly markRead: MarkReadUseCase,
    private readonly uploadMedia: UploadMediaUseCase,
    private readonly downloadMedia: DownloadMediaUseCase,
    private readonly getThread: GetThreadUseCase,
  ) {}

  @Get()
  list(@CurrentUser() user: AuthUser): Promise<ConversationSummary[]> {
    return this.listConversations.execute(user.userId);
  }

  @Post('direct')
  direct(@CurrentUser() user: AuthUser, @Body() body: CreateDirectDto): Promise<ConversationSummary> {
    return this.createDirect.execute(user.userId, body);
  }

  @Post('groups')
  group(@CurrentUser() user: AuthUser, @Body() body: CreateGroupDto): Promise<ConversationSummary> {
    return this.createGroup.execute(user.userId, body);
  }

  @Get('media/:fileId')
  async media(@CurrentUser() user: AuthUser, @Param('fileId') fileId: string): Promise<StreamableFile> {
    const stream = await this.downloadMedia.execute(user.userId, fileId);
    return new StreamableFile(stream, { type: 'application/octet-stream' });
  }

  @Get(':id')
  one(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<ConversationSummary> {
    return this.getConversation.execute(user.userId, id);
  }

  @Post(':id/participants')
  add(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: AddParticipantsDto): Promise<ConversationSummary> {
    return this.addParticipants.execute(user.userId, id, body);
  }

  @HttpCode(204)
  @Post(':id/leave')
  leave(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.leaveConversation.execute(user.userId, id);
  }

  @Get(':id/messages')
  messages(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query('before') before?: string,
  ): Promise<MessagePage> {
    return this.listMessages.execute(user.userId, id, before || null);
  }

  @Get(':id/messages/:messageId/thread')
  thread(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('messageId') messageId: string): Promise<ThreadPage> {
    return this.getThread.execute(user.userId, id, messageId);
  }

  @Post(':id/messages')
  send(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: SendMessageDto): Promise<Message> {
    return this.sendMessage.execute(user.userId, id, body);
  }

  @HttpCode(200)
  @Post(':id/delivered')
  delivered(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: MarkDeliveredDto) {
    return this.markDelivered.execute(user.userId, id, body.messageIds);
  }

  @HttpCode(200)
  @Post(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.markRead.execute(user.userId, id);
  }

  /** Volver a compartir la clave del chat con quien restableció su cuenta. */
  @Post(':id/keys')
  reshare(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: ReshareKeysDto): Promise<ConversationSummary> {
    return this.reshareKeys.execute(user.userId, id, body);
  }

  @Post(':id/media')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedBlob() file: Express.Multer.File | undefined,
  ): Promise<UploadedFile> {
    return this.uploadMedia.execute(user.userId, id, file?.buffer);
  }
}
