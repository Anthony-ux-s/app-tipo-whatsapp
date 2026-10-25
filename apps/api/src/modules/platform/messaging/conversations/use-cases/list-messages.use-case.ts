import { Inject, Injectable } from '@nestjs/common';
import type { MessagePage } from '@parla/types';
import { toMessage } from '../conversation.mapper';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { GetConversationUseCase } from './get-conversation.use-case';

export const MESSAGE_PAGE_SIZE = 40;

@Injectable()
export class ListMessagesUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly getConversation: GetConversationUseCase,
  ) {}

  /** Página de mensajes, del más nuevo al más viejo, por cursor (nunca OFFSET). */
  async execute(userId: string, conversationId: string, before: string | null): Promise<MessagePage> {
    // El permiso y la página no dependen entre sí: se piden a la vez (un viaje menos). Si no participa, la página se descarta sin devolverse.
    const [, rows] = await Promise.all([
      this.getConversation.require(conversationId, userId, { counters: false }),
      this.conversations.listMessages(conversationId, before, MESSAGE_PAGE_SIZE),
    ]);
    return {
      messages: rows.map((m) => toMessage(m, userId)).reverse(),
      nextCursor: rows.length === MESSAGE_PAGE_SIZE ? rows[rows.length - 1].id : null,
    };
  }
}
