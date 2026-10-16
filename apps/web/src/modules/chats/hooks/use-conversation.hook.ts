import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { buildTimeline } from '../utils/message-timeline.utils';
import { counterpart, headerSubtitle, typingLabel } from '../utils/conversation-preview.utils';

const NEAR_BOTTOM_PX = 160;

/** Conversación abierta: carga, lectura, desplazamiento y paneles. */
export function useConversation() {
  const { workspaceId = '', conversationId = '' } = useParams();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const conversation = useChatStore((s) => s.conversations[conversationId]);
  const listStatus = useChatStore((s) => s.listStatus);
  const thread = useChatStore((s) => s.threads[conversationId]);
  const texts = useChatStore((s) => s.texts);
  const typing = useChatStore((s) => s.typing[conversationId]);
  const { setActive, loadMessages, loadOlder, markRead, fetchConversation, retry } = useChatStore.getState();
  const [infoOpen, setInfoOpen] = useState(false);
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
    setInfoOpen(false);
    stickToBottom.current = true;
    return () => setActive(null);
  }, [conversationId, setActive]);

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

  const other = conversation ? counterpart(conversation, user.id) : null;

  return {
    user,
    conversation,
    thread,
    timeline,
    texts,
    workspaceId,
    typing: conversation ? typingLabel(conversation, typing) : null,
    subtitle: conversation ? headerSubtitle(conversation, user.id) : '',
    online: other?.presence === 'online',
    infoOpen,
    lightbox,
    showJump,
    scrollRef,
    onScroll,
    openInfo: () => setInfoOpen(true),
    closeInfo: () => setInfoOpen(false),
    openImage: (url: string) => setLightbox(url),
    closeImage: () => setLightbox(null),
    jumpToBottom: () => {
      const el = scrollRef.current;
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    },
    retryMessage: (clientId: string) => retry(clientId).catch((err) => toast(errorMessage(err), 'error')),
    reload: () => loadMessages(conversationId).catch((err) => toast(errorMessage(err), 'error')),
    back: () => navigate(`/app/w/${workspaceId}`),
    participantName: (userId: string) =>
      conversation?.participants.find((p) => p.user.id === userId)?.user.displayName ?? 'Ex miembro',
    participantColor: (userId: string) =>
      conversation?.participants.find((p) => p.user.id === userId)?.user.avatarColor ?? 'teal',
  };
}
