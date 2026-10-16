import { Inject, Injectable } from '@nestjs/common';
import { ConversationEvents } from '../conversation-events';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { GetConversationUseCase } from './get-conversation.use-case';

/** Marca mensajes como entregados al dispositivo del destinatario. */
@Injectable()
export class MarkDeliveredUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly getConversation: GetConversationUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(userId: string, conversationId: string, messageIds: string[]): Promise<{ updated: number }> {
    await this.getConversation.require(conversationId, userId);
    const changes = await this.conversations.markDelivered(userId, { conversationId, messageIds });
    await this.events.receiptsChanged(changes);
    return { updated: changes.length };
  }

  /** Al conectarse, todo lo pendiente llegó al dispositivo. */
  async everythingPending(userId: string): Promise<void> {
    const changes = await this.conversations.markDelivered(userId, 'all');
    await this.events.receiptsChanged(changes);
  }
}

/** Marca como leídos todos los mensajes de la conversación abierta. */
@Injectable()
export class MarkReadUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly getConversation: GetConversationUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(userId: string, conversationId: string): Promise<{ updated: number }> {
    await this.getConversation.require(conversationId, userId);
    const changes = await this.conversations.markRead(userId, conversationId);
    await this.events.receiptsChanged(changes);
    return { updated: changes.length };
  }
}
