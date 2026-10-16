import { Inject, Injectable } from '@nestjs/common';
import type { ThreadPage } from '@parla/types';
import { NotFoundError } from '../../../../../kernel/domain-error';
import { toMessage } from '../conversation.mapper';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { GetConversationUseCase } from './get-conversation.use-case';

export const THREAD_LIMIT = 200;

/** Un hilo: el mensaje raíz y sus respuestas en orden. */
@Injectable()
export class GetThreadUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly getConversation: GetConversationUseCase,
  ) {}

  async execute(userId: string, conversationId: string, messageId: string): Promise<ThreadPage> {
    await this.getConversation.require(conversationId, userId);
    const [target] = await this.conversations.findMessages([messageId]);
    if (!target || target.conversationId !== conversationId) throw new NotFoundError('Mensaje no encontrado');
    const rootId = target.replyTo?.id ?? target.id;
    const [root] = rootId === target.id ? [target] : await this.conversations.findMessages([rootId]);
    const replies = await this.conversations.listReplies(rootId, THREAD_LIMIT);
    return { root: toMessage(root, userId), replies: replies.map((m) => toMessage(m, userId)) };
  }
}
