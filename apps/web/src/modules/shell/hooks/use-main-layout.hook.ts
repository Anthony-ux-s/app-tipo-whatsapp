import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { sectionOf } from '../const/navigation.const';

/** Carga los chats y decide qué panel se ve en el celular (lista o pantalla abierta). */
export function useMainLayout() {
  const { conversationId } = useParams();
  const { pathname } = useLocation();
  const loadConversations = useChatStore((s) => s.loadConversations);
  const totalUnread = useChatStore((s) => Object.values(s.conversations).reduce((sum, c) => sum + c.unreadCount, 0));

  useEffect(() => {
    loadConversations().catch((err) => toast(errorMessage(err), 'error'));
  }, [loadConversations]);

  const section = sectionOf(pathname);
  /** Pantallas de primer nivel: llevan la barra inferior en el celular. Las de detalle, no. */
  const topLevel = ['/app/servicios', '/app/tareas', '/app/ajustes', '/app/pedidos'].includes(pathname.replace(/\/$/, ''));

  return {
    section,
    totalUnread,
    /** En el celular: la lista de chats ocupa la pantalla; al abrir algo, el panel ocupa el 100%. */
    showListOnMobile: section === 'chats' && !conversationId,
    showMobileNavInMain: topLevel,
  };
}
