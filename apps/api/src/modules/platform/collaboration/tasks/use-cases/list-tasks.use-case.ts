import { Inject, Injectable } from '@nestjs/common';
import type { Task, TaskScope } from '@parla/types';
import { NotFoundError } from '../../../../../kernel/domain-error';
import { GetConversationUseCase } from '../../../messaging/conversations/use-cases/get-conversation.use-case';
import { WORKSPACES_REPOSITORY, type WorkspacesRepository } from '../../../workspaces/workspaces.repository';
import { toTask } from '../task.mapper';
import { TASKS_REPOSITORY, type TasksRepository } from '../tasks.repository';

/** Tareas de un chat. */
@Injectable()
export class ListConversationTasksUseCase {
  constructor(
    @Inject(TASKS_REPOSITORY) private readonly tasks: TasksRepository,
    private readonly getConversation: GetConversationUseCase,
  ) {}

  async execute(userId: string, conversationId: string): Promise<Task[]> {
    await this.getConversation.require(conversationId, userId);
    return (await this.tasks.listForConversation(conversationId)).map(toTask);
  }
}

/** "Mis tareas": asignadas a mí, creadas por mí o ya hechas, en un espacio. */
@Injectable()
export class ListMyTasksUseCase {
  constructor(
    @Inject(TASKS_REPOSITORY) private readonly tasks: TasksRepository,
    @Inject(WORKSPACES_REPOSITORY) private readonly workspaces: WorkspacesRepository,
  ) {}

  async execute(userId: string, workspaceId: string, scope: TaskScope): Promise<Task[]> {
    if ((await this.workspaces.roleOf(workspaceId, userId)) === null) {
      throw new NotFoundError('Espacio de trabajo no encontrado');
    }
    return (await this.tasks.listForUser(workspaceId, userId, scope)).map(toTask);
  }
}
