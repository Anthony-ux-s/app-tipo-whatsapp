import type { ConversationSummary } from '@parla/types';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useThreadPanelData } from '@shared/stores/chat.queries';
import { useChatStore } from '@shared/stores/chat.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { pluralize } from '@shared/utils/text';

/** Hilo de respuestas de un mensaje, en el panel lateral. */
export function useThreadPanel(conversation: ConversationSummary, rootId: string) {
  const panel = useThreadPanelData(rootId);
  const texts = useChatStore((s) => s.texts);
  const loadThread = useChatStore((s) => s.loadThread);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadThread(conversation.id, rootId).catch((err) => toast(errorMessage(err), 'error'));
  }, [conversation.id, rootId, loadThread]);

  const count = panel.replies.length;
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  return {
    status: panel.status,
    root: panel.root,
    replies: panel.replies,
    texts,
    scrollRef,
    countLabel: count ? pluralize(count, 'respuesta', 'respuestas') : 'Sin respuestas todavía',
    retry: () => loadThread(conversation.id, rootId).catch((err) => toast(errorMessage(err), 'error')),
  };
}
