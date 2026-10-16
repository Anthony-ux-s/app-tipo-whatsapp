import { Module } from '@nestjs/common';
import { TasksEngineModule } from '../../platform/collaboration/tasks/tasks-engine.module';
import { TasksController } from './tasks.controller';

@Module({
  imports: [TasksEngineModule],
  controllers: [TasksController],
})
export class TasksModule {}
