import { useEffect } from 'react';
import { useBusinessStore } from '@shared/stores/business.store';
import { useCallStore } from '@shared/stores/call.store';
import { chatKeys, getConversations, useChatStore } from '@shared/stores/chat.store';
import { queryClient } from '@shared/utils/query-client';
import { useDriverStore } from '@shared/stores/driver.store';
import { useEffectsStore } from '@shared/stores/effects.store';
import { useSessionStore } from '@shared/stores/session.store';
import { useOrdersStore } from '@shared/stores/orders.store';
import { usePeopleStore } from '@shared/stores/people.store';
import { detectEffect } from '@shared/utils/chat-effects';
import { tokenStorage } from '@shared/utils/http';
import { connectSocket, disconnectSocket } from '@shared/utils/socket';
import { showLocalNotification } from '@shared/utils/push';
import { playMessageSound } from '@shared/utils/sound';
import { stickerEffect } from '@shared/utils/sticker-codec';
import { localNotificationFor } from '../utils/notification.utils';

const isFocused = () => document.visibilityState === 'visible' && document.hasFocus();

/** Lo que es de la sesión anterior no se mezcla con la nueva. */
function resetSessionStores() {
  useChatStore.getState().reset();
  usePeopleStore.getState().reset();
  useOrdersStore.getState().reset();
  useBusinessStore.getState().reset();
  useDriverStore.getState().reset();
}

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
      resetSessionStores();
    }
    useChatStore.getState().setIdentity(userId);
    const socket = connectSocket(token);

    const onConnect = () => {
      // Al reconectar se recupera lo que llegó mientras no había conexión. Si la lista se está pidiendo o se
      // acaba de pedir (primera conexión al entrar), no se repite: sería la misma petición dos veces.
      const { activeId } = useChatStore.getState();
      const list = queryClient.getQueryState(chatKeys.list);
      const recent = list?.fetchStatus === 'fetching' || (list?.status === 'success' && Date.now() - list.dataUpdatedAt < 5000);
      if (!recent) void useChatStore.getState().loadConversations().catch(() => undefined);
      if (activeId) void useChatStore.getState().loadMessages(activeId).catch(() => undefined);
    };

    socket.on('connect', onConnect);
    socket.on('message:new', async (message) => {
      const result = await useChatStore.getState().receiveMessage(message, { focused: isFocused() });
      // En el chat abierto, el efecto (confeti, corazones…) se calcula con el mensaje ya descifrado.
      if (result === 'active') {
        const { texts, stickers } = useChatStore.getState();
        const decrypted = texts[message.clientId];
        const effect =
          message.kind === 'sticker'
            ? stickerEffect(stickers[message.clientId] ?? null)
            : message.kind === 'text' && decrypted?.ok
              ? detectEffect(decrypted.text)
              : null;
        useEffectsStore.getState().play(effect);
      }
      const sound = useSessionStore.getState().user?.preferences.notificationSound;
      if (result === 'background' && sound) playMessageSound();
      // Con la pestaña oculta, aviso del sistema con el texto ya descifrado en el navegador.
      const { texts, myId } = useChatStore.getState();
      const conversation = getConversations()[message.conversationId];
      if (result === 'background' && document.visibilityState === 'hidden' && conversation && myId) {
        const notice = localNotificationFor(message, conversation, texts, myId);
        void showLocalNotification(notice.title, notice.body, notice.url, notice.tag).catch(() => undefined);
      }
    });
    socket.on('message:replies', (payload) => useChatStore.getState().applyReplies(payload));
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
      usePeopleStore.getState().applyPresence(payload);
    });
    // Servicios: cada cambio de un pedido (pagado, en camino, entregado) llega al instante.
    socket.on('order:updated', (order) => useOrdersStore.getState().upsert(order));
    socket.on('business-order:updated', (order) => useBusinessStore.getState().upsert(order));
    socket.on('driver-order:updated', (order) => useDriverStore.getState().upsert(order));
    socket.on('driver:updated', (driver) => useDriverStore.setState({ driver }));
    socket.on('delivery:location', (location) => {
      useOrdersStore.getState().applyLocation(location);
      useBusinessStore.getState().applyLocation(location);
    });
    // Fotos, nombres y usuarios nuevos de los contactos (y los míos, si cambié desde otro dispositivo).
    socket.on('profile:updated', (profile) => {
      useChatStore.getState().applyProfile(profile);
      useSessionStore.getState().applyOwnProfile(profile);
    });

    // Al volver a la pestaña, lo que está abierto queda leído.
    const onFocus = () => {
      const { activeId } = useChatStore.getState();
      if (activeId && getConversations()[activeId]?.unreadCount) void useChatStore.getState().markRead(activeId);
    };
    window.addEventListener('focus', onFocus);

    return () => {
      window.removeEventListener('focus', onFocus);
      socket.removeAllListeners();
      pendingTeardown = window.setTimeout(() => {
        pendingTeardown = null;
        if (useCallStore.getState().phase !== 'idle') useCallStore.getState().hangUp();
        disconnectSocket();
        resetSessionStores();
      }, 50);
    };
  }, [userId]);
}
