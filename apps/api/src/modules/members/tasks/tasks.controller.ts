import { Controller, Get, Query } from '@nestjs/common';
import type { Task, TaskScope } from '@parla/types';
import { CurrentUser, type AuthUser } from '../../../http/current-user.decorator';
import { ListMyTasksUseCase } from '../../platform/collaboration/tasks/use-cases/list-tasks.use-case';

const SCOPES: TaskScope[] = ['assigned', 'created', 'done'];

/** "Mis tareas" de cada miembro dentro de un espacio. */
@Controller('tasks')
export class TasksController {
  constructor(private readonly listMine: ListMyTasksUseCase) {}

  @Get()
  mine(
    @CurrentUser() user: AuthUser,
    @Query('scope') scope: string,
  ): Promise<Task[]> {
    const safeScope = SCOPES.includes(scope as TaskScope) ? (scope as TaskScope) : 'assigned';
    return this.listMine.execute(user.userId, safeScope);
  }
}
