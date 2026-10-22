import type { BusinessInfo, BusinessOrder, BusinessStatus, DriverLocation, Order, RegisterStoreRequest, UpdateBusinessRequest } from '@parla/types';
import { create } from 'zustand';
import { http } from '../utils/http';

interface BusinessState {
  /** undefined = aún no se sabe; null = la persona no es dueña de ningún negocio. */
  business: BusinessInfo | null | undefined;
  orders: Record<string, BusinessOrder>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** Si recibe pedidos ahora (horario y pausa), como lo ve el cliente. */
  storeStatus: BusinessStatus | null;
  loadBusiness: () => Promise<BusinessInfo | null>;
  loadStoreStatus: () => Promise<void>;
  /** Pausar o reanudar los pedidos y cambiar el horario. */
  updateBusiness: (changes: UpdateBusinessRequest) => Promise<void>;
  /** Registra la tienda de la persona; queda «en revisión» hasta que soporte la apruebe. */
  registerStore: (request: RegisterStoreRequest) => Promise<BusinessInfo>;
  /** Cambia el origen del catálogo u otros datos ya guardados en el servidor (p. ej. tras conectar su API). */
  setBusiness: (business: BusinessInfo) => void;
  loadOrders: () => Promise<void>;
  loadOrder: (id: string) => Promise<BusinessOrder>;
  /** Pedido nuevo o actualizado (respuesta de una acción o evento business-order:updated). */
  upsert: (order: BusinessOrder) => void;
  accept: (id: string) => Promise<void>;
  /** Rechaza un pedido pagado; la billetera devuelve el pago. */
  reject: (id: string) => Promise<void>;
  /** Cancela un pedido ya aceptado; la billetera devuelve el pago. */
  cancel: (id: string) => Promise<void>;
  /** El repartidor asignado no llega: se ofrece a otro. */
  reassign: (id: string) => Promise<void>;
  /** Listo para recoger: se ofrece a los repartidores de Rapidito. */
  ready: (id: string) => Promise<void>;
  /** La tienda le entregó el pedido al repartidor. */
  handoff: (id: string) => Promise<void>;
  /** El repartidor se movió (evento delivery:location). */
  applyLocation: (location: DriverLocation) => void;
  reset: () => void;
}

const path = (id: string) => `/business/orders/${encodeURIComponent(id)}`;

/** «Mi negocio»: los pedidos que recibe el dueño y lo que hace con ellos. */
export const useBusinessStore = create<BusinessState>((set, get) => ({
  business: undefined,
  orders: {},
  status: 'idle',
  storeStatus: null,

  loadBusiness: async () => {
    const { business } = await http.get<{ business: BusinessInfo | null }>('/business');
    set({ business });
    return business;
  },

  loadStoreStatus: async () => {
    const storeId = get().business?.id;
    if (!storeId) return;
    const { status } = await http.get<{ status: BusinessStatus | null }>(`/business/status/${encodeURIComponent(storeId)}`);
    set({ storeStatus: status });
  },

  updateBusiness: async (changes) => {
    set({ business: await http.patch<BusinessInfo>('/business', changes) });
    await get().loadStoreStatus();
  },

  registerStore: async (request) => {
    const business = await http.post<BusinessInfo>('/stores', request);
    set({ business });
    return business;
  },

  setBusiness: (business) => set({ business }),

  loadOrders: async () => {
    if (get().status !== 'ready') set({ status: 'loading' });
    try {
      const list = await http.get<BusinessOrder[]>('/business/orders');
      set({ orders: { ...get().orders, ...Object.fromEntries(list.map((o) => [o.id, o])) }, status: 'ready' });
    } catch (error) {
      if (get().status !== 'ready') set({ status: 'error' });
      throw error;
    }
  },

  loadOrder: async (id) => {
    const order = await http.get<BusinessOrder>(path(id));
    get().upsert(order);
    return order;
  },

  upsert: (order) => {
    const current = get().orders[order.id];
    // Un aviso viejo que llega tarde no pisa uno más nuevo.
    if (current && current.updatedAt > order.updatedAt) return;
    set({ orders: { ...get().orders, [order.id]: order } });
  },

  accept: async (id) => get().upsert(await http.post<BusinessOrder>(`${path(id)}/accept`)),
  // Rechazar y cancelar pasan por el gateway (devuelven el pago) y responden el pedido público:
  // se vuelve a leer la vista del negocio.
  reject: async (id) => {
    await http.post<Order>(`${path(id)}/reject`);
    await get().loadOrder(id);
  },
  cancel: async (id) => {
    await http.post<Order>(`${path(id)}/cancel`);
    await get().loadOrder(id);
  },
  reassign: async (id) => get().upsert(await http.post<BusinessOrder>(`${path(id)}/reassign`)),

  ready: async (id) => get().upsert(await http.post<BusinessOrder>(`${path(id)}/ready`)),
  handoff: async (id) => get().upsert(await http.post<BusinessOrder>(`${path(id)}/handoff`)),

  applyLocation: (location) => {
    const order = get().orders[location.orderId];
    if (order) set({ orders: { ...get().orders, [order.id]: { ...order, driverLocation: location } } });
  },

  reset: () => set({ business: undefined, orders: {}, status: 'idle', storeStatus: null }),
}));

/** Pedidos del más nuevo al más viejo. */
export function sortBusinessOrders(orders: Record<string, BusinessOrder>): BusinessOrder[] {
  return Object.values(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Pedidos pagados que esperan que el dueño los acepte. */
export function countNewOrders(orders: Record<string, BusinessOrder>): number {
  return Object.values(orders).filter((o) => o.status === 'paid').length;
}
