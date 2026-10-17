import { Inject, Injectable } from '@nestjs/common';
import type { Task, TaskScope } from '@parla/types';
import { GetConversationUseCase } from '../../../messaging/conversations/use-cases/get-conversation.use-case';
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

/** "Mis tareas": asignadas a mí, creadas por mí o ya hechas, en todos mis chats. */
@Injectable()
export class ListMyTasksUseCase {
  constructor(@Inject(TASKS_REPOSITORY) private readonly tasks: TasksRepository) {}

  async execute(userId: string, scope: TaskScope): Promise<Task[]> {
    return (await this.tasks.listForUser(userId, scope)).map(toTask);
  }
}
