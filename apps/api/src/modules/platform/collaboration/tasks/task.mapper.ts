import type { Task } from '@parla/types';
import type { TaskRecord } from './task.record';

/** Único lugar donde una tarea se convierte en contrato. */
export function toTask(task: TaskRecord): Task {
  return {
    id: task.id,
    conversationId: task.conversationId,
    title: { ciphertext: task.titleCiphertext, iv: task.titleIv },
    assigneeId: task.assigneeId,
    createdById: task.createdById,
    dueDate: task.dueDate,
    status: task.status,
    sourceMessageId: task.sourceMessageId,
    createdAt: task.createdAt.toISOString(),
    completedAt: task.completedAt?.toISOString() ?? null,
    completedById: task.completedById,
  };
}
