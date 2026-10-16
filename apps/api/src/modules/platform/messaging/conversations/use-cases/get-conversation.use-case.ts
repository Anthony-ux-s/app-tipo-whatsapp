import { Inject, Injectable } from '@nestjs/common';
import type { ConversationSummary } from '@parla/types';
import { NotFoundError } from '../../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { toConversationSummary } from '../conversation.mapper';
import { CONVERSATIONS_REPOSITORY, type ConversationRecord, type ConversationsRepository } from '../conversations.repository';

@Injectable()
export class GetConversationUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  /** La conversación cruda, exigiendo que el usuario participe (404 si no). */
  async require(conversationId: string, userId: string): Promise<ConversationRecord> {
    const conversation = await this.conversations.findForUser(conversationId, userId);
    if (!conversation) throw new NotFoundError('Conversación no encontrada');
    return conversation;
  }

  async execute(userId: string, conversationId: string): Promise<ConversationSummary> {
    const conversation = await this.require(conversationId, userId);
    return toConversationSummary(conversation, userId, (id) => this.presence.statusOf(id));
  }
}
