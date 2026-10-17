import { useEffect } from 'react';
import { useCallStore } from '@shared/stores/call.store';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { tokenStorage } from '@shared/utils/http';
import { connectSocket, disconnectSocket } from '@shared/utils/socket';
import { showLocalNotification } from '@shared/utils/push';
import { playMessageSound } from '@shared/utils/sound';
import { localNotificationFor } from '../utils/notification.utils';

const isFocused = () => document.visibilityState === 'visible' && document.hasFocus();

/** El cierre se difiere un instante: si el armazón se vuelve a montar (StrictMode), se reutiliza el socket. */
let pendingTeardown: number | null = null;

/** Conecta el socket de la sesión y lleva cada evento del servidor a su store. */
export function useRealtime(userId: string | undefined) {
  useEffect(() => {
    const token = tokenStorage.get();
    if (!userId || !token) return;
    if (pendingTeardown) window.clearTimeout(pendingTeardown);
    pendingTeardown = null;

    if (useChatStore.getState().myId !== userId) {
      useChatStore.getState().reset();
      useWorkspaceStore.getState().reset();
    }
    useChatStore.getState().setIdentity(userId);
    const socket = connectSocket(token);
    if (socket.connected) useChatStore.getState().setConnection('online');

    const onConnect = () => {
      useChatStore.getState().setConnection('online');
      // Al reconectar se recupera lo que llegó mientras no había conexión.
      const { workspaceId, activeId } = useChatStore.getState();
      if (workspaceId) void useChatStore.getState().loadConversations(workspaceId).catch(() => undefined);
      if (activeId) void useChatStore.getState().loadMessages(activeId).catch(() => undefined);
    };
    const onDisconnect = () => useChatStore.getState().setConnection('offline');
    const onReconnecting = () => useChatStore.getState().setConnection('connecting');

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('reconnecting', onReconnecting);
    socket.on('message:new', async (message) => {
      const result = await useChatStore.getState().receiveMessage(message, { focused: isFocused() });
      const sound = useSessionStore.getState().user?.preferences.notificationSound;
      if (result === 'background' && sound) playMessageSound();
      // Con la pestaña oculta, aviso del sistema con el texto ya descifrado en el navegador.
      const { conversations, texts, myId } = useChatStore.getState();
      const conversation = conversations[message.conversationId];
      if (result === 'background' && document.visibilityState === 'hidden' && conversation && myId) {
        const notice = localNotificationFor(message, conversation, texts, myId);
        void showLocalNotification(notice.title, notice.body, notice.url, notice.tag).catch(() => undefined);
      }
    });
    socket.on('message:replies', (payload) => useChatStore.getState().applyReplies(payload));
    socket.on('task:upsert', (task) => void useChatStore.getState().applyTask(task));
    // Llamadas: la señalización llega por el mismo socket.
    const calls = () => useCallStore.getState();
    socket.on('call:incoming', ({ call }) => void calls().onIncoming(call, userId));
    socket.on('call:participant-joined', ({ callId }) => calls().onParticipantJoined(callId));
    socket.on('call:participant-left', ({ callId, userId: who }) => calls().onParticipantLeft(callId, who));
    socket.on('call:signal', ({ callId, from, data }) => void calls().onSignal(callId, from, data));
    socket.on('call:ended', ({ callId, reason }) => calls().onEnded(callId, reason));
    socket.on('call:answered-elsewhere', ({ callId }) => calls().onAnsweredElsewhere(callId));
    socket.on('message:status', (update) => useChatStore.getState().applyStatus(update));
    socket.on('conversation:upsert', (conversation) => useChatStore.getState().upsertConversation(conversation));
    socket.on('typing', (payload) => useChatStore.getState().applyTyping(payload));
    socket.on('presence', (payload) => {
      useChatStore.getState().applyPresence(payload);
      useWorkspaceStore.getState().applyPresence(payload);
    });
    socket.on('workspace:changed', ({ workspaceId }) => {
      const workspaces = useWorkspaceStore.getState();
      void workspaces.loadWorkspaces().catch(() => undefined);
      if (workspaces.details[workspaceId]) void workspaces.loadDetail(workspaceId).catch(() => undefined);
      if (useChatStore.getState().workspaceId === workspaceId) {
        void useChatStore.getState().loadConversations(workspaceId).catch(() => undefined);
      }
    });

    // Al volver a la pestaña, lo que está abierto queda leído.
    const onFocus = () => {
      const { activeId, conversations } = useChatStore.getState();
      if (activeId && conversations[activeId]?.unreadCount) void useChatStore.getState().markRead(activeId);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      socket.removeAllListeners();
      pendingTeardown = window.setTimeout(() => {
        pendingTeardown = null;
        if (useCallStore.getState().phase !== 'idle') useCallStore.getState().hangUp();
        disconnectSocket();
        useChatStore.getState().reset();
        useWorkspaceStore.getState().reset();
      }, 50);
    };
  }, [userId]);
}
