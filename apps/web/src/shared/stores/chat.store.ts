import type {
  ConversationSummary,
  EncryptedPayload,
  Message,
  MessagePage,
  MessageStatusUpdate,
  PresencePayload,
  PublicUser,
  SendMessageRequest,
  ThreadPage,
  TypingPayload,
  UploadedFile,
} from '@parla/types';
import { create } from 'zustand';
import type { ChatMessage, ConnectionState, DecryptedText, MessageThread } from '../types/chat.types';
import { createWrappedKeys, openText, sealFile, sealText, wrapExistingKey, conversationKey } from '../utils/crypto-vault';
import { http } from '../utils/http';
import { newClientId } from '../utils/ids';
import { getSocket } from '../utils/socket';
import { decodeSticker, encodeSticker, stickerLabel, type StickerRef } from '../utils/sticker-codec';

const TYPING_TTL = 5000;
const STATUS_RANK = { sent: 0, delivered: 1, read: 2 } as const;

export type MediaKind = 'image' | 'audio' | 'video';

export interface OutgoingMedia {
  kind: MediaKind;
  blob: Blob;
  mimeType: string;
  caption?: string;
  durationMs?: number;
  replyToId?: string | null;
}

export interface SendOptions {
  replyToId?: string | null;
  mentions?: string[];
}

export interface ThreadPanelState {
  status: 'loading' | 'ready' | 'error';
  root: ChatMessage | null;
  replies: ChatMessage[];
}

interface ChatState {
  myId: string | null;
  conversations: Record<string, ConversationSummary>;
  listStatus: 'idle' | 'loading' | 'ready' | 'error';
  threads: Record<string, MessageThread>;
  texts: Record<string, DecryptedText>;
  /** Stickers descifrados, por clientId (en `texts` queda su etiqueta legible: «Sticker «¡Hola!»»). */
  stickers: Record<string, StickerRef | null>;
  typing: Record<string, Record<string, number>>;
  activeId: string | null;
  connection: ConnectionState;
  /** Retiene el último mensaje pendiente de enviar cuando falla, para reintentar. */
  outbox: Record<string, { conversationId: string; kind?: SendMessageRequest['kind']; media?: OutgoingMedia; options?: SendOptions }>;
  /** Mensaje al que se está respondiendo en cada conversación. */
  replyDraft: Record<string, ChatMessage | null>;
  /** Hilos abiertos en el panel lateral, por mensaje raíz. */
  threadPanels: Record<string, ThreadPanelState>;

  setIdentity: (myId: string | null) => void;
  setConnection: (state: ConnectionState) => void;
  loadConversations: () => Promise<void>;
  fetchConversation: (conversationId: string) => Promise<ConversationSummary | null>;
  upsertConversation: (conversation: ConversationSummary) => void;
  setActive: (conversationId: string | null) => void;
  loadMessages: (conversationId: string) => Promise<void>;
  loadOlder: (conversationId: string) => Promise<void>;
  receiveMessage: (message: Message, options: { focused: boolean }) => Promise<'mine' | 'active' | 'background'>;
  applyStatus: (update: MessageStatusUpdate) => void;
  applyTyping: (payload: TypingPayload) => void;
  applyPresence: (payload: PresencePayload) => void;
  /** Alguien cambió su foto, nombre o usuario. */
  applyProfile: (user: PublicUser) => void;
  /** Volver a compartir la clave del chat con quien restableció su cuenta. */
  reshareKey: (conversationId: string, me: PublicUser) => Promise<void>;
  markRead: (conversationId: string) => Promise<void>;
  sendText: (conversationId: string, text: string, options?: SendOptions) => Promise<void>;
  sendSticker: (conversationId: string, sticker: StickerRef, options?: SendOptions) => Promise<void>;
  setReplyDraft: (conversationId: string, message: ChatMessage | null) => void;
  loadThread: (conversationId: string, rootId: string) => Promise<void>;
  applyReplies: (payload: { conversationId: string; messageId: string; replyCount: number }) => void;
  sendMedia: (conversationId: string, media: OutgoingMedia) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  emitTyping: (conversationId: string, isTyping: boolean) => void;
  startDirect: (me: PublicUser, other: PublicUser) => Promise<ConversationSummary>;
  createGroup: (me: PublicUser, title: string, members: PublicUser[]) => Promise<ConversationSummary>;
  addParticipants: (conversationId: string, me: PublicUser, users: PublicUser[]) => Promise<void>;
  leave: (conversationId: string) => Promise<void>;
  reset: () => void;
}

