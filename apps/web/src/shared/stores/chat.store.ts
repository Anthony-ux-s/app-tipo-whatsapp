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
import { MutationObserver, type MutationObserverOptions } from '@tanstack/react-query';
import { create } from 'zustand';
import type { ChatMessage, DecryptedText, MessageThread } from '../types/chat.types';
import { createWrappedKeys, openText, sealFile, sealText, wrapExistingKey, conversationKey } from '../utils/crypto-vault';
import { http } from '../utils/http';
import { fetchQ, queryClient } from '../utils/query-client';
import { newClientId } from '../utils/ids';
import { getSocket } from '../utils/socket';
import { decodeSticker, encodeSticker, stickerLabel, type StickerRef } from '../utils/sticker-codec';

const TYPING_TTL = 5000;

type ConversationMap = Record<string, ConversationSummary>;

/**
 * Lo que viene del servidor vive en la caché de Query: la lista de chats y los mensajes de cada chat.
 * Esta caché se actualiza a mano con lo que llega por el socket y con los envíos optimistas.
 */
export const chatKeys = {
  list: ['chats', 'list'] as const,
  thread: (conversationId: string) => ['chats', 'thread', conversationId] as const,
  /** Respuestas de un hilo abierto en el panel lateral, por mensaje raíz. */
  panel: (rootId: string) => ['chats', 'panel', rootId] as const,
};
const NO_CONVERSATIONS: ConversationMap = {};
/** Las conversaciones de ahora mismo (para leer fuera de React: el socket y las acciones del store). */
export const getConversations = (): ConversationMap => queryClient.getQueryData<ConversationMap>(chatKeys.list) ?? NO_CONVERSATIONS;
const setConversations = (next: ConversationMap) => void queryClient.setQueryData(chatKeys.list, next);
const getThread = (conversationId: string) => queryClient.getQueryData<MessageThread>(chatKeys.thread(conversationId));
const setThread = (conversationId: string, thread: MessageThread) => void queryClient.setQueryData(chatKeys.thread(conversationId), thread);

const getPanel = (rootId: string) => queryClient.getQueryData<ThreadPanelState>(chatKeys.panel(rootId));
const setPanel = (rootId: string, panel: ThreadPanelState) => void queryClient.setQueryData(chatKeys.panel(rootId), panel);
/** Todos los hilos que hay en caché, con su mensaje raíz. */
const allPanels = (): [string, ThreadPanelState][] =>
  queryClient.getQueriesData<ThreadPanelState>({ queryKey: ['chats', 'panel'] }).flatMap(([key, panel]) => (panel ? [[key[2] as string, panel] as [string, ThreadPanelState]] : []));

// Sin comparar a fondo cada actualización (los hilos pueden tener cientos de mensajes), y sin perderlos si nadie mira.
queryClient.setQueryDefaults(['chats'], { structuralSharing: false, staleTime: Infinity, gcTime: 30 * 60_000, refetchOnWindowFocus: false });
const STATUS_RANK = { sent: 0, delivered: 1, read: 2 } as const;

/**
 * Un «entregado» o «leído» puede llegar antes que la respuesta del envío (el servidor lo marca apenas el otro lo recibe).
 * Se guarda aquí por id del mensaje y se aplica cuando llega el mensaje confirmado.
 */
const earlyStatus = new Map<string, keyof typeof STATUS_RANK>();

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
  texts: Record<string, DecryptedText>;
  /** Stickers descifrados, por clientId (en `texts` queda su etiqueta legible: «Sticker «¡Hola!»»). */
  stickers: Record<string, StickerRef | null>;
  typing: Record<string, Record<string, number>>;
  activeId: string | null;
  /** Retiene el último mensaje pendiente de enviar cuando falla, para reintentar. */
  outbox: Record<string, { conversationId: string; kind?: SendMessageRequest['kind']; media?: OutgoingMedia; options?: SendOptions }>;
  /** Mensaje al que se está respondiendo en cada conversación. */
  replyDraft: Record<string, ChatMessage | null>;

  setIdentity: (myId: string | null) => void;
  /** Pide la lista al servidor y la deja en la caché (la lee `useConversationMap`). */
  loadConversations: () => Promise<void>;
  fetchConversationList: () => Promise<ConversationMap>;
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


