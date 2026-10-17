import type { ConversationSummary, Task } from '@parla/types';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { todayIso } from '@shared/utils/date';
import { errorMessage } from '@shared/utils/http';
import { MAX_TASK_TITLE } from '../const/tasks.const';
import type { TaskPrefill } from '../types/tasks.types';
import { isGroupAdmin, sortTaskViews, toTaskView } from '../utils/task-view.utils';

/** Panel de tareas de un chat: lista en vivo y formulario para crear (cifrando el título). */
export function useTasksPanel(conversation: ConversationSummary, prefill: TaskPrefill | null) {
  const myId = useSessionStore((s) => s.user!.id);
  const isAdmin = isGroupAdmin(conversation, myId);
  const tasks = useChatStore((s) => s.tasks);
  const texts = useChatStore((s) => s.texts);
  const status = useChatStore((s) => s.taskLists[conversation.id]);
  const { loadTasks, createTask, updateTask } = useChatStore.getState();
  const [formOpen, setFormOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [assigneeId, setAssigneeId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [sourceMessageId, setSourceMessageId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const conversationId = conversation.id;
  const reload = () => loadTasks(conversationId).catch((err) => toast(errorMessage(err), 'error'));
  useEffect(() => {
    loadTasks(conversationId).catch((err) => toast(errorMessage(err), 'error'));
  }, [conversationId, loadTasks]);

  useEffect(() => {
    if (!prefill) return;
    setTitle(prefill.title.slice(0, MAX_TASK_TITLE));
    setSourceMessageId(prefill.sourceMessageId);
    setFormOpen(true);
  }, [prefill]);

  const views = useMemo(
    () =>
      sortTaskViews(
        Object.values(tasks)
          .filter((t) => t.conversationId === conversation.id)
          .map((t) => toTaskView(t, conversation.participants, texts, myId, isAdmin)),
      ),
    [tasks, texts, conversation.id, conversation.participants, myId, isAdmin],
  );
  const open = views.filter((v) => !v.done);
  const done = views.filter((v) => v.done);

  const resetForm = () => {
    setTitle('');
    setAssigneeId('');
    setDueDate('');
    setSourceMessageId(null);
    setError(null);
  };

  return {
    status: status ?? 'loading',
    open,
    done,
    showDone,
    formOpen,
    title,
    assigneeId,
    dueDate,
    minDate: todayIso(),
    saving,
    error,
    fromMessage: sourceMessageId !== null,
    assignees: conversation.participants.map((p) => ({ id: p.user.id, name: p.user.id === myId ? 'Yo' : p.user.displayName })),
    reload,
    toggleDone: () => setShowDone((v) => !v),
    openForm: () => setFormOpen(true),
    closeForm: () => {
      setFormOpen(false);
      resetForm();
    },
    onTitleChange: (value: string) => setTitle(value.slice(0, MAX_TASK_TITLE)),
    onAssigneeChange: (value: string) => setAssigneeId(value),
    onDueDateChange: (value: string) => setDueDate(value),
    submit: async (event: FormEvent) => {
      event.preventDefault();
      if (title.trim().length < 2) {
        setError('Escribe qué hay que hacer');
        return;
      }
      setSaving(true);
      setError(null);
      try {
        await createTask(conversation.id, {
          title,
          assigneeId: assigneeId || null,
          dueDate: dueDate || null,
          sourceMessageId,
        });
        toast('Tarea creada y compartida en el chat', 'success');
        resetForm();
        setFormOpen(false);
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setSaving(false);
      }
    },
    toggleTask: (task: Task) =>
      updateTask(task, { status: task.status === 'done' ? 'open' : 'done' }).catch((err) => toast(errorMessage(err), 'error')),
  };
}
