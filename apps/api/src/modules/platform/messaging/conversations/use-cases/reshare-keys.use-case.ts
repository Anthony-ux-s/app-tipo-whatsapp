import { Inject, Injectable } from '@nestjs/common';
import type { ConversationSummary, ReshareKeysRequest } from '@parla/types';
import { ForbiddenError, ValidationError } from '../../../../../kernel/domain-error';
import { ConversationEvents } from '../conversation-events';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { GetConversationUseCase } from './get-conversation.use-case';

/**
 * Alguien restableció su cuenta (claves nuevas). Otra persona del chat, que sí tiene la clave de la
 * conversación, decide volver a compartirla: la envuelve en su navegador con la clave pública nueva.
 * El servidor nunca conoce la clave del chat.
 */
@Injectable()
export class ReshareKeysUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly getConversation: GetConversationUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(userId: string, conversationId: string, input: ReshareKeysRequest): Promise<ConversationSummary> {
    const conversation = await this.getConversation.require(conversationId, userId);
    const me = conversation.participants.find((p) => p.user.id === userId)!;
    if (me.wrappedKey === '') throw new ForbiddenError('Necesitas la clave del chat para compartirla');
    const pending = new Set(conversation.participants.filter((p) => p.wrappedKey === '').map((p) => p.user.id));
    if (input.keys.length === 0 || input.keys.some((k) => !pending.has(k.userId) || k.wrappedById !== userId)) {
      throw new ValidationError('Solo se comparte la clave con quien la tiene pendiente, envuelta por ti');
    }
    await this.conversations.reshareKeys(conversationId, input.keys);
    await this.events.conversationChanged(conversationId, conversation.participants.map((p) => p.user.id));
    return this.getConversation.execute(userId, conversationId);
  }
}
