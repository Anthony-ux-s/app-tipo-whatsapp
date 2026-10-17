import type { TaskScope, TaskStatus } from '@parla/types';
import type { TaskRecord } from './task.record';

export interface NewTask {
  conversationId: string;
  titleCiphertext: string;
  titleIv: string;
  assigneeId: string | null;
  createdById: string;
  dueDate: string | null;
  sourceMessageId: string | null;
}

export interface TaskChanges {
  status?: TaskStatus;
  assigneeId?: string | null;
  dueDate?: string | null;
  completedAt?: Date | null;
  completedById?: string | null;
}

export interface TasksRepository {
  create(input: NewTask): Promise<TaskRecord>;
  findById(id: string): Promise<TaskRecord | null>;
  update(id: string, changes: TaskChanges): Promise<TaskRecord>;
  delete(id: string): Promise<void>;
  /** Tareas del chat: abiertas primero (por fecha límite), luego las hechas. */
  listForConversation(conversationId: string): Promise<TaskRecord[]>;
  /** Tareas del usuario en un espacio, solo de chats donde participa. */
  listForUser(userId: string, scope: TaskScope): Promise<TaskRecord[]>;
}

export const TASKS_REPOSITORY = Symbol('TASKS_REPOSITORY');
