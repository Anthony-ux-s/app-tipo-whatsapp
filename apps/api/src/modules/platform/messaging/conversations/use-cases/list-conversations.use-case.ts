import { Inject, Injectable } from '@nestjs/common';
import type { ConversationSummary } from '@parla/types';
import { NotFoundError } from '../../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../../workspaces/workspaces.repository';
import { toConversationSummary } from '../conversation.mapper';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';

@Injectable()
export class ListConversationsUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(userId: string, workspaceId: string): Promise<ConversationSummary[]> {
    if ((await this.workspaces.roleOf(workspaceId, userId)) === null) {
      throw new NotFoundError('Espacio de trabajo no encontrado');
    }
    const rows = await this.conversations.listForUser(userId, workspaceId);
    return rows.map((c) => toConversationSummary(c, userId, (id) => this.presence.statusOf(id)));
  }
}
