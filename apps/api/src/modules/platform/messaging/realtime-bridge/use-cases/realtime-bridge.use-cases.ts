import { Inject, Injectable } from '@nestjs/common';
import type { CallKind, PresenceStatus } from '@parla/types';
import { callLabel, MAX_CALL_PARTICIPANTS } from '../../../../../kernel/call-rules';
import { NotFoundError } from '../../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../../identity/auth/auth.repository';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../../conversations/conversations.repository';
import { MarkDeliveredUseCase } from '../../conversations/use-cases/receipts.use-case';
import { pushContextFor, SendMessageUseCase } from '../../conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../../push/use-cases/notification-dispatcher';

/** Contexto de una conversación que el tiempo real necesita para autorizar "escribiendo" y llamadas. */
export interface ConversationContext {
  conversationId: string;
  kind: 'direct' | 'group';
  title: string;
  participants: { id: string; name: string }[];
  maxCallParticipants: number;
}

/**
 * Alguien abrió su primera conexión o cerró la última (lo avisa el servicio de Elixir).
 * Al entrar, lo pendiente queda entregado; al salir, se guarda la última vez; los contactos se enteran.
 */
@Injectable()
export class PresenceChangedUseCase {
  constructor(
    private readonly presence: PresenceRegistry,
    private readonly markDelivered: MarkDeliveredUseCase,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
  ) {}

  async execute(userId: string, status: PresenceStatus, at: Date): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.deletedAt) return;
    this.presence.set(userId, status);
    if (status === 'online') await this.markDelivered.everythingPending(userId);
    else await this.users.touchLastSeen(userId, at);
    const contacts = await this.users.contactIds(userId);
    this.realtime.toUsers(contacts, 'presence', {
      userId,
      presence: status,
      lastSeenAt: status === 'offline' ? at.toISOString() : null,
    });
  }
}

@Injectable()
export class ConversationContextUseCase {
  constructor(@Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository) {}

  /** 404 si la persona no participa: el tiempo real nunca recibe datos de chats ajenos. */
  async execute(conversationId: string, userId: string): Promise<ConversationContext> {
    const conversation = await this.conversations.findForUser(conversationId, userId);
    if (!conversation) throw new NotFoundError('Conversación no encontrada');
    return {
      conversationId: conversation.id,
      kind: conversation.kind,
      title: conversation.title,
      participants: conversation.participants.map((p) => ({ id: p.user.id, name: p.user.displayName })),
      maxCallParticipants: MAX_CALL_PARTICIPANTS,
    };
  }
}

/** Aviso en el chat al terminar una llamada ("🎥 Videollamada · 3:05"). */
@Injectable()
export class LogCallUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly messages: SendMessageUseCase,
  ) {}

  async execute(conversationId: string, actorId: string, text: string, audience: string[]): Promise<void> {
    const participants = await this.conversations.participantIds(conversationId);
    if (participants.length === 0) throw new NotFoundError('Conversación no encontrada');
    const allowed = audience.filter((id) => participants.includes(id));
    await this.messages.postSystem(conversationId, actorId, text.slice(0, 200), allowed);
  }
}

/** Push de llamada entrante para quien no tiene la app abierta. */
@Injectable()
export class NotifyIncomingCallUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(input: { conversationId: string; callerId: string; callId: string; kind: CallKind; recipients: string[] }): Promise<void> {
    const conversation = await this.conversations.findForUser(input.conversationId, input.callerId);
    if (!conversation) throw new NotFoundError('Conversación no encontrada');
    const participants = conversation.participants.map((p) => p.user.id);
    const recipients = input.recipients.filter((id) => id !== input.callerId && participants.includes(id));
    await this.notifications.notify(recipients, (recipientId) => {
      const ctx = pushContextFor(conversation, input.callerId, recipientId);
      return {
        title: ctx.conversationTitle,
        body: `${ctx.senderName} te está llamando · ${callLabel(input.kind)}`,
        url: `/app/c/${conversation.id}`,
        tag: `call-${input.callId}`,
      };
    });
  }
}
