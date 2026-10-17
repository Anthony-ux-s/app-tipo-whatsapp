import type { TaskStatus } from '@parla/types';

/** Tarea tal como la ven los casos de uso (sin tipos de Prisma). */
export interface TaskRecord {
  id: string;
  conversationId: string;
  titleCiphertext: string;
  titleIv: string;
  assigneeId: string | null;
  createdById: string;
  dueDate: string | null;
  status: TaskStatus;
  sourceMessageId: string | null;
  createdAt: Date;
  completedAt: Date | null;
  completedById: string | null;
}
