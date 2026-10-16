import { Inject, Injectable } from '@nestjs/common';
import type { AddParticipantsRequest, ConversationSummary } from '@parla/types';
import { ForbiddenError, ValidationError } from '../../../../../kernel/domain-error';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../../workspaces/workspaces.repository';
import { ConversationEvents } from '../conversation-events';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { MAX_GROUP_SIZE, assertKeysCover } from '../domain/conversation-rules';
import { GetConversationUseCase } from './get-conversation.use-case';
import { SendMessageUseCase } from './send-message.use-case';

@Injectable()
export class AddParticipantsUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    private readonly getConversation: GetConversationUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(userId: string, conversationId: string, input: AddParticipantsRequest): Promise<ConversationSummary> {
    const conversation = await this.getConversation.require(conversationId, userId);
    if (conversation.kind !== 'group') throw new ValidationError('Solo se pueden agregar personas a un grupo');

    const role = await this.workspaces.roleOf(conversation.workspaceId, userId);
    if (role !== 'admin' && conversation.createdById !== userId) {
      throw new ForbiddenError('Solo quien creó el grupo o un administrador puede agregar personas');
    }

    const current = new Set(conversation.participants.map((p) => p.user.id));
    const newIds = [...new Set(input.userIds)].filter((id) => !current.has(id));
    if (newIds.length === 0) throw new ValidationError('Esas personas ya están en el grupo');
    if (current.size + newIds.length > MAX_GROUP_SIZE) throw new ValidationError('El grupo supera el máximo de miembros');

    const members = new Map(
      (await this.workspaces.listMembers(conversation.workspaceId)).map((m) => [m.user.id, m.user]),
    );
    if (newIds.some((id) => !members.has(id))) throw new ValidationError('Solo puedes agregar miembros del espacio');
    assertKeysCover(input.keys, newIds, userId);

    await this.conversations.addParticipants(conversationId, input.keys);
    const actor = members.get(userId)!;
    const names = newIds.map((id) => members.get(id)!.displayName).join(', ');
    const everyone = [...current, ...newIds];
    await this.sendMessage.postSystem(conversationId, userId, `${actor.displayName} agregó a ${names}`, everyone);
    await this.events.conversationChanged(conversationId, everyone);
    return this.getConversation.execute(userId, conversationId);
  }
}

@Injectable()
export class LeaveConversationUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly getConversation: GetConversationUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly events: ConversationEvents,
  ) {}

  async execute(userId: string, conversationId: string): Promise<void> {
    const conversation = await this.getConversation.require(conversationId, userId);
    if (conversation.kind !== 'group') throw new ValidationError('Solo puedes salir de un grupo');
    const me = conversation.participants.find((p) => p.user.id === userId)!;
    await this.conversations.removeParticipant(conversationId, userId);
    const remaining = conversation.participants.map((p) => p.user.id).filter((id) => id !== userId);
    await this.sendMessage.postSystem(conversationId, userId, `${me.user.displayName} salió del grupo`, remaining);
    await this.events.conversationChanged(conversationId, remaining);
  }
}
