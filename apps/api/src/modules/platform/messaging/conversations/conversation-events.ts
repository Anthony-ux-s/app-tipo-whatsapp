import { Inject, Injectable } from '@nestjs/common';
import type { DeliveryStatus } from '@parla/types';
import { aggregateDeliveryStatus } from '../../../../kernel/delivery-status';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { toConversationSummary } from './conversation.mapper';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository, type ReceiptChange } from './conversations.repository';

/** Avisos en tiempo real del motor de mensajería (una sola implementación para todas las puertas). */
@Injectable()
export class ConversationEvents {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly presence: PresenceRegistry,
  ) {}

  /** Envía a cada participante su propia vista de la conversación (clave, no leídos, título). */
  async conversationChanged(conversationId: string, userIds: string[]): Promise<void> {
    await Promise.all(
      userIds.map(async (userId) => {
        const conversation = await this.conversations.findForUser(conversationId, userId);
        if (!conversation) return;
        this.realtime.toUsers(
          [userId],
          'conversation:upsert',
          toConversationSummary(conversation, userId, (id) => this.presence.statusOf(id)),
        );
      }),
    );
  }

  /** Recalcula el estado de los mensajes afectados y avisa a sus remitentes. */
  async receiptsChanged(changes: ReceiptChange[]): Promise<void> {
    if (changes.length === 0) return;
    const messages = await this.conversations.findMessages([...new Set(changes.map((c) => c.messageId))]);
    const groups = new Map<string, { senderId: string; conversationId: string; status: DeliveryStatus; ids: string[] }>();
    for (const message of messages) {
      const status = aggregateDeliveryStatus(message.receipts);
      const key = `${message.senderId}|${message.conversationId}|${status}`;
      const group = groups.get(key) ?? {
        senderId: message.senderId,
        conversationId: message.conversationId,
        status,
        ids: [],
      };
      group.ids.push(message.id);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      this.realtime.toUsers([group.senderId], 'message:status', {
        conversationId: group.conversationId,
        messageIds: group.ids,
        status: group.status,
      });
    }
  }
}
