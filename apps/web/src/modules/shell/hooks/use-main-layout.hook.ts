import { useEffect } from 'react';
import { useLocation, useParams } from 'react-router';
import { countNewOrders, useBusinessStore } from '@shared/stores/business.store';
import { useChatStore } from '@shared/stores/chat.store';
import { useOrdersStore } from '@shared/stores/orders.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { isFinalStatus } from '../../services/utils/services.utils';
import { sectionOf } from '../const/navigation.const';

/** Carga los chats y decide qué panel se ve en el celular (lista o pantalla abierta). */
export function useMainLayout() {
  const { conversationId } = useParams();
  const { pathname } = useLocation();
  const loadConversations = useChatStore((s) => s.loadConversations);
  const totalUnread = useChatStore((s) => Object.values(s.conversations).reduce((sum, c) => sum + c.unreadCount, 0));
  const loadOrders = useOrdersStore((s) => s.loadOrders);
  const loadBusiness = useBusinessStore((s) => s.loadBusiness);
  const loadBusinessOrders = useBusinessStore((s) => s.loadOrders);
  /** El número sobre «Delivery»: mis pedidos en curso y, si tengo negocio, los nuevos por aceptar. */
  const activeOrders = useOrdersStore((s) => Object.values(s.orders).filter((o) => !isFinalStatus(o.status)).length);
  const newBusinessOrders = useBusinessStore((s) => countNewOrders(s.orders));

  useEffect(() => {
    loadConversations().catch((err) => toast(errorMessage(err), 'error'));
    void loadOrders().catch(() => undefined);
    void loadBusiness()
      .then((business) => business && loadBusinessOrders())
      .catch(() => undefined);
  }, [loadConversations, loadOrders, loadBusiness, loadBusinessOrders]);

  const section = sectionOf(pathname);
  /** Pantallas de primer nivel: llevan la barra inferior en el celular. Las de detalle, no. */
  const topLevel = ['/app/servicios', '/app/ofertas', '/app/pedidos', '/app/negocio', '/app/ajustes'].includes(pathname.replace(/\/$/, ''));

  return {
    section,
    totalUnread,
    activeOrders: activeOrders + newBusinessOrders,
    /** En el celular: la lista de chats ocupa la pantalla; al abrir algo, el panel ocupa el 100%. */
    showListOnMobile: section === 'chats' && !conversationId,
    showMobileNavInMain: topLevel,
  };
}
