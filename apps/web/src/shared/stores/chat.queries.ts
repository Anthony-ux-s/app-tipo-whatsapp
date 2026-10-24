import type { ConversationSummary } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import type { MessageThread } from '../types/chat.types';
import { chatKeys, useChatStore, type ThreadPanelState } from './chat.store';

const NO_CONVERSATIONS: Record<string, ConversationSummary> = {};
const LOADING_THREAD: MessageThread = { items: [], nextCursor: null, status: 'loading', loadingOlder: false };
const FAILED_THREAD: MessageThread = { ...LOADING_THREAD, status: 'error' };
const LOADING_PANEL: ThreadPanelState = { status: 'loading', root: null, replies: [] };
const FAILED_PANEL: ThreadPanelState = { status: 'error', root: null, replies: [] };

/** Estado de la lista para la pantalla: cargando la primera vez, lista o con error (sin datos que mostrar). */
export type ListStatus = 'loading' | 'ready' | 'error';

/** Todas las conversaciones por id. Una sola petición aunque varias pantallas la pidan; el socket la mantiene al día. */
export function useConversationMap() {
  const query = useQuery({ queryKey: chatKeys.list, queryFn: () => useChatStore.getState().fetchConversationList() });
  const status: ListStatus = query.data ? 'ready' : query.isError ? 'error' : 'loading';
  return { conversations: query.data ?? NO_CONVERSATIONS, status };
}

/** Una conversación; solo se vuelve a pintar cuando cambia ella. */
export function useConversationById(conversationId: string) {
  return useQuery({
    queryKey: chatKeys.list,
    queryFn: () => useChatStore.getState().fetchConversationList(),
    select: (map) => map[conversationId],
  }).data;
}

/** Mensajes de una conversación (los trae `loadMessages`; aquí solo se lee la caché). */
export function useThread(conversationId: string): MessageThread {
  const query = useQuery({ queryKey: chatKeys.thread(conversationId), queryFn: () => LOADING_THREAD, enabled: false });
  return query.data ?? (query.isError ? FAILED_THREAD : LOADING_THREAD);
}

/** Respuestas de un hilo abierto en el panel lateral (las trae `loadThread`; aquí solo se lee la caché). */
export function useThreadPanelData(rootId: string): ThreadPanelState {
  const query = useQuery({ queryKey: chatKeys.panel(rootId), queryFn: () => LOADING_PANEL, enabled: false });
  return query.data ?? (query.isError ? FAILED_PANEL : LOADING_PANEL);
}
