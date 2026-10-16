import type {
  ConversationSummary,
  Message,
  MessagePage,
  MessageStatusUpdate,
  PresencePayload,
  PublicUser,
  SendMessageRequest,
  TypingPayload,
  UploadedFile,
} from '@parla/types';
import { create } from 'zustand';
import type { ChatMessage, ConnectionState, DecryptedText, MessageThread } from '../types/chat.types';
import { createWrappedKeys, openText, sealFile, sealText, wrapExistingKey, conversationKey } from '../utils/crypto-vault';
import { http } from '../utils/http';
import { newClientId } from '../utils/ids';
import { getSocket } from '../utils/socket';

const TYPING_TTL = 5000;
const STATUS_RANK = { sent: 0, delivered: 1, read: 2 } as const;

export type MediaKind = 'image' | 'audio' | 'video';

export interface OutgoingMedia {
  kind: MediaKind;
  blob: Blob;
  mimeType: string;
  caption?: string;
  durationMs?: number;
}

interface ChatState {
  myId: string | null;
  workspaceId: string | null;
  conversations: Record<string, ConversationSummary>;
  listStatus: 'idle' | 'loading' | 'ready' | 'error';
  threads: Record<string, MessageThread>;
  texts: Record<string, DecryptedText>;
  typing: Record<string, Record<string, number>>;
  activeId: string | null;
  connection: ConnectionState;
  /** Retiene el último mensaje pendiente de enviar cuando falla, para reintentar. */
  outbox: Record<string, { conversationId: string; text?: string; media?: OutgoingMedia }>;

  setIdentity: (myId: string | null) => void;
  setConnection: (state: ConnectionState) => void;
  loadConversations: (workspaceId: string) => Promise<void>;
  fetchConversation: (conversationId: string) => Promise<ConversationSummary | null>;
  upsertConversation: (conversation: ConversationSummary) => void;
  setActive: (conversationId: string | null) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  loadOlder: (conversationId: string) => Promise<void>;
  receiveMessage: (message: Message, options: { focused: boolean }) => Promise<'mine' | 'active' | 'background'>;
  applyStatus: (update: MessageStatusUpdate) => void;
  applyTyping: (payload: TypingPayload) => void;
  applyPresence: (payload: PresencePayload) => void;
  markRead: (conversationId: string) => Promise<void>;
  sendText: (conversationId: string, text: string) => Promise<void>;
  sendMedia: (conversationId: string, media: OutgoingMedia) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  startDirect: (workspaceId: string, me: PublicUser, other: PublicUser) => Promise<ConversationSummary>;
  createGroup: (workspaceId: string, me: PublicUser, title: string, members: PublicUser[]) => Promise<ConversationSummary>;
  addParticipants: (conversationId: string, me: PublicUser, users: PublicUser[]) => Promise<void>;
  leave: (conversationId: string) => Promise<void>;
  reset: () => void;
}

const emptyThread = (): MessageThread => ({ items: [], nextCursor: null, status: 'loading', loadingOlder: false });

const initialState = {
  myId: null,
  workspaceId: null,
  conversations: {},
  listStatus: 'idle' as const,
  threads: {},
  texts: {},
  typing: {},
  activeId: null,
  connection: 'connecting' as const,
  outbox: {},
};

