import type { ConversationSummary, DeliveryStatus, Message, PresenceStatus } from '@parla/types';
import { aggregateDeliveryStatus } from '../../../../kernel/delivery-status';
import { toTask } from '../../collaboration/tasks/task.mapper';
import { avatarUrlOf, toPublicUser } from '../../identity/user.mapper';
import type { ConversationRecord, MessageRecord } from './conversations.repository';

/** Estado de un mensaje visto por `viewerId`: el remitente ve el agregado; el destinatario, su recibo. */
function statusFor(message: MessageRecord, viewerId: string): DeliveryStatus {
  if (message.senderId === viewerId) return aggregateDeliveryStatus(message.receipts);
  const mine = message.receipts.find((r) => r.userId === viewerId);
  if (!mine || mine.readAt) return 'read';
  return mine.deliveredAt ? 'delivered' : 'sent';
}

export function toMessage(message: MessageRecord, viewerId: string): Message {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    kind: message.kind,
    body: message.ciphertext && message.iv ? { ciphertext: message.ciphertext, iv: message.iv } : null,
    media: message.media,
    systemText: message.systemText,
    clientId: message.clientId,
    status: statusFor(message, viewerId),
    createdAt: message.createdAt.toISOString(),
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          senderId: message.replyTo.senderId,
          kind: message.replyTo.kind,
          body:
            message.replyTo.ciphertext && message.replyTo.iv
              ? { ciphertext: message.replyTo.ciphertext, iv: message.replyTo.iv }
              : null,
          clientId: message.replyTo.clientId,
        }
      : null,
    replyCount: message.replyCount,
    mentions: message.mentions,
    task: message.task ? toTask(message.task) : null,
  };
}

export function toConversationSummary(
  conversation: ConversationRecord,
  viewerId: string,
  presenceOf: (userId: string) => PresenceStatus,
): ConversationSummary {
  const other =
    conversation.kind === 'direct'
      ? conversation.participants.find((p) => p.user.id !== viewerId)?.user
      : undefined;
  const mine = conversation.participants.find((p) => p.user.id === viewerId);

  return {
    id: conversation.id,
    kind: conversation.kind,
    title: other?.displayName ?? conversation.title,
    description: other?.about ?? conversation.description,
    avatarColor: other?.avatarColor ?? conversation.avatarColor,
    avatarUrl: other ? avatarUrlOf(other) : null,
    participants: conversation.participants.map((p) => ({
      user: toPublicUser(p.user, presenceOf(p.user.id)),
      role: p.role,
      // Clave vacía = restableció su cuenta y espera que alguien del chat se la vuelva a compartir.
      keyPending: p.wrappedKey === '',
    })),
    myKey: mine && mine.wrappedKey !== ''
      ? {
          userId: viewerId,
          wrappedKey: mine.wrappedKey,
          iv: mine.keyIv,
          wrappedById: mine.wrappedById,
          wrapperPublicKey: mine.wrapperPublicKey,
        }
      : null,
    lastMessage: conversation.lastMessage ? toMessage(conversation.lastMessage, viewerId) : null,
    unreadCount: conversation.unreadCount,
    mentionCount: conversation.mentionCount,
    openTaskCount: conversation.openTaskCount,
    createdById: conversation.createdById,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString(),
  };
}
