import { Inject, Injectable } from '@nestjs/common';
import type { ConversationSummary, CreateDirectConversationRequest } from '@parla/types';
import { NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { AUTH_REPOSITORY, type AuthRepository } from '../../../identity/auth/auth.repository';
import { ConversationEvents } from '../conversation-events';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { assertKeysCover, directKeyFor } from '../domain/conversation-rules';
import { GetConversationUseCase } from './get-conversation.use-case';

@Injectable()
export class CreateDirectConversationUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly getConversation: GetConversationUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(userId: string, input: CreateDirectConversationRequest): Promise<ConversationSummary> {
    if (input.userId === userId) throw new ValidationError('Elige a otra persona para conversar');
    const [other] = await this.users.findActiveByIds([input.userId]);
    if (!other) throw new NotFoundError('Esa persona no está en Parla');

    // Si ya existe el chat entre los dos, se reutiliza (y las claves nuevas se descartan).
    const directKey = directKeyFor(userId, input.userId);
    const existing = await this.conversations.findIdByDirectKey(directKey);
    if (existing) return this.getConversation.execute(userId, existing);

    assertKeysCover(input.keys, [userId, input.userId], userId);
    const id = await this.conversations.create({
      kind: 'direct',
      title: '',
      description: '',
      avatarColor: 'teal',
      directKey,
      createdById: userId,
      keys: input.keys,
    });
    await this.events.conversationChanged(id, [input.userId]);
    return this.getConversation.execute(userId, id);
  }
}
