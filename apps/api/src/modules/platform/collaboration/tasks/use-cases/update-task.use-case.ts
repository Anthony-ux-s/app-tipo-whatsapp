import { Inject, Injectable } from '@nestjs/common';
import type { Task, UpdateTaskRequest } from '@parla/types';
import {
  assertCanEditTask,
  assertValidDueDate,
  completionFor,
  taskAssignedPush,
} from '../../../../../kernel/collaboration-rules';
import { NotFoundError, ValidationError } from '../../../../../kernel/domain-error';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../../infra/realtime/realtime-publisher.port';
import { GetConversationUseCase } from '../../../messaging/conversations/use-cases/get-conversation.use-case';
import { pushContextFor } from '../../../messaging/conversations/use-cases/send-message.use-case';
import { NotificationDispatcher } from '../../../messaging/push/use-cases/notification-dispatcher';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../../workspaces/workspaces.repository';
import { toTask } from '../task.mapper';
import type { TaskChanges } from '../tasks.repository';
import { TASKS_REPOSITORY, type TasksRepository } from '../tasks.repository';

/** Completar, reabrir, reasignar o cambiar la fecha de una tarea. */
@Injectable()
export class UpdateTaskUseCase {
  constructor(
    @Inject(TASKS_REPOSITORY) private readonly tasks: TasksRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly getConversation: GetConversationUseCase,
    private readonly notifications: NotificationDispatcher,
  ) {}

  async execute(userId: string, conversationId: string, taskId: string, input: UpdateTaskRequest): Promise<Task> {
    const conversation = await this.getConversation.require(conversationId, userId);
    const task = await this.tasks.findById(taskId);
    if (!task || task.conversationId !== conversationId) throw new NotFoundError('Tarea no encontrada');
    assertCanEditTask(task, userId, await this.workspaces.roleOf(conversation.workspaceId, userId));

    const participantIds = conversation.participants.map((p) => p.user.id);
    const changes: TaskChanges = {};
    if (input.status !== undefined && input.status !== task.status) {
      Object.assign(changes, { status: input.status }, completionFor(input.status, userId, new Date()));
    }
    if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
      if (input.assigneeId !== null && !participantIds.includes(input.assigneeId)) {
        throw new ValidationError('Solo puedes asignar la tarea a alguien de este chat');
      }
      changes.assigneeId = input.assigneeId;
    }
    if (input.dueDate !== undefined && input.dueDate !== task.dueDate) {
      assertValidDueDate(input.dueDate);
      changes.dueDate = input.dueDate;
    }
    if (Object.keys(changes).length === 0) return toTask(task);

    const updated = toTask(await this.tasks.update(taskId, changes));
    this.realtime.toUsers(participantIds, 'task:upsert', updated);
    const newAssignee = changes.assigneeId;
    if (newAssignee && newAssignee !== userId) {
      void this.notifications.notify([newAssignee], (id) => taskAssignedPush(pushContextFor(conversation, userId, id)));
    }
    return updated;
  }
}
