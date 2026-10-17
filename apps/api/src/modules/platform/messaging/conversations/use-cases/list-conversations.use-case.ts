import { Inject, Injectable } from '@nestjs/common';
import type { ConversationSummary } from '@parla/types';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { toConversationSummary } from '../conversation.mapper';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';

@Injectable()
export class ListConversationsUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.conversations.listForUser(userId);
    return rows.map((c) => toConversationSummary(c, userId, (id) => this.presence.statusOf(id)));
  }
}