const emptyThread = (): MessageThread => ({ items: [], nextCursor: null, status: 'loading', loadingOlder: false });

const initialState = {
  myId: null,
  conversations: {},
  listStatus: 'idle' as const,
  threads: {},
  texts: {},
  stickers: {},
  typing: {},
  activeId: null,
  connection: 'connecting' as const,
  outbox: {},
  replyDraft: {},
  threadPanels: {},
};


export const useChatStore = create<ChatState>((set, get) => {
  /** Descifra en el navegador los mensajes que aún no tienen texto. */
  const decryptAll = async (conversation: ConversationSummary, messages: Message[]) => {
    // Cuerpos de mensajes y citas de respuestas: todo se descifra aquí.
    const payloads = new Map<string, EncryptedPayload>();
    const stickerKeys = new Set<string>();
    for (const m of messages) {
      if (m.body) payloads.set(m.clientId, m.body);
      if (m.replyTo?.body) payloads.set(m.replyTo.clientId, m.replyTo.body);
      if (m.kind === 'sticker') stickerKeys.add(m.clientId);
      if (m.replyTo?.kind === 'sticker') stickerKeys.add(m.replyTo.clientId);
    }
    // También se reintentan los que fallaron: pudo llegar la clave después (chat compartido de nuevo).
    const pending = [...payloads].filter(([key]) => !get().texts[key]?.ok);
    if (pending.length === 0) return;
    const entries = await Promise.all(
      pending.map(async ([key, payload]): Promise<[string, DecryptedText]> => {
        try {
          return [key, { ok: true, text: await openText(conversation, payload) }];
        } catch {
          return [key, { ok: false }];
        }
      }),
    );
    const stickers: Record<string, StickerRef | null> = {};
    for (const entry of entries) {
      const [key, text] = entry;
      if (!stickerKeys.has(key) || !text.ok) continue;
      stickers[key] = decodeSticker(text.text);
      entry[1] = { ok: true, text: stickerLabel(stickers[key]) };
    }
    set({ texts: { ...get().texts, ...Object.fromEntries(entries) }, stickers: { ...get().stickers, ...stickers } });
  };

  const patchThread = (conversationId: string, patch: (thread: MessageThread) => MessageThread) => {
    const thread = get().threads[conversationId];
    if (!thread) return;
    set({ threads: { ...get().threads, [conversationId]: patch(thread) } });
  };

  /** Lleva el mensaje también al panel de su hilo, si está abierto. */
  const putInPanel = (message: ChatMessage) => {
    const panels = get().threadPanels;
    const rootId = message.replyTo?.id;
    if (rootId && panels[rootId]) {
      const panel = panels[rootId];
      const index = panel.replies.findIndex((m) => m.clientId === message.clientId);
      const replies = index === -1 ? [...panel.replies, message] : panel.replies.map((m, i) => (i === index ? { ...m, ...message } : m));
      set({ threadPanels: { ...panels, [rootId]: { ...panel, replies } } });
    } else if (panels[message.id]?.root) {
      set({ threadPanels: { ...panels, [message.id]: { ...panels[message.id], root: { ...panels[message.id].root!, ...message } } } });
    }
  };

  /** Inserta o reemplaza un mensaje en su hilo (por id o por clientId del envío optimista). */
  const putMessage = (message: ChatMessage) => {
    putInPanel(message);
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

  const deliver = async (conversationId: string, outgoing: SendMessageRequest, media?: OutgoingMedia, options?: SendOptions) => {
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
      set({ outbox: { ...get().outbox, [outgoing.clientId]: { conversationId, kind: outgoing.kind, media, options } } });
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
      replyTo: null,
      replyCount: 0,
      mentions: [],
      local: 'pending',
      ...extra,
    };
    putMessage(message);
    touchConversation(message, 0);
  };

  /** Cita del mensaje al que se responde, siempre apuntando a la raíz del hilo. */
  const replyReference = (conversationId: string, targetId: string | null): Message['replyTo'] => {
    if (!targetId) return null;
    const pool = [
      ...(get().threads[conversationId]?.items ?? []),
      ...Object.values(get().threadPanels).flatMap((p) => (p.root ? [p.root, ...p.replies] : p.replies)),
    ];
    const target = pool.find((m) => m.id === targetId);
    if (!target) return null;
    if (target.replyTo) return target.replyTo;
    return { id: target.id, senderId: target.senderId, kind: target.kind, body: target.body, clientId: target.clientId };
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
          replyToId: media.replyToId ?? null,
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

    loadConversations: async () => {
      if (get().listStatus !== 'ready') set({ listStatus: 'loading' });
      try {
        const list = await http.get<ConversationSummary[]>('/chats');
        set({ conversations: Object.fromEntries(list.map((c) => [c.id, c])), listStatus: 'ready' });
        await Promise.all(list.map((c) => decryptAll(c, c.lastMessage ? [c.lastMessage] : [])));
      } catch (error) {
        if (get().listStatus !== 'ready') set({ listStatus: 'error' });
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
      const before = get().conversations[conversation.id];
      // Me volvieron a compartir la clave (restablecí mi cuenta): se descifra de nuevo lo que estaba bloqueado.
      if (before && !before.myKey && conversation.myKey && get().activeId === conversation.id) {
        queueMicrotask(() => void get().loadMessages(conversation.id).catch(() => undefined));
      }
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
        // Se conservan los envíos propios pendientes y lo que llegó en tiempo real mientras cargaba la página.
        const newest = page.messages.at(-1)?.createdAt ?? '';
        const locals =
          current?.items.filter(
            (m) => !page.messages.some((p) => p.clientId === m.clientId) && (m.local || m.createdAt > newest),
          ) ?? [];
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
        if (!fetched) return 'background';
        conversation = fetched;
      }
      await decryptAll(conversation, [message]);
      const mine = message.senderId === get().myId && message.kind !== 'system';
      const isActive = get().activeId === message.conversationId && focused;
      putMessage(message);
      touchConversation(message, mine || isActive || message.kind === 'system' ? 0 : 1);
      const mentionsMe = !mine && !isActive && message.mentions.includes(get().myId ?? '');
      if (mentionsMe) {
        const current = get().conversations[message.conversationId];
        if (current) set({ conversations: { ...get().conversations, [current.id]: { ...current, mentionCount: current.mentionCount + 1 } } });
      }
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
      const panels = Object.fromEntries(
        Object.entries(get().threadPanels).map(([id, panel]) => [
          id,
          { ...panel, root: panel.root ? upgrade(panel.root) : null, replies: panel.replies.map(upgrade) },
        ]),
      );
      set({ threadPanels: panels });
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

    applyProfile: (user) => {
      const conversations = Object.fromEntries(
        Object.entries(get().conversations).map(([id, c]) => {
          if (!c.participants.some((p) => p.user.id === user.id)) return [id, c];
          const participants = c.participants.map((p) => (p.user.id === user.id ? { ...p, user: { ...user, presence: p.user.presence } } : p));
          const isOther = c.kind === 'direct' && user.id !== get().myId;
          return [id, { ...c, participants, ...(isOther ? { title: user.displayName, avatarUrl: user.avatarUrl, avatarColor: user.avatarColor, description: user.about } : {}) }];
        }),
      );
      set({ conversations });
    },

    reshareKey: async (conversationId, me) => {
      const conversation = get().conversations[conversationId];
      if (!conversation) return;
      const pending = conversation.participants.filter((p) => p.keyPending).map((p) => p.user);
      if (pending.length === 0) return;
      // La clave del chat se envuelve en este navegador con la clave pública nueva: el servidor no la ve.
      const keys = await wrapExistingKey(await conversationKey(conversation), me.id, pending);
      const updated = await http.post<ConversationSummary>(`/chats/${conversationId}/keys`, { keys });
      get().upsertConversation(updated);
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
      if (conversation?.unreadCount || conversation?.mentionCount) {
        set({ conversations: { ...get().conversations, [conversationId]: { ...conversation, unreadCount: 0, mentionCount: 0 } } });
      }
      await http.post(`/chats/${conversationId}/read`).catch(() => undefined);
    },

    sendText: async (conversationId, text, options = {}) => {
      const conversation = get().conversations[conversationId];
      const clean = text.trim();
      if (!conversation || !clean) return;
      const clientId = newClientId();
      set({ texts: { ...get().texts, [clientId]: { ok: true, text: clean } } });
      optimistic(conversationId, clientId, 'text', {
        replyTo: replyReference(conversationId, options.replyToId ?? null),
        mentions: options.mentions ?? [],
      });
      const body = await sealText(conversation, clean);
      await deliver(
        conversationId,
        { clientId, kind: 'text', body, media: null, replyToId: options.replyToId ?? null, mentions: options.mentions ?? [] },
        undefined,
        options,
      );
    },

    sendSticker: async (conversationId, sticker, options = {}) => {
      const conversation = get().conversations[conversationId];
      if (!conversation) return;
      const clientId = newClientId();
      set({
        texts: { ...get().texts, [clientId]: { ok: true, text: stickerLabel(sticker) } },
        stickers: { ...get().stickers, [clientId]: sticker },
      });
      optimistic(conversationId, clientId, 'sticker', { replyTo: replyReference(conversationId, options.replyToId ?? null) });
      const body = await sealText(conversation, encodeSticker(sticker));
      await deliver(conversationId, { clientId, kind: 'sticker', body, media: null, replyToId: options.replyToId ?? null }, undefined, options);
    },

    setReplyDraft: (conversationId, message) => set({ replyDraft: { ...get().replyDraft, [conversationId]: message } }),

    loadThread: async (conversationId, rootId) => {
      const conversation = get().conversations[conversationId];
      if (!conversation) return;
      if (!get().threadPanels[rootId]) {
        set({ threadPanels: { ...get().threadPanels, [rootId]: { status: 'loading', root: null, replies: [] } } });
      }
      try {
        const page = await http.get<ThreadPage>(`/chats/${conversationId}/messages/${rootId}/thread`);
        await decryptAll(conversation, [page.root, ...page.replies]);
        const current = get().threadPanels[rootId];
        const locals = current?.replies.filter((m) => m.local && !page.replies.some((r) => r.clientId === m.clientId)) ?? [];
        set({
          threadPanels: { ...get().threadPanels, [rootId]: { status: 'ready', root: page.root, replies: [...page.replies, ...locals] } },
        });
      } catch (error) {
        set({ threadPanels: { ...get().threadPanels, [rootId]: { status: 'error', root: null, replies: [] } } });
        throw error;
      }
    },

    applyReplies: ({ conversationId, messageId, replyCount }) => {
      const bump = <T extends Message>(m: T): T => (m.id === messageId ? { ...m, replyCount } : m);
      patchThread(conversationId, (thread) => ({ ...thread, items: thread.items.map(bump) }));
      const panel = get().threadPanels[messageId];
      if (panel?.root) set({ threadPanels: { ...get().threadPanels, [messageId]: { ...panel, root: bump(panel.root) } } });
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
      const sticker = get().stickers[clientId];
      if (!conversation || !text?.ok) return;
      const isSticker = pending.kind === 'sticker' && sticker;
      await deliver(pending.conversationId, {
        clientId,
        kind: isSticker ? 'sticker' : 'text',
        body: await sealText(conversation, isSticker ? encodeSticker(sticker) : text.text),
        media: null,
        replyToId: pending.options?.replyToId ?? null,
        mentions: pending.options?.mentions ?? [],
      }, undefined, pending.options);
    },

    emitTyping: (conversationId, isTyping) => {
      getSocket()?.emit('typing', { conversationId, isTyping });
    },

    startDirect: async (me, other) => {
      const existing = Object.values(get().conversations).find(
        (c) => c.kind === 'direct' && c.participants.some((p) => p.user.id === other.id),
      );
      if (existing) return existing;
      const keys = await createWrappedKeys(me, [other]);
      const conversation = await http.post<ConversationSummary>('/chats/direct', { userId: other.id, keys });
      get().upsertConversation(conversation);
      return conversation;
    },

    createGroup: async (me, title, members) => {
      const keys = await createWrappedKeys(me, members);
      const conversation = await http.post<ConversationSummary>('/chats/groups', {
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
