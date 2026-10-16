import type { Task, TaskScope } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage, http } from '@shared/utils/http';
import { TASK_SCOPES } from '../const/tasks.const';
import { sortTaskViews, toTaskView } from '../utils/task-view.utils';

/** "Mis tareas" del espacio: asignadas a mí, creadas por mí y hechas, siempre al día por el socket. */
export function useMyTasks() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const myId = useSessionStore((s) => s.user!.id);
  const isAdmin = useWorkspaceStore((s) => s.details[workspaceId]?.role === 'admin');
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
      .get<Task[]>(`/tasks?workspaceId=${encodeURIComponent(workspaceId)}&scope=${scope}`)
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
  }, [workspaceId, scope, attempt, ingestTasks]);

  // Las tareas cambian en vivo: se muestran según su estado actual, no el de cuando se cargaron.
  const items = useMemo(() => {
    const matches = (t: Task) =>
      scope === 'done'
        ? t.status === 'done' && (t.assigneeId === myId || t.createdById === myId)
        : t.status === 'open' && (scope === 'assigned' ? t.assigneeId === myId : t.createdById === myId);
    const known = Object.values(tasks).filter((t) => t.workspaceId === workspaceId && (ids.includes(t.id) || matches(t)));
    return sortTaskViews(
      known
        .filter(matches)
        .filter((t) => conversations[t.conversationId])
        .map((t) => toTaskView(t, conversations[t.conversationId].participants, texts, myId, isAdmin)),
    ).map((view) => ({ view, conversationTitle: conversations[view.task.conversationId].title }));
  }, [tasks, ids, conversations, texts, myId, isAdmin, scope, workspaceId]);

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
    openInChat: (task: Task) => navigate(`/app/w/${workspaceId}/c/${task.conversationId}?panel=tareas`),
  };
}
