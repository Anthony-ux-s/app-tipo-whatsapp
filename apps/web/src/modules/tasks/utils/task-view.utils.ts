import type { ConversationParticipant, Task } from '@parla/types';
import type { DecryptedText } from '@shared/types/chat.types';
import { formatDue } from '@shared/utils/date';
import { taskTextKey } from '@shared/utils/ids';

export interface TaskView {
  task: Task;
  title: string;
  done: boolean;
  assignee: { name: string; label: string; color: string } | null;
  due: ReturnType<typeof formatDue>;
  canToggle: boolean;
}

/** Quién puede marcarla: quien la creó, la persona asignada o un administrador (igual que la API). */
export function canEditTask(task: Task, myId: string, isAdmin: boolean): boolean {
  return task.createdById === myId || task.assigneeId === myId || isAdmin;
}

/** Datos listos para pintar una tarea (título descifrado, persona y fecha). */
export function toTaskView(
  task: Task,
  participants: ConversationParticipant[],
  texts: Record<string, DecryptedText>,
  myId: string,
  isAdmin: boolean,
  now = new Date(),
): TaskView {
  const decrypted = texts[taskTextKey(task.id)];
  const assignee = participants.find((p) => p.user.id === task.assigneeId)?.user;
  return {
    task,
    title: decrypted ? (decrypted.ok ? decrypted.text : '🔒 No se pudo descifrar') : 'Descifrando…',
    done: task.status === 'done',
    assignee: assignee
      ? { name: assignee.displayName, label: assignee.id === myId ? 'Tú' : assignee.displayName, color: assignee.avatarColor }
      : null,
    due: formatDue(task.dueDate, task.status === 'done', now),
    canToggle: canEditTask(task, myId, isAdmin),
  };
}

/** Abiertas primero (las que vencen antes arriba), después las hechas. */
export function sortTaskViews(views: TaskView[]): TaskView[] {
  return [...views].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const da = a.task.dueDate ?? '9999-99-99';
    const db = b.task.dueDate ?? '9999-99-99';
    if (da !== db) return da < db ? -1 : 1;
    return a.task.createdAt < b.task.createdAt ? 1 : -1;
  });
}
