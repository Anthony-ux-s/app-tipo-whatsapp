import type { Order } from '@parla/types';
import { create } from 'zustand';
import { http } from '../utils/http';

interface OrdersState {
  orders: Record<string, Order>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadOrders: () => Promise<void>;
  loadOrder: (id: string) => Promise<Order>;
  /** Pedido nuevo o actualizado (respuesta del gateway o evento order:updated en tiempo real). */
  upsert: (order: Order) => void;
  reset: () => void;
}

export const useOrdersStore = create<OrdersState>((set, get) => ({
  orders: {},
  status: 'idle',

  loadOrders: async () => {
    if (get().status !== 'ready') set({ status: 'loading' });
    try {
      const list = await http.get<Order[]>('/orders');
      set({ orders: { ...get().orders, ...Object.fromEntries(list.map((o) => [o.id, o])) }, status: 'ready' });
    } catch (error) {
      if (get().status !== 'ready') set({ status: 'error' });
      throw error;
    }
  },

  loadOrder: async (id) => {
    const order = await http.get<Order>(`/orders/${encodeURIComponent(id)}`);
    get().upsert(order);
    return order;
  },

  upsert: (order) => {
    const current = get().orders[order.id];
    // Un aviso viejo que llega tarde no pisa uno más nuevo.
    if (current && current.updatedAt > order.updatedAt) return;
    set({ orders: { ...get().orders, [order.id]: order } });
  },

  reset: () => set({ orders: {}, status: 'idle' }),
}));

/** Pedidos del más nuevo al más viejo. */
export function sortOrders(orders: Record<string, Order>): Order[] {
  return Object.values(orders).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
