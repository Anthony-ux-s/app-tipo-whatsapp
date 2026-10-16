import type { Task } from '@parla/types';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import type { ChatMessage } from '@shared/types/chat.types';
import { errorMessage } from '@shared/utils/http';
import { toTaskView } from '../../tasks/utils/task-view.utils';
import type { TaskPrefill } from '../../tasks/types/tasks.types';
import type { MessageActions } from '../types/message-actions.types';
import { buildTimeline } from '../utils/message-timeline.utils';
import { counterpart, headerSubtitle, typingLabel } from '../utils/conversation-preview.utils';

const NEAR_BOTTOM_PX = 160;

export type SidePanel =
  | { type: 'info' }
  | { type: 'thread'; rootId: string }
  | { type: 'tasks'; prefill: TaskPrefill | null }
  | null;

/** Conversación abierta: carga, lectura, desplazamiento, paneles laterales y acciones de cada mensaje. */
export function useConversation() {
  const { workspaceId = '', conversationId = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const isAdmin = useWorkspaceStore((s) => s.details[workspaceId]?.role === 'admin');
  const conversation = useChatStore((s) => s.conversations[conversationId]);
  const listStatus = useChatStore((s) => s.listStatus);
  const thread = useChatStore((s) => s.threads[conversationId]);
  const texts = useChatStore((s) => s.texts);
  const tasks = useChatStore((s) => s.tasks);
  const typing = useChatStore((s) => s.typing[conversationId]);
  const { setActive, loadMessages, loadOlder, markRead, fetchConversation, retry, setReplyDraft, updateTask } =
    useChatStore.getState();
  const [panel, setPanel] = useState<SidePanel>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [showJump, setShowJump] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);
  const previousHeight = useRef(0);
  const loadedFor = useRef<string | null>(null);

  // Abrir: marcar activa, traer mensajes y dejar todo como leído.
  useEffect(() => {
    if (!conversationId) return;
    setActive(conversationId);
    setPanel(null);
    setMenuFor(null);
    stickToBottom.current = true;
    return () => setActive(null);
  }, [conversationId, setActive]);

  // ?panel=tareas (desde "Mis tareas" o una notificación) abre el panel de tareas.
  useEffect(() => {
    if (searchParams.get('panel') !== 'tareas') return;
    setPanel({ type: 'tasks', prefill: null });
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (!conversation || loadedFor.current === conversationId) return;
    loadedFor.current = conversationId;
    loadMessages(conversationId).catch((err) => toast(errorMessage(err), 'error'));
    void markRead(conversationId);
  }, [conversation, conversationId, loadMessages, markRead]);

  // Si la conversación no está en la lista (enlace directo), se busca en el servidor.
  useEffect(() => {
    if (conversation || listStatus !== 'ready' || !conversationId) return;
    void fetchConversation(conversationId).then((found) => {
      if (!found) navigate(`/app/w/${workspaceId}`, { replace: true });
    });
  }, [conversation, listStatus, conversationId, fetchConversation, navigate, workspaceId]);

  const timeline = useMemo(() => buildTimeline(thread?.items ?? []), [thread?.items]);

  // Mantener la vista abajo al llegar mensajes, o la posición al cargar los anteriores.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (previousHeight.current && el.scrollTop < 40) {
      el.scrollTop = el.scrollHeight - previousHeight.current;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
    previousHeight.current = 0;
  }, [timeline]);

  // Las fotos y notas de voz se descifran después de pintar: si estábamos abajo, seguir abajo.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight;
    });
    Array.from(el.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [timeline.length, conversationId]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = distance < NEAR_BOTTOM_PX;
    setShowJump(distance > NEAR_BOTTOM_PX * 2);
    if (el.scrollTop < 80 && thread?.nextCursor && !thread.loadingOlder) {
      previousHeight.current = el.scrollHeight;
      loadOlder(conversationId).catch((err) => toast(errorMessage(err), 'error'));
    }
  }, [thread?.nextCursor, thread?.loadingOlder, loadOlder, conversationId]);

  const person = useCallback(
    (userId: string) => {
      const found = conversation?.participants.find((p) => p.user.id === userId)?.user;
      return { name: found ? (found.id === user.id ? 'Tú' : found.displayName) : 'Ex miembro', color: found?.avatarColor ?? 'teal' };
    },
    [conversation?.participants, user.id],
  );

  const textOf = (message: ChatMessage) => {
    const decrypted = texts[message.clientId];
    return decrypted?.ok ? decrypted.text : '';
  };

  const actions: MessageActions = {
    menuFor,
    toggleMenu: (clientId) => setMenuFor((current) => (current === clientId ? null : clientId)),
    reply: (message) => {
      setMenuFor(null);
      setReplyDraft(conversationId, message);
    },
    openThread: (rootId) => {
      setMenuFor(null);
      setPanel({ type: 'thread', rootId });
    },
    createTaskFrom: (message) => {
      setMenuFor(null);
      setPanel({ type: 'tasks', prefill: { title: textOf(message), sourceMessageId: message.id } });
    },
    copyText: (message) => {
      setMenuFor(null);
      void navigator.clipboard
        .writeText(textOf(message))
        .then(() => toast('Texto copiado', 'success'))
        .catch(() => toast('No se pudo copiar', 'error'));
    },
    openImage: (url) => setLightbox(url),
    retry: (clientId) => retry(clientId).catch((err) => toast(errorMessage(err), 'error')),
    toggleTask: (task: Task) =>
      updateTask(task, { status: task.status === 'done' ? 'open' : 'done' }).catch((err) => toast(errorMessage(err), 'error')),
    openTasks: () => setPanel({ type: 'tasks', prefill: null }),
    taskView: (task) => toTaskView(tasks[task.id] ?? task, conversation?.participants ?? [], texts, user.id, isAdmin),
    person,
  };

  const other = conversation ? counterpart(conversation, user.id) : null;

  return {
    user,
    conversation,
    thread,
    timeline,
    texts,
    actions,
    typing: conversation ? typingLabel(conversation, typing) : null,
    subtitle: conversation ? headerSubtitle(conversation, user.id) : '',
    online: other?.presence === 'online',
    panel,
    lightbox,
    showJump,
    scrollRef,
    onScroll,
    openInfo: () => setPanel({ type: 'info' }),
    openTasks: () => setPanel({ type: 'tasks', prefill: null }),
    closePanel: () => setPanel(null),
    closeImage: () => setLightbox(null),
    closeMenu: () => setMenuFor(null),
    jumpToBottom: () => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    },
    reload: () => loadMessages(conversationId).catch((err) => toast(errorMessage(err), 'error')),
    back: () => navigate(`/app/w/${workspaceId}`),
  };
}
