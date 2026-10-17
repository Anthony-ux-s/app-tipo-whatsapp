import { Inject, Injectable } from '@nestjs/common';
import type { ConversationSummary, CreateGroupConversationRequest } from '@parla/types';
import { ValidationError } from '../../../../../kernel/domain-error';
import { pickAvatarColor } from '../../../../../kernel/palette';
import { AUTH_REPOSITORY, type AuthRepository } from '../../../identity/auth/auth.repository';
import { ConversationEvents } from '../conversation-events';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { MAX_GROUP_SIZE, assertKeysCover, validateGroupTitle } from '../domain/conversation-rules';
import { GetConversationUseCase } from './get-conversation.use-case';
import { SendMessageUseCase } from './send-message.use-case';

@Injectable()
export class CreateGroupConversationUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly getConversation: GetConversationUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(userId: string, input: CreateGroupConversationRequest): Promise<ConversationSummary> {
    const title = validateGroupTitle(input.title);
    const participantIds = [...new Set([userId, ...input.memberIds])];
    if (participantIds.length < 2) throw new ValidationError('Agrega al menos a una persona al grupo');
    if (participantIds.length > MAX_GROUP_SIZE) throw new ValidationError('El grupo supera el máximo de miembros');

    const members = new Map((await this.users.findActiveByIds(participantIds)).map((u) => [u.id, u]));
    if (participantIds.some((id) => !members.has(id))) {
      throw new ValidationError('Alguna de esas personas ya no está en Parla');
    }
    assertKeysCover(input.keys, participantIds, userId);

    const id = await this.conversations.create({
      kind: 'group',
      title,
      description: input.description?.trim() ?? '',
      avatarColor: pickAvatarColor(title),
      directKey: null,
      createdById: userId,
      keys: input.keys,
    });
    const creator = members.get(userId)!;
    await this.sendMessage.postSystem(id, userId, `${creator.displayName} creó el grupo «${title}»`, []);
    await this.events.conversationChanged(id, participantIds.filter((p) => p !== userId));
    return this.getConversation.execute(userId, id);
  }
}
