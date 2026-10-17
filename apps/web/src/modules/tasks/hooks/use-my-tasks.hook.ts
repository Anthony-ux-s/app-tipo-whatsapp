import type { Task, TaskScope } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { TASK_SCOPES } from '../const/tasks.const';
import { isGroupAdmin, sortTaskViews, toTaskView } from '../utils/task-view.utils';

/** "Mis tareas": asignadas a mí, creadas por mí y hechas, siempre al día por el socket. */
export function useMyTasks() {
  const navigate = useNavigate();
  const myId = useSessionStore((s) => s.user!.id);
  const conversations = useChatStore((s) => s.conversations);
  const tasks = useChatStore((s) => s.tasks);
  const texts = useChatStore((s) => s.texts);
  const { ingestTasks, updateTask } = useChatStore.getState();
  const [scope, setScope] = useState<TaskScope>('assigned');
  const [ids, setIds] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    http
      .get<Task[]>(`/tasks?scope=${scope}`)
      .then(async (list) => {
        await ingestTasks(list);
        if (!alive) return;
        setIds(list.map((t) => t.id));
        setStatus('ready');
      })
      .catch(() => alive && setStatus('error'));
    return () => {
      alive = false;
    };
  }, [scope, attempt, ingestTasks]);

  // Las tareas cambian en vivo: se muestran según su estado actual, no el de cuando se cargaron.
  const items = useMemo(() => {
    const matches = (t: Task) =>
      scope === 'done'
        ? t.status === 'done' && (t.assigneeId === myId || t.createdById === myId)
        : t.status === 'open' && (scope === 'assigned' ? t.assigneeId === myId : t.createdById === myId);
    const known = Object.values(tasks).filter((t) => ids.includes(t.id) || matches(t));
    return sortTaskViews(
      known
        .filter(matches)
        .filter((t) => conversations[t.conversationId])
        .map((t) => toTaskView(t, conversations[t.conversationId].participants, texts, myId, isGroupAdmin(conversations[t.conversationId], myId))),
    ).map((view) => ({ view, conversationTitle: conversations[view.task.conversationId].title }));
  }, [tasks, ids, conversations, texts, myId, scope]);

  const current = TASK_SCOPES.find((s) => s.id === scope)!;

  return {
    scopes: TASK_SCOPES,
    scope,
    emptyText: current.empty,
    status,
    items,
    selectScope: (value: TaskScope) => setScope(value),
    retry: () => setAttempt((n) => n + 1),
    toggle: (task: Task) =>
      updateTask(task, { status: task.status === 'done' ? 'open' : 'done' }).catch((err) => toast(errorMessage(err), 'error')),
    openInChat: (task: Task) => navigate(`/app/c/${task.conversationId}?panel=tareas`),
  };
}
