import type { BusinessInfo, BusinessOrder, Order } from '@parla/types';
import { create } from 'zustand';
import { http } from '../utils/http';

interface BusinessState {
  /** undefined = aún no se sabe; null = la persona no es dueña de ningún negocio. */
  business: BusinessInfo | null | undefined;
  orders: Record<string, BusinessOrder>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadBusiness: () => Promise<BusinessInfo | null>;
  loadOrders: () => Promise<void>;
  loadOrder: (id: string) => Promise<BusinessOrder>;
  /** Pedido nuevo o actualizado (respuesta de una acción o evento business-order:updated). */
  upsert: (order: BusinessOrder) => void;
  accept: (id: string) => Promise<void>;
  reject: (id: string) => Promise<void>;
  /** Listo para recoger: el gateway despacha el motorizado de Rapidito. */
  ready: (id: string) => Promise<void>;
  reset: () => void;
}

const path = (id: string) => `/business/orders/${encodeURIComponent(id)}`;

/** «Mi negocio»: los pedidos que recibe el dueño y lo que hace con ellos. */
export const useBusinessStore = create<BusinessState>((set, get) => ({
  business: undefined,
  orders: {},
  status: 'idle',

  loadBusiness: async () => {
    const { business } = await http.get<{ business: BusinessInfo | null }>('/business');
    set({ business });
    return business;
  },

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
  reject: async (id) => get().upsert(await http.post<BusinessOrder>(`${path(id)}/reject`)),

  ready: async (id) => {
    // El gateway responde el pedido público; se vuelve a leer para tener el del negocio completo.
    await http.post<Order>(`${path(id)}/ready`);
    await get().loadOrder(id);
  },

  reset: () => set({ business: undefined, orders: {}, status: 'idle' }),
}));

/** Pedidos del más nuevo al más viejo. */
export function sortBusinessOrders(orders: Record<string, BusinessOrder>): BusinessOrder[] {
  return Object.values(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Pedidos pagados que esperan que el dueño los acepte. */
export function countNewOrders(orders: Record<string, BusinessOrder>): number {
  return Object.values(orders).filter((o) => o.status === 'paid').length;
}
