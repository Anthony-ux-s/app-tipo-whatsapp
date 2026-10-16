import { Inject, Injectable } from '@nestjs/common';
import type { Message, SendMessageRequest } from '@parla/types';
import { randomUUID } from 'node:crypto';
import { ValidationError } from '../../../../../kernel/domain-error';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { toMessage } from '../conversation.mapper';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../conversations.repository';
import { GetConversationUseCase } from './get-conversation.use-case';

const MEDIA_PREFIX = { image: 'image/', audio: 'audio/', video: 'video/' } as const;

@Injectable()
export class SendMessageUseCase {
  constructor(
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly getConversation: GetConversationUseCase,
  ) {}

  async execute(userId: string, conversationId: string, input: SendMessageRequest): Promise<Message> {
    const conversation = await this.getConversation.require(conversationId, userId);
    await this.validate(userId, conversationId, input);

    const participantIds = conversation.participants.map((p) => p.user.id);
    const message = await this.conversations.createMessage({
      conversationId,
      senderId: userId,
      kind: input.kind,
      ciphertext: input.body?.ciphertext ?? null,
      iv: input.body?.iv ?? null,
      media: input.media,
      systemText: null,
      clientId: input.clientId,
      recipientIds: participantIds.filter((id) => id !== userId),
    });

    const contract = toMessage(message, userId);
    this.realtime.toUsers(participantIds, 'message:new', contract);
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

  private async validate(userId: string, conversationId: string, input: SendMessageRequest): Promise<void> {
    if (input.kind === 'text') {
      if (!input.body) throw new ValidationError('El mensaje está vacío');
      if (input.media) throw new ValidationError('Un mensaje de texto no lleva archivo');
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
