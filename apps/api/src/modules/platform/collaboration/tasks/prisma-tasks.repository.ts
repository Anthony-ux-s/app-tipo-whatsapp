import { Injectable } from '@nestjs/common';
import type { TaskScope } from '@parla/types';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { toTaskRecord } from '../../../../infra/prisma/task-row';
import type { TaskRecord } from './task.record';
import type { NewTask, TaskChanges, TasksRepository } from './tasks.repository';

const MAX_TASKS = 300;

/** Abiertas antes que hechas, y entre las abiertas las que vencen antes (sin fecha al final). */
function sortTasks(tasks: TaskRecord[]): TaskRecord[] {
  return [...tasks].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1;
    if (a.status === 'done') return (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0);
    if (a.dueDate !== b.dueDate) return a.dueDate === null ? 1 : b.dueDate === null ? -1 : a.dueDate.localeCompare(b.dueDate);
    return b.createdAt.getTime() - a.createdAt.getTime();
  });
}

@Injectable()
export class PrismaTasksRepository implements TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewTask): Promise<TaskRecord> {
    return toTaskRecord(await this.prisma.task.create({ data: input }));
  }

  async findById(id: string): Promise<TaskRecord | null> {
    const row = await this.prisma.task.findUnique({ where: { id } });
    return row ? toTaskRecord(row) : null;
  }

  async update(id: string, changes: TaskChanges): Promise<TaskRecord> {
    return toTaskRecord(await this.prisma.task.update({ where: { id }, data: changes }));
  }

  async delete(id: string): Promise<void> {
    await this.prisma.task.deleteMany({ where: { id } });
  }

  async listForConversation(conversationId: string): Promise<TaskRecord[]> {
    const rows = await this.prisma.task.findMany({ where: { conversationId }, take: MAX_TASKS, orderBy: { createdAt: 'desc' } });
    return sortTasks(rows.map(toTaskRecord));
  }

  async listForUser(workspaceId: string, userId: string, scope: TaskScope): Promise<TaskRecord[]> {
    const visible: Prisma.TaskWhereInput = { workspaceId, conversation: { participants: { some: { userId } } } };
    const where: Prisma.TaskWhereInput =
      scope === 'assigned'
        ? { ...visible, assigneeId: userId, status: 'open' }
        : scope === 'created'
          ? { ...visible, createdById: userId, status: 'open' }
          : { ...visible, status: 'done', OR: [{ assigneeId: userId }, { createdById: userId }] };
    const rows = await this.prisma.task.findMany({ where, take: MAX_TASKS, orderBy: { createdAt: 'desc' } });
    return sortTasks(rows.map(toTaskRecord));
  }
}
