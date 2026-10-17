import { Inject, Injectable } from '@nestjs/common';
import type { CreateTaskRequest, Task } from '@parla/types';
import { assertValidDueDate, taskAssignedPush } from '../../../../../kernel/collaboration-rules';
import { ValidationError } from '../../../../../kernel/domain-error';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { CONVERSATIONS_REPOSITORY, type ConversationsRepository } from '../../../messaging/conversations/conversations.repository';
import { GetConversationUseCase } from '../../../messaging/conversations/use-cases/get-conversation.use-case';
import { pushContextFor, SendMessageUseCase } from '../../../messaging/conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../../../messaging/push/use-cases/notification-dispatcher';
import { toTask } from '../task.mapper';
import { TASKS_REPOSITORY, type TasksRepository } from '../tasks.repository';

/** Crea una tarea en el chat: se publica como tarjeta en la conversación y se avisa a la persona asignada. */
@Injectable()
export class CreateTaskUseCase {
  constructor(
    @Inject(TASKS_REPOSITORY) private readonly tasks: TasksRepository,
    @Inject(CONVERSATIONS_REPOSITORY) private readonly conversations: ConversationsRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly getConversation: GetConversationUseCase,
    private readonly sendMessage: SendMessageUseCase,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(userId: string, conversationId: string, input: CreateTaskRequest): Promise<Task> {
    const conversation = await this.getConversation.require(conversationId, userId);
    const participantIds = conversation.participants.map((p) => p.user.id);
    if (!input.title.ciphertext || !input.title.iv) throw new ValidationError('Escribe qué hay que hacer');
    if (input.assigneeId && !participantIds.includes(input.assigneeId)) {
      throw new ValidationError('Solo puedes asignar la tarea a alguien de este chat');
    }
    assertValidDueDate(input.dueDate);
    if (input.sourceMessageId) {
      const [source] = await this.conversations.findMessages([input.sourceMessageId]);
      if (!source || source.conversationId !== conversationId) {
        throw new ValidationError('El mensaje de origen no está en esta conversación');
      }
    }

    const task = await this.tasks.create({
      conversationId,
      titleCiphertext: input.title.ciphertext,
      titleIv: input.title.iv,
      assigneeId: input.assigneeId,
      createdById: userId,
      dueDate: input.dueDate,
      sourceMessageId: input.sourceMessageId,
    });

    try {
      const card = await this.conversations.createMessage({
        conversationId,
        senderId: userId,
        kind: 'task',
        ciphertext: null,
        iv: null,
        media: null,
        systemText: null,
        clientId: input.clientId,
        recipientIds: participantIds.filter((id) => id !== userId),
        taskId: task.id,
        mentions: input.assigneeId ? [input.assigneeId] : [],
      });
      await this.sendMessage.publish(conversation, card, userId);
    } catch (error) {
      await this.tasks.delete(task.id);
      throw error;
    }

    const contract = toTask(task);
    this.realtime.toUsers(participantIds, 'task:upsert', contract);
    if (input.assigneeId && input.assigneeId !== userId) {
      void this.notifications.notify([input.assigneeId], (id) => taskAssignedPush(pushContextFor(conversation, userId, id)));
    }
    return contract;
  }
}
