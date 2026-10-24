import { useEffect, useRef } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { countNewOrders, useBusinessStore } from '@shared/stores/business.store';
import { useChatStore } from '@shared/stores/chat.store';
import { useConversationMap } from '@shared/stores/chat.queries';
import { LANDING_KEY, useSessionStore } from '@shared/stores/session.store';
import { availableOrders, useDriverStore } from '@shared/stores/driver.store';
import { useOrdersStore } from '@shared/stores/orders.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { whenIdle } from '@shared/utils/idle';
import { queryClient } from '@shared/utils/query-client';
import { CATEGORIES_KEY, CATEGORIES_STALE_MS, fetchCategories } from '../../services/hooks/use-services.hook';
import { isFinalStatus } from '../../services/utils/services.utils';
import { sectionOf } from '../const/navigation.const';

/** Carga los chats y decide qué panel se ve en el celular (lista o pantalla abierta). */
export function useMainLayout() {
  const { conversationId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const loadConversations = useChatStore((s) => s.loadConversations);
  const totalUnread = Object.values(useConversationMap().conversations).reduce((sum, c) => sum + c.unreadCount, 0);
  const loadOrders = useOrdersStore((s) => s.loadOrders);
  const loadBusiness = useBusinessStore((s) => s.loadBusiness);
  const loadBusinessOrders = useBusinessStore((s) => s.loadOrders);
  /** El número sobre «Delivery»: mis pedidos en curso y, si tengo negocio, los nuevos por aceptar. */
  const activeOrders = useOrdersStore((s) => Object.values(s.orders).filter((o) => !isFinalStatus(o.status)).length);
  const newBusinessOrders = useBusinessStore((s) => countNewOrders(s.orders));
  const loadDriver = useDriverStore((s) => s.loadDriver);
  const loadDriverOrders = useDriverStore((s) => s.loadOrders);
  /** Para repartidores: pedidos listos para recoger. */
  const driverOffers = useDriverStore((s) => availableOrders(s.orders).length);

  useEffect(() => {
    loadConversations().catch((err) => toast(errorMessage(err), 'error'));
    void loadOrders().catch(() => undefined);
    // Soporte solo administra: no tiene tienda ni reparte, así que no se piden esos datos.
    if (useSessionStore.getState().user?.isAdmin) return;
    void loadBusiness()
      .then((business) => {
        // Recién entró y tiene tienda (p. ej. una ferretería): va directo a «Mi negocio» para ver pedidos y agregar productos.
        if (sessionStorage.getItem(LANDING_KEY) && business && window.location.pathname.replace(/\/$/, '') === '/app') navigateRef.current('/app/negocio', { replace: true });
        sessionStorage.removeItem(LANDING_KEY);
        return business && loadBusinessOrders();
      })
      .catch(() => undefined);
    void loadDriver()
      .then((driver) => driver && loadDriverOrders())
      .catch(() => undefined);
  }, [loadConversations, loadOrders, loadBusiness, loadBusinessOrders, loadDriver, loadDriverOrders]);

  // Con la app ya pintada, se bajan en segundo plano las pantallas que más se abren (Servicios, Ofertas, Pedidos, Ajustes).
  useEffect(() => {
    return whenIdle(() => {
      void import('../../services/components/ServicesHomeView');
      void import('../../services/components/OffersView');
      void import('../../services/components/OrdersView');
      void import('../../settings/components/SettingsView');
      // Y las categorías de Servicios, para que al abrirlo ya estén.
      void queryClient.prefetchQuery({ queryKey: CATEGORIES_KEY, queryFn: fetchCategories, staleTime: CATEGORIES_STALE_MS });
    }, 4000);
  }, []);

  const section = sectionOf(pathname);
  /** Pantallas de primer nivel: llevan la barra inferior en el celular. Las de detalle, no. */
  const topLevel = ['/app/servicios', '/app/ofertas', '/app/pedidos', '/app/negocio', '/app/rapidito', '/app/ajustes'].includes(pathname.replace(/\/$/, ''));

  return {
    section,
    totalUnread,
    activeOrders: activeOrders + newBusinessOrders + driverOffers,
    /** En el celular: la lista de chats ocupa la pantalla; al abrir algo, el panel ocupa el 100%. */
    showListOnMobile: section === 'chats' && !conversationId,
    showMobileNavInMain: topLevel,
  };
}