export const useChatStore = create<ChatState>((set, get) => {
  /** Descifra en el navegador los mensajes que aún no tienen texto. */
  const decryptAll = async (conversation: ConversationSummary, messages: Message[]) => {
    const pending = messages.filter((m) => m.body && !get().texts[m.clientId]);
    if (pending.length === 0) return;
    const entries = await Promise.all(
      pending.map(async (m): Promise<[string, DecryptedText]> => {
        try {
          return [m.clientId, { ok: true, text: await openText(conversation, m.body!) }];
        } catch {
          return [m.clientId, { ok: false }];
        }
      }),
    );
    set({ texts: { ...get().texts, ...Object.fromEntries(entries) } });
  };

  const patchThread = (conversationId: string, patch: (thread: MessageThread) => MessageThread) => {
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({ threads: { ...get().threads, [conversationId]: patch(thread) } });
  };

  /** Inserta o reemplaza un mensaje en su hilo (por id o por clientId del envío optimista). */
  const putMessage = (message: ChatMessage) => {
    patchThread(message.conversationId, (thread) => {
      const index = thread.items.findIndex((m) => m.id === message.id || m.clientId === message.clientId);
      if (index === -1) return { ...thread, items: [...thread.items, message] };
      const items = [...thread.items];
      const previous = items[index];
      // Un estado nunca retrocede (el aviso de "leído" puede llegar antes que la respuesta del envío).
      const status = STATUS_RANK[previous.status] > STATUS_RANK[message.status] && !previous.local ? previous.status : message.status;
      items[index] = { ...message, status, localPreviewUrl: message.localPreviewUrl ?? previous.localPreviewUrl };
      return { ...thread, items };
    });
  };

  const touchConversation = (message: Message, unreadDelta: number) => {
    const conversation = get().conversations[message.conversationId];
    if (!conversation) return;
    const isNewer = !conversation.lastMessage || conversation.lastMessage.createdAt <= message.createdAt;
    set({
      conversations: {
        ...get().conversations,
        [conversation.id]: {
          ...conversation,
          lastMessage: isNewer ? message : conversation.lastMessage,
          updatedAt: isNewer ? message.createdAt : conversation.updatedAt,
          unreadCount: Math.max(0, conversation.unreadCount + unreadDelta),
        },
      },
    });
  };

  const deliver = async (conversationId: string, outgoing: SendMessageRequest, media?: OutgoingMedia) => {
    try {
      const saved = await http.post<Message>(`/chats/${conversationId}/messages`, outgoing);
      putMessage(saved);
      touchConversation(saved, 0);
      const { [outgoing.clientId]: _sent, ...outbox } = get().outbox;
      set({ outbox });
    } catch (error) {
      patchThread(conversationId, (thread) => ({
        ...thread,
        items: thread.items.map((m) => (m.clientId === outgoing.clientId ? { ...m, local: 'failed' } : m)),
      }));
      set({ outbox: { ...get().outbox, [outgoing.clientId]: { conversationId, media } } });
      throw error;
    }
  };

  const optimistic = (conversationId: string, clientId: string, kind: Message['kind'], extra: Partial<ChatMessage> = {}) => {
    const message: ChatMessage = {
      id: `local-${clientId}`,
      conversationId,
      senderId: get().myId ?? '',
      kind,
      body: null,
      media: null,
      systemText: null,
      clientId,
      status: 'sent',
      createdAt: new Date().toISOString(),
      local: 'pending',
      ...extra,
    };
    putMessage(message);
    touchConversation(message, 0);
  };

  const uploadAndSend = async (conversationId: string, clientId: string, media: OutgoingMedia) => {
    const conversation = get().conversations[conversationId];
    try {
      const sealed = await sealFile(conversation, await media.blob.arrayBuffer());
      const form = new FormData();
      form.append('file', new Blob([sealed.data], { type: 'application/octet-stream' }), 'cifrado.bin');
      const uploaded = await http.upload<UploadedFile>(`/chats/${conversationId}/media`, form);
      const caption = media.caption?.trim() ?? '';
      await deliver(
        conversationId,
        {
          clientId,
          kind: media.kind,
          body: caption ? await sealText(conversation, caption) : null,
          media: {
            fileId: uploaded.fileId,
            mimeType: media.mimeType,
            size: media.blob.size,
            iv: sealed.iv,
            ...(media.durationMs ? { durationMs: Math.round(media.durationMs) } : {}),
          },
        },
        media,
      );
    } catch (error) {
      patchThread(conversationId, (thread) => ({
        ...thread,
        items: thread.items.map((m) => (m.clientId === clientId ? { ...m, local: 'failed' } : m)),
      }));
      set({ outbox: { ...get().outbox, [clientId]: { conversationId, media } } });
      throw error;
    }
  };

  return {
    ...initialState,

    setIdentity: (myId) => set({ myId }),
    setConnection: (connection) => set({ connection }),

    loadConversations: async (workspaceId) => {
      const switching = get().workspaceId !== workspaceId;
      set({
        workspaceId,
        listStatus: switching || get().listStatus !== 'ready' ? 'loading' : 'ready',
        ...(switching ? { conversations: {}, activeId: null } : {}),
      });
      try {
        const list = await http.get<ConversationSummary[]>(`/chats?workspaceId=${encodeURIComponent(workspaceId)}`);
        if (get().workspaceId !== workspaceId) return;
        set({ conversations: Object.fromEntries(list.map((c) => [c.id, c])), listStatus: 'ready' });
        await Promise.all(list.map((c) => (c.lastMessage ? decryptAll(c, [c.lastMessage]) : undefined)));
      } catch (error) {
        if (get().workspaceId === workspaceId) set({ listStatus: 'error' });
        throw error;
      }
    },

    fetchConversation: async (conversationId) => {
      try {
        const conversation = await http.get<ConversationSummary>(`/chats/${conversationId}`);
        get().upsertConversation(conversation);
        return conversation;
      } catch {
        return null;
      }
    },

    upsertConversation: (conversation) => {
      if (conversation.workspaceId !== get().workspaceId) return;
      set({ conversations: { ...get().conversations, [conversation.id]: conversation } });
      if (conversation.lastMessage) void decryptAll(conversation, [conversation.lastMessage]);
    },

    setActive: (activeId) => set({ activeId }),

    loadMessages: async (conversationId) => {
      const conversation = get().conversations[conversationId];
      if (!conversation) return;
      if (!get().threads[conversationId]) set({ threads: { ...get().threads, [conversationId]: emptyThread() } });
      try {
        const page = await http.get<MessagePage>(`/chats/${conversationId}/messages`);
        await decryptAll(conversation, page.messages);
        const current = get().threads[conversationId];
        const locals = current?.items.filter((m) => m.local && !page.messages.some((p) => p.clientId === m.clientId)) ?? [];
        set({
          threads: {
            ...get().threads,
            [conversationId]: { items: [...page.messages, ...locals], nextCursor: page.nextCursor, status: 'ready', loadingOlder: false },
          },
        });
      } catch (error) {
        patchThread(conversationId, (thread) => ({ ...thread, status: 'error' }));
        throw error;
      }
    },

    loadOlder: async (conversationId) => {
      const thread = get().threads[conversationId];
      const conversation = get().conversations[conversationId];
      if (!thread?.nextCursor || thread.loadingOlder || !conversation) return;
      patchThread(conversationId, (t) => ({ ...t, loadingOlder: true }));
      try {
        const page = await http.get<MessagePage>(`/chats/${conversationId}/messages?before=${thread.nextCursor}`);
        await decryptAll(conversation, page.messages);
        patchThread(conversationId, (t) => ({
          ...t,
          items: [...page.messages, ...t.items],
          nextCursor: page.nextCursor,
          loadingOlder: false,
        }));
      } catch (error) {
        patchThread(conversationId, (t) => ({ ...t, loadingOlder: false }));
        throw error;
      }
    },

    receiveMessage: async (message, { focused }) => {
      let conversation = get().conversations[message.conversationId];
      if (!conversation) {
        const fetched = await get().fetchConversation(message.conversationId);
        if (!fetched || fetched.workspaceId !== get().workspaceId) return 'background';
        conversation = fetched;
      }
      await decryptAll(conversation, [message]);
      const mine = message.senderId === get().myId && message.kind !== 'system';
      const isActive = get().activeId === message.conversationId && focused;
      putMessage(message);
      touchConversation(message, mine || isActive || message.kind === 'system' ? 0 : 1);
      if (get().typing[message.conversationId]?.[message.senderId]) {
        get().applyTyping({ conversationId: message.conversationId, userId: message.senderId, isTyping: false });
      }
      if (mine || message.kind === 'system') return 'mine';
      if (isActive) {
        await get().markRead(message.conversationId);
        return 'active';
      }
      await http.post(`/chats/${message.conversationId}/delivered`, { messageIds: [message.id] }).catch(() => undefined);
      return 'background';
    },

    applyStatus: ({ conversationId, messageIds, status }) => {
      const ids = new Set(messageIds);
      const upgrade = <T extends Message>(m: T): T =>
        ids.has(m.id) && STATUS_RANK[status] > STATUS_RANK[m.status] ? { ...m, status } : m;
      patchThread(conversationId, (thread) => ({ ...thread, items: thread.items.map(upgrade) }));
      const conversation = get().conversations[conversationId];
      if (conversation?.lastMessage && ids.has(conversation.lastMessage.id)) {
        set({
          conversations: {
            ...get().conversations,
            [conversationId]: { ...conversation, lastMessage: upgrade(conversation.lastMessage) },
          },
        });
      }
    },

    applyTyping: ({ conversationId, userId, isTyping }) => {
      const current = { ...(get().typing[conversationId] ?? {}) };
      if (isTyping) current[userId] = Date.now() + TYPING_TTL;
      else delete current[userId];
      set({ typing: { ...get().typing, [conversationId]: current } });
      if (isTyping) {
        setTimeout(() => {
          const expires = get().typing[conversationId]?.[userId];
          if (expires && expires <= Date.now()) get().applyTyping({ conversationId, userId, isTyping: false });
        }, TYPING_TTL + 100);
      }
    },

    applyPresence: ({ userId, presence, lastSeenAt }) => {
      const conversations = Object.fromEntries(
        Object.entries(get().conversations).map(([id, c]) => [
          id,
          c.participants.some((p) => p.user.id === userId)
            ? {
                ...c,
                participants: c.participants.map((p) =>
                  p.user.id === userId ? { ...p, user: { ...p.user, presence, lastSeenAt: lastSeenAt ?? p.user.lastSeenAt } } : p,
                ),
              }
            : c,
        ]),
      );
      set({ conversations });
    },

    markRead: async (conversationId) => {
      const conversation = get().conversations[conversationId];
      if (conversation?.unreadCount) {
        set({ conversations: { ...get().conversations, [conversationId]: { ...conversation, unreadCount: 0 } } });
      }
      await http.post(`/chats/${conversationId}/read`).catch(() => undefined);
    },

    sendText: async (conversationId, text) => {
      const conversation = get().conversations[conversationId];
      const clean = text.trim();
      if (!conversation || !clean) return;
      const clientId = newClientId();
      set({ texts: { ...get().texts, [clientId]: { ok: true, text: clean } } });
      optimistic(conversationId, clientId, 'text');
      const body = await sealText(conversation, clean);
      await deliver(conversationId, { clientId, kind: 'text', body, media: null });
    },

    sendMedia: async (conversationId, media) => {
      if (!get().conversations[conversationId]) return;
      const clientId = newClientId();
      const caption = media.caption?.trim();
      if (caption) set({ texts: { ...get().texts, [clientId]: { ok: true, text: caption } } });
      optimistic(conversationId, clientId, media.kind, {
        localPreviewUrl: URL.createObjectURL(media.blob),
        media: { fileId: '', mimeType: media.mimeType, size: media.blob.size, iv: '', durationMs: media.durationMs },
      });
      await uploadAndSend(conversationId, clientId, media);
    },

    retry: async (clientId) => {
      const pending = get().outbox[clientId];
      if (!pending) return;
      patchThread(pending.conversationId, (thread) => ({
        ...thread,
        items: thread.items.map((m) => (m.clientId === clientId ? { ...m, local: 'pending' } : m)),
      }));
      if (pending.media) {
        await uploadAndSend(pending.conversationId, clientId, pending.media);
        return;
      }
      const conversation = get().conversations[pending.conversationId];
      const text = get().texts[clientId];
      if (!conversation || !text?.ok) return;
      await deliver(pending.conversationId, {
        clientId,
        kind: 'text',
        body: await sealText(conversation, text.text),
        media: null,
      });
    },

    emitTyping: (conversationId, isTyping) => {
      getSocket()?.emit('typing', { conversationId, isTyping });
    },

    startDirect: async (workspaceId, me, other) => {
      const existing = Object.values(get().conversations).find(
        (c) => c.kind === 'direct' && c.participants.some((p) => p.user.id === other.id),
      );
      if (existing) return existing;
      const keys = await createWrappedKeys(me, [other]);
      const conversation = await http.post<ConversationSummary>('/chats/direct', { workspaceId, userId: other.id, keys });
      get().upsertConversation(conversation);
      return conversation;
    },

    createGroup: async (workspaceId, me, title, members) => {
      const keys = await createWrappedKeys(me, members);
      const conversation = await http.post<ConversationSummary>('/chats/groups', {
        workspaceId,
        title,
        memberIds: members.map((m) => m.id),
        keys,
      });
      get().upsertConversation(conversation);
      return conversation;
    },

    addParticipants: async (conversationId, me, users) => {
      const conversation = get().conversations[conversationId];
      if (!conversation) return;
      // Un miembro que ya tiene la clave la envuelve para los nuevos: el servidor nunca la conoce.
      const key = await conversationKey(conversation);
      const keys = await wrapExistingKey(key, me.id, users);
      const updated = await http.post<ConversationSummary>(`/chats/${conversationId}/participants`, {
        userIds: users.map((u) => u.id),
        keys,
      });
      get().upsertConversation(updated);
    },

    leave: async (conversationId) => {
      await http.post(`/chats/${conversationId}/leave`);
      const { [conversationId]: _left, ...conversations } = get().conversations;
      set({ conversations, activeId: get().activeId === conversationId ? null : get().activeId });
    },

    reset: () => set({ ...initialState }),
  };
});

/** Conversaciones ordenadas por última actividad. */
export function sortConversations(conversations: Record<string, ConversationSummary>): ConversationSummary[] {
  return Object.values(conversations).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
