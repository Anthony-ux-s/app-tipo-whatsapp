import type { DriverInfo, DriverOrder, DriverOrders } from '@parla/types';
import { create } from 'zustand';
import { http } from '../utils/http';

interface DriverState {
  /** undefined = aún no se sabe; null = la persona no reparte para Rapidito. */
  driver: DriverInfo | null | undefined;
  orders: Record<string, DriverOrder>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  loadDriver: () => Promise<DriverInfo | null>;
  loadOrders: () => Promise<void>;
  loadOrder: (id: string) => Promise<DriverOrder>;
  /** Oferta nueva o cambio en una entrega (respuesta de una acción o evento driver-order:updated). */
  upsert: (order: DriverOrder) => void;
  accept: (id: string) => Promise<void>;
  /** «No puedo llevarlo»: lo suelta antes de recogerlo. */
  release: (id: string) => Promise<void>;
  /** Entrega con el código que dicta el cliente. */
  deliver: (id: string, code: string) => Promise<void>;
  reset: () => void;
}

const path = (id: string) => `/driver/orders/${encodeURIComponent(id)}`;

/** Rapidito para repartidores: las ofertas para recoger y las entregas propias. */
export const useDriverStore = create<DriverState>((set, get) => ({
  driver: undefined,
  orders: {},
  status: 'idle',

  loadDriver: async () => {
    const { driver } = await http.get<{ driver: DriverInfo | null }>('/driver');
    set({ driver });
    return driver;
  },

  loadOrders: async () => {
    if (get().status !== 'ready') set({ status: 'loading' });
    try {
      const { available, mine } = await http.get<DriverOrders>('/driver/orders');
      // La lista del servidor manda: una oferta que otro tomó ya no viene.
      set({ orders: Object.fromEntries([...available, ...mine].map((o) => [o.id, o])), status: 'ready' });
    } catch (error) {
      if (get().status !== 'ready') set({ status: 'error' });
      throw error;
    }
  },

  loadOrder: async (id) => {
    const order = await http.get<DriverOrder>(path(id));
    get().upsert(order);
    return order;
  },

  upsert: (order) => {
    const current = get().orders[order.id];
    // Un aviso viejo que llega tarde no pisa uno más nuevo.
    if (current && current.updatedAt > order.updatedAt) return;
    const orders = { ...get().orders };
    // Si otro repartidor lo tomó, deja de ser una oferta para mí.
    if (!order.mine && order.status !== 'searching_driver') delete orders[order.id];
    else orders[order.id] = order;
    set({ orders });
  },

  accept: async (id) => get().upsert(await http.post<DriverOrder>(`${path(id)}/accept`)),
  release: async (id) => get().upsert(await http.post<DriverOrder>(`${path(id)}/release`)),
  deliver: async (id, code) => get().upsert(await http.post<DriverOrder>(`${path(id)}/deliver`, { code })),

  reset: () => set({ driver: undefined, orders: {}, status: 'idle' }),
}));

/** Ofertas para recoger (sin repartidor), de la más antigua a la más nueva. */
export function availableOrders(orders: Record<string, DriverOrder>): DriverOrder[] {
  return Object.values(orders)
    .filter((o) => !o.mine && o.status === 'searching_driver')
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt));
}

/** Entregas del repartidor, la más reciente primero. */
export function myOrders(orders: Record<string, DriverOrder>): DriverOrder[] {
  return Object.values(orders)
    .filter((o) => o.mine)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
