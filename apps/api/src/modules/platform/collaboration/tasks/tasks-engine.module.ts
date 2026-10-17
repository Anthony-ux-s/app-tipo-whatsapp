import { Module } from '@nestjs/common';
import { MessagingEngineModule } from '../../messaging/conversations/messaging-engine.module';
import { PushEngineModule } from '../../messaging/push/push-engine.module';
import { PrismaTasksRepository } from './prisma-tasks.repository';
import { TASKS_REPOSITORY } from './tasks.repository';
import { CreateTaskUseCase } from './use-cases/create-task.use-case';
import { ListConversationTasksUseCase, ListMyTasksUseCase } from './use-cases/list-tasks.use-case';
import { UpdateTaskUseCase } from './use-cases/update-task.use-case';

const USE_CASES = [CreateTaskUseCase, UpdateTaskUseCase, ListConversationTasksUseCase, ListMyTasksUseCase];

/** El MOTOR de tareas del chat: lo usan como iguales todos los participantes. */
@Module({
  imports: [MessagingEngineModule, PushEngineModule],
  providers: [{ provide: TASKS_REPOSITORY, useClass: PrismaTasksRepository }, ...USE_CASES],
  exports: USE_CASES,
})
export class TasksEngineModule {}