const initialState = {
  myId: null,
  texts: {},
  stickers: {},
  typing: {},
  activeId: null,
  outbox: {},
  replyDraft: {},
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
    const thread = getThread(conversationId);
    if (!thread) return;
    setThread(conversationId, patch(thread));
  };

  /** Lleva el mensaje también al panel de su hilo, si está abierto. */
  const putInPanel = (message: ChatMessage) => {
    const rootId = message.replyTo?.id;
    const panel = rootId ? getPanel(rootId) : undefined;
    if (rootId && panel) {
      const index = panel.replies.findIndex((m) => m.clientId === message.clientId);
      const replies = index === -1 ? [...panel.replies, message] : panel.replies.map((m, i) => (i === index ? { ...m, ...message } : m));
      setPanel(rootId, { ...panel, replies });
      return;
    }
    const own = getPanel(message.id);
    if (own?.root) setPanel(message.id, { ...own, root: { ...own.root, ...message } });
  };

  /** Inserta o reemplaza un mensaje en su hilo (por id o por clientId del envío optimista). */
  const putMessage = (incoming: ChatMessage) => {
    let message = incoming;
    const early = earlyStatus.get(message.id);
    if (early) {
      earlyStatus.delete(message.id);
      if (STATUS_RANK[early] > STATUS_RANK[message.status]) message = { ...message, status: early };
    }
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
    const conversation = getConversations()[message.conversationId];
    if (!conversation) return;
    const isNewer = !conversation.lastMessage || conversation.lastMessage.createdAt <= message.createdAt;
    setConversations({
      ...getConversations(),
      [conversation.id]: {
        ...conversation,
        lastMessage: isNewer ? message : conversation.lastMessage,
        updatedAt: isNewer ? message.createdAt : conversation.updatedAt,
        unreadCount: Math.max(0, conversation.unreadCount + unreadDelta),
      },
    });
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
    // Si el chat todavía está trayendo su historial, el mensaje propio se ve igual: el historial se junta con él al llegar.
    if (!getThread(conversationId)) setThread(conversationId, { items: [], nextCursor: null, status: 'loading', loadingOlder: false });
    putMessage(message);
    touchConversation(message, 0);
  };

  /** Cita del mensaje al que se responde, siempre apuntando a la raíz del hilo. */
  const replyReference = (conversationId: string, targetId: string | null): Message['replyTo'] => {
    if (!targetId) return null;
    const pool = [
      ...(getThread(conversationId)?.items ?? []),
      ...allPanels().flatMap(([, p]) => (p.root ? [p.root, ...p.replies] : p.replies)),
    ];
    const target = pool.find((m) => m.id === targetId);
    if (!target) return null;
    if (target.replyTo) return target.replyTo;
    return { id: target.id, senderId: target.senderId, kind: target.kind, body: target.body, clientId: target.clientId };
  };

  /** Un envío: lo que hace falta para armar el mensaje cifrado y mandarlo. */
  interface SendVars {
    conversationId: string;
    clientId: string;
    kind: 'text' | 'sticker' | 'media';
    text?: string;
    sticker?: StickerRef;
    media?: OutgoingMedia;
    options: SendOptions;
    /** Reintento de un mensaje que ya está en pantalla (no se crea otro). */
    resend: boolean;
  }

  /** Cifra en el navegador (y sube el archivo, si lo hay) y manda el mensaje al servidor. */
  const sendRequest = async (v: SendVars): Promise<Message> => {
    const conversation = getConversations()[v.conversationId];
    if (!conversation) throw new Error('La conversación ya no está disponible');
    let outgoing: SendMessageRequest;
    if (v.kind === 'media') {
      const media = v.media!;
      const sealed = await sealFile(conversation, await media.blob.arrayBuffer());
      const form = new FormData();
      form.append('file', new Blob([sealed.data], { type: 'application/octet-stream' }), 'cifrado.bin');
      const uploaded = await http.upload<UploadedFile>(`/chats/${v.conversationId}/media`, form);
      const caption = media.caption?.trim() ?? '';
      outgoing = {
        clientId: v.clientId,
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
      };
    } else if (v.kind === 'sticker') {
      outgoing = { clientId: v.clientId, kind: 'sticker', body: await sealText(conversation, encodeSticker(v.sticker!)), media: null, replyToId: v.options.replyToId ?? null };
    } else {
      outgoing = {
        clientId: v.clientId,
        kind: 'text',
        body: await sealText(conversation, v.text!),
        media: null,
        replyToId: v.options.replyToId ?? null,
        mentions: v.options.mentions ?? [],
      };
    }
    return http.post<Message>(`/chats/${v.conversationId}/messages`, outgoing);
  };

  const markSend = (v: SendVars, local: 'pending' | 'failed') =>
    patchThread(v.conversationId, (thread) => ({ ...thread, items: thread.items.map((m) => (m.clientId === v.clientId ? { ...m, local } : m)) }));

  /**
   * Enviar es una mutación de Query: el mensaje aparece al instante (optimista), se cifra y se manda; si el
   * servidor lo confirma se reemplaza por el real y, si falla, queda marcado para «Reintentar». Sin reintentos
   * automáticos: lo decide la persona.
   */
  const sendMutation: MutationObserverOptions<Message, Error, SendVars> = {
    mutationKey: ['chats', 'send'],
    retry: false,
    // Al terminar no se guarda nada (el archivo puede pesar): lo pendiente vive en `outbox`.
    gcTime: 0,
    mutationFn: sendRequest,
    onMutate: (v) => {
      if (v.resend) {
        markSend(v, 'pending');
        return;
      }
      if (v.kind === 'text') {
        set({ texts: { ...get().texts, [v.clientId]: { ok: true, text: v.text! } } });
        optimistic(v.conversationId, v.clientId, 'text', {
          replyTo: replyReference(v.conversationId, v.options.replyToId ?? null),
          mentions: v.options.mentions ?? [],
        });
      } else if (v.kind === 'sticker') {
        set({
          texts: { ...get().texts, [v.clientId]: { ok: true, text: stickerLabel(v.sticker!) } },
          stickers: { ...get().stickers, [v.clientId]: v.sticker! },
        });
        optimistic(v.conversationId, v.clientId, 'sticker', { replyTo: replyReference(v.conversationId, v.options.replyToId ?? null) });
      } else {
        const media = v.media!;
        const caption = media.caption?.trim();
        if (caption) set({ texts: { ...get().texts, [v.clientId]: { ok: true, text: caption } } });
        optimistic(v.conversationId, v.clientId, media.kind, {
          localPreviewUrl: URL.createObjectURL(media.blob),
          media: { fileId: '', mimeType: media.mimeType, size: media.blob.size, iv: '', durationMs: media.durationMs },
        });
      }
    },
    onSuccess: (saved, v) => {
      putMessage(saved);
      touchConversation(saved, 0);
      const { [v.clientId]: _sent, ...outbox } = get().outbox;
      set({ outbox });
    },
    onError: (_error, v) => {
      markSend(v, 'failed');
      set({
        outbox: {
          ...get().outbox,
          [v.clientId]: { conversationId: v.conversationId, kind: v.kind === 'media' ? v.media!.kind : v.kind, media: v.media, options: v.options },
        },
      });
    },
  };
  const send = async (vars: SendVars): Promise<void> => {
    await new MutationObserver<Message, Error, SendVars>(queryClient, sendMutation).mutate(vars);
  };

  return {
    ...initialState,

    setIdentity: (myId) => set({ myId }),

    fetchConversationList: async () => {
      const list = await http.get<ConversationSummary[]>('/chats');
      // El texto de la última línea de cada chat se descifra por detrás; la lista aparece sin esperar.
      void Promise.all(list.map((c) => decryptAll(c, c.lastMessage ? [c.lastMessage] : []))).catch(() => undefined);
      return Object.fromEntries(list.map((c) => [c.id, c]));
    },

    loadConversations: async () => {
      await queryClient.fetchQuery({ queryKey: chatKeys.list, queryFn: get().fetchConversationList, staleTime: 0 });
    },

    fetchConversation: async (conversationId) => {
      try {
        const conversation = await fetchQ<ConversationSummary>(['chats', 'one', conversationId], `/chats/${conversationId}`);
        get().upsertConversation(conversation);
        return conversation;
      } catch {
        return null;
      }
    },

    upsertConversation: (conversation) => {
      const before = getConversations()[conversation.id];
      // Me volvieron a compartir la clave (restablecí mi cuenta): se descifra de nuevo lo que estaba bloqueado.
      if (before && !before.myKey && conversation.myKey && get().activeId === conversation.id) {
        queueMicrotask(() => void get().loadMessages(conversation.id).catch(() => undefined));
      }
      setConversations({ ...getConversations(), [conversation.id]: conversation });
      if (conversation.lastMessage) void decryptAll(conversation, [conversation.lastMessage]);
    },

    setActive: (activeId) => set({ activeId }),

    loadMessages: async (conversationId) => {
      const conversation = getConversations()[conversationId];
      if (!conversation) return;
      await queryClient.fetchQuery({
        queryKey: chatKeys.thread(conversationId),
        staleTime: 0,
        queryFn: async (): Promise<MessageThread> => {
          const page = await http.get<MessagePage>(`/chats/${conversationId}/messages`);
          await decryptAll(conversation, page.messages);
          const current = getThread(conversationId);
          // Se conservan los envíos propios pendientes y lo que llegó en tiempo real mientras cargaba la página.
          const newest = page.messages.at(-1)?.createdAt ?? '';
          const locals =
            current?.items.filter(
              (m) => !page.messages.some((p) => p.clientId === m.clientId) && (m.local || m.createdAt > newest),
            ) ?? [];
          return { items: [...page.messages, ...locals], nextCursor: page.nextCursor, status: 'ready', loadingOlder: false };
        },
      });
    },

    loadOlder: async (conversationId) => {
      const thread = getThread(conversationId);
      const conversation = getConversations()[conversationId];
      if (!thread?.nextCursor || thread.loadingOlder || !conversation) return;
      patchThread(conversationId, (t) => ({ ...t, loadingOlder: true }));
      try {
        const page = await fetchQ<MessagePage>(['chats', 'messages', conversationId, 'before', thread.nextCursor], `/chats/${conversationId}/messages?before=${thread.nextCursor}`);
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
      let conversation = getConversations()[message.conversationId];
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
        const current = getConversations()[message.conversationId];
        if (current) setConversations({ ...getConversations(), [current.id]: { ...current, mentionCount: current.mentionCount + 1 } });
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
      // Los que todavía no están en pantalla (su respuesta de envío no llegó) quedan anotados para cuando lleguen.
      const known = new Set(getThread(conversationId)?.items.map((m) => m.id));
      for (const id of messageIds) {
        if (known.has(id)) continue;
        earlyStatus.set(id, status);
        // Solo los más recientes: lo de chats que ni se abrieron no se acumula.
        if (earlyStatus.size > 300) earlyStatus.delete(earlyStatus.keys().next().value as string);
      }
      const upgrade = <T extends Message>(m: T): T =>
        ids.has(m.id) && STATUS_RANK[status] > STATUS_RANK[m.status] ? { ...m, status } : m;
      patchThread(conversationId, (thread) => ({ ...thread, items: thread.items.map(upgrade) }));
      for (const [id, panel] of allPanels()) {
        setPanel(id, { ...panel, root: panel.root ? upgrade(panel.root) : null, replies: panel.replies.map(upgrade) });
      }
      const conversation = getConversations()[conversationId];
      if (conversation?.lastMessage && ids.has(conversation.lastMessage.id)) {
        setConversations({ ...getConversations(), [conversationId]: { ...conversation, lastMessage: upgrade(conversation.lastMessage) } });
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
        Object.entries(getConversations()).map(([id, c]) => {
          if (!c.participants.some((p) => p.user.id === user.id)) return [id, c];
          const participants = c.participants.map((p) => (p.user.id === user.id ? { ...p, user: { ...user, presence: p.user.presence } } : p));
          const isOther = c.kind === 'direct' && user.id !== get().myId;
          return [id, { ...c, participants, ...(isOther ? { title: user.displayName, avatarUrl: user.avatarUrl, avatarColor: user.avatarColor, description: user.about } : {}) }];
        }),
      );
      setConversations(conversations);
    },

    reshareKey: async (conversationId, me) => {
      const conversation = getConversations()[conversationId];
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
        Object.entries(getConversations()).map(([id, c]) => [
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
      setConversations(conversations);
    },

    markRead: async (conversationId) => {
      const conversation = getConversations()[conversationId];
      if (conversation?.unreadCount || conversation?.mentionCount) {
        setConversations({ ...getConversations(), [conversationId]: { ...conversation, unreadCount: 0, mentionCount: 0 } });
      }
      await http.post(`/chats/${conversationId}/read`).catch(() => undefined);
    },

    sendText: async (conversationId, text, options = {}) => {
      const clean = text.trim();
      if (!getConversations()[conversationId] || !clean) return;
      await send({ conversationId, clientId: newClientId(), kind: 'text', text: clean, options, resend: false });
    },

    sendSticker: async (conversationId, sticker, options = {}) => {
      if (!getConversations()[conversationId]) return;
      await send({ conversationId, clientId: newClientId(), kind: 'sticker', sticker, options, resend: false });
    },

    setReplyDraft: (conversationId, message) => set({ replyDraft: { ...get().replyDraft, [conversationId]: message } }),

    loadThread: async (conversationId, rootId) => {
      const conversation = getConversations()[conversationId];
      if (!conversation) return;
      await queryClient.fetchQuery({
        queryKey: chatKeys.panel(rootId),
        staleTime: 0,
        queryFn: async (): Promise<ThreadPanelState> => {
          const page = await http.get<ThreadPage>(`/chats/${conversationId}/messages/${rootId}/thread`);
          await decryptAll(conversation, [page.root, ...page.replies]);
          const locals = getPanel(rootId)?.replies.filter((m) => m.local && !page.replies.some((r) => r.clientId === m.clientId)) ?? [];
          return { status: 'ready', root: page.root, replies: [...page.replies, ...locals] };
        },
      });
    },

    applyReplies: ({ conversationId, messageId, replyCount }) => {
      const bump = <T extends Message>(m: T): T => (m.id === messageId ? { ...m, replyCount } : m);
      patchThread(conversationId, (thread) => ({ ...thread, items: thread.items.map(bump) }));
      const panel = getPanel(messageId);
      if (panel?.root) setPanel(messageId, { ...panel, root: bump(panel.root) });
    },

    sendMedia: async (conversationId, media) => {
      if (!getConversations()[conversationId]) return;
      await send({ conversationId, clientId: newClientId(), kind: 'media', media, options: {}, resend: false });
    },

    retry: async (clientId) => {
      const pending = get().outbox[clientId];
      if (!pending) return;
      const { conversationId, media, options = {} } = pending;
      if (media) {
        await send({ conversationId, clientId, kind: 'media', media, options, resend: true });
        return;
      }
      const text = get().texts[clientId];
      const sticker = get().stickers[clientId];
      if (!getConversations()[conversationId] || !text?.ok) return;
      if (pending.kind === 'sticker' && sticker) await send({ conversationId, clientId, kind: 'sticker', sticker, options, resend: true });
      else await send({ conversationId, clientId, kind: 'text', text: text.text, options, resend: true });
    },

    emitTyping: (conversationId, isTyping) => {
      getSocket()?.emit('typing', { conversationId, isTyping });
    },

    startDirect: async (me, other) => {
      const existing = Object.values(getConversations()).find(
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
      const conversation = getConversations()[conversationId];
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
      const { [conversationId]: _left, ...conversations } = getConversations();
      setConversations(conversations);
      set({ activeId: get().activeId === conversationId ? null : get().activeId });
    },

    reset: () => {
      // Sin tocar lo que se está pidiendo ahora mismo (al entrar, la lista ya va en camino cuando se reinicia el store).
      queryClient.removeQueries({ queryKey: ['chats'], predicate: (query) => query.state.fetchStatus === 'idle' });
      set({ ...initialState });
    },
  };
});

/** Conversaciones ordenadas por última actividad. */
export function sortConversations(conversations: Record<string, ConversationSummary>): ConversationSummary[] {
  return Object.values(conversations).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}
