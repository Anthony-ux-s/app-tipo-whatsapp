import { Inject, Injectable, Optional } from '@nestjs/common';
import type { Message, SendMessageRequest } from '@parla/types';
import { randomUUID } from 'node:crypto';
import { messagePush, sanitizeMentions, threadRootOf, type PushContext } from '../../../../../kernel/collaboration-rules';
import { ValidationError } from '../../../../../kernel/domain-error';
import { PresenceRegistry } from '../../../../../infra/realtime/presence.registry';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { NotificationDispatcher } from '../../push/use-cases/notification-dispatcher';
import { toMessage } from '../conversation.mapper';
import {
  CONVERSATIONS_REPOSITORY,
  type ConversationRecord,
  type ConversationsRepository,
} from '../conversations.repository';
import { GetConversationUseCase } from './get-conversation.use-case';

const MEDIA_PREFIX = { image: 'image/', audio: 'audio/', video: 'video/' } as const;

/** Contexto de la notificación push de una conversación, visto por cada destinatario. */
export function pushContextFor(conversation: ConversationRecord, senderId: string, recipientId: string): PushContext {
  const sender = conversation.participants.find((p) => p.user.id === senderId)?.user.displayName ?? 'Alguien';
  return {
    conversationId: conversation.id,
    conversationKind: conversation.kind,
    conversationTitle:
      conversation.kind === 'direct'
        ? (conversation.participants.find((p) => p.user.id !== recipientId)?.user.displayName ?? sender)
        : conversation.title,
    senderName: sender,
  };
}

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly getConversation: GetConversationUseCase,
    private readonly notifications: NotificationDispatcher,
    /** Con esto, lo que llega a alguien conectado nace «entregado» (opcional: sin esto lo avisa su celular). */
    @Optional() private readonly presence?: PresenceRegistry,
  ) {}

  async execute(userId: string, conversationId: string, input: SendMessageRequest): Promise<Message> {
    const conversation = await this.getConversation.require(conversationId, userId);
    await this.validate(userId, conversationId, input);

    const participantIds = conversation.participants.map((p) => p.user.id);
    const recipients = participantIds.filter((id) => id !== userId);
    const replyToId = input.replyToId ? await this.resolveThreadRoot(conversationId, input.replyToId) : null;
    const mentions = sanitizeMentions(input.mentions, participantIds, userId);

    const message = await this.conversations.createMessage({
      conversationId,
      senderId: userId,
      kind: input.kind,
      ciphertext: input.body?.ciphertext ?? null,
      iv: input.body?.iv ?? null,
      media: input.media,
      systemText: null,
      clientId: input.clientId,
      recipientIds: recipients,
      // Quien está conectado ya lo recibe en este mismo instante: su recibo nace «entregado», sin esperar a su celular ni hacer consultas aparte.
      deliveredTo: recipients.filter((id) => this.presence?.statusOf(id) === 'online'),
      replyToId,
      mentions,
    });

    const contract = toMessage(message, userId);
    this.realtime.toUsers(participantIds, 'message:new', contract);
    if (replyToId) await this.announceReplies(participantIds, conversationId, replyToId);

    const mentioned = new Set(message.mentions);
    void this.notifications.notify(recipients, (recipientId) =>
      messagePush(pushContextFor(conversation, userId, recipientId), message.kind, mentioned.has(recipientId)),
    );
    return contract;
  }

  /** Mensaje de sistema en claro ("Laura creó el grupo"): sin recibos ni cifrado. */
  async postSystem(conversationId: string, actorId: string, text: string, audience: string[]): Promise<void> {
    const message = await this.conversations.createMessage({
      conversationId,
      senderId: actorId,
      kind: 'system',
      ciphertext: null,
      iv: null,
      media: null,
      systemText: text,
      clientId: randomUUID(),
      recipientIds: [],
    });
    this.realtime.toUsers(audience, 'message:new', toMessage(message, actorId));
  }

  private async resolveThreadRoot(conversationId: string, targetId: string): Promise<string> {
    const [target] = await this.conversations.findMessages([targetId]);
    if (!target || target.conversationId !== conversationId) {
      throw new ValidationError('El mensaje al que respondes no está en esta conversación');
    }
    return threadRootOf(target);
  }

  private async announceReplies(participantIds: string[], conversationId: string, rootId: string): Promise<void> {
    const [root] = await this.conversations.findMessages([rootId]);
    if (!root) return;
    this.realtime.toUsers(participantIds, 'message:replies', {
      conversationId,
      messageId: rootId,
      replyCount: root.replyCount,
    });
  }

  private async validate(userId: string, conversationId: string, input: SendMessageRequest): Promise<void> {
    if (input.kind === 'text' || input.kind === 'sticker') {
      if (!input.body) throw new ValidationError('El mensaje está vacío');
      if (input.media) throw new ValidationError(input.kind === 'text' ? 'Un mensaje de texto no lleva archivo' : 'Un sticker no lleva archivo');
      return;
    }
    if (!input.media) throw new ValidationError('Falta el archivo del mensaje');
    if (!input.media.mimeType.startsWith(MEDIA_PREFIX[input.kind])) {
      throw new ValidationError('El tipo de archivo no coincide con el mensaje');
    }
    const file = await this.conversations.findFile(input.media.fileId);
    if (!file || file.conversationId !== conversationId || file.uploaderId !== userId) {
      throw new ValidationError('El archivo no pertenece a esta conversación');
    }
  }
}
