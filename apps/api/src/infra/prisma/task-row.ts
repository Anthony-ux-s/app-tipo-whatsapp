import type { TaskStatus } from '@parla/types';
import type { Task } from '@prisma/client';
import type { TaskRecord } from '../../modules/platform/collaboration/tasks/task.record';

/** Fila Prisma → TaskRecord. Solo la usan los adaptadores Prisma. */
export function toTaskRecord(row: Task): TaskRecord {
  return { ...row, status: row.status as TaskStatus };
}
