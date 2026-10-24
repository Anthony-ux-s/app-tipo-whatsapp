import type { DeliverOrderRequest, DriverEarnings, DriverInfo, DriverOrder, DriverOrders, DriverProfileRequest, DriverWallet, GeoPoint, PayoutResult } from '@parla/types';
import { create } from 'zustand';
import { http } from '../utils/http';
import { fetchQ } from '../utils/query-client';

interface DriverState {
  /** undefined = aún no se sabe; null = la persona no reparte para Rapidito. */
  driver: DriverInfo | null | undefined;
  orders: Record<string, DriverOrder>;
  status: 'idle' | 'loading' | 'ready' | 'error';
  earnings: DriverEarnings | null;
  wallet: DriverWallet | null;
  /** Compartir ubicación mientras reparte: apagado, compartiendo o sin permiso del navegador. */
  sharing: 'off' | 'sharing' | 'denied' | 'unavailable';
  /** Última ubicación propia (para el mapa del repartidor). */
  myLocation: GeoPoint | null;
  loadDriver: () => Promise<DriverInfo | null>;
  /** «Trabaja con Rapidito»: alta (o vuelta) como repartidor. */
  register: (profile: DriverProfileRequest) => Promise<void>;
  updateProfile: (profile: DriverProfileRequest) => Promise<void>;
  /** La foto del DNI o la licencia para la verificación (subida antes con POST /photos). */
  setDocument: (photoId: string) => Promise<void>;
  setOnline: (online: boolean) => Promise<void>;
  /** «Dejar de repartir». */
  leave: () => Promise<void>;
  loadEarnings: () => Promise<void>;
  loadWallet: () => Promise<void>;
  setPayoutPhone: (phone: string) => Promise<void>;
  /** «Retirar ahora»: el gateway transfiere todo el saldo a su PagaYa. */
  withdraw: () => Promise<PayoutResult>;
  setSharing: (sharing: DriverState['sharing'], at?: GeoPoint) => void;
  loadOrders: () => Promise<void>;
  loadOrder: (id: string) => Promise<DriverOrder>;
  /** Oferta nueva o cambio en una entrega (respuesta de una acción o evento driver-order:updated). */
  upsert: (order: DriverOrder) => void;
  accept: (id: string) => Promise<void>;
  /** «No puedo llevarlo»: lo suelta antes de recogerlo. */
  release: (id: string) => Promise<void>;
  /** Entrega con el código que dicta el cliente o, si no responde, con una foto como prueba. */
  deliver: (id: string, proof: DeliverOrderRequest) => Promise<void>;
  reset: () => void;
}

const path = (id: string) => `/driver/orders/${encodeURIComponent(id)}`;

/** Rapidito para repartidores: las ofertas para recoger y las entregas propias. */
export const useDriverStore = create<DriverState>((set, get) => ({
  driver: undefined,
  orders: {},
  status: 'idle',
  earnings: null,
  wallet: null,
  sharing: 'off',
  myLocation: null,

  loadDriver: async () => {
    const { driver } = await fetchQ<{ driver: DriverInfo | null }>(['driver', 'me'], '/driver');
    set({ driver });
    return driver;
  },

  loadOrders: async () => {
    if (get().status !== 'ready') set({ status: 'loading' });
    try {
      const { available, mine } = await fetchQ<DriverOrders>(['driver', 'orders'], '/driver/orders');
      // La lista del servidor manda: una oferta que otro tomó ya no viene.
      set({ orders: Object.fromEntries([...available, ...mine].map((o) => [o.id, o])), status: 'ready' });
    } catch (error) {
      if (get().status !== 'ready') set({ status: 'error' });
      throw error;
    }
  },

  loadOrder: async (id) => {
    const order = await fetchQ<DriverOrder>(['driver', 'order', id], path(id));
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

  register: async (profile) => {
    set({ driver: await http.post<DriverInfo>('/driver', profile) });
    await get().loadOrders();
  },
  updateProfile: async (profile) => set({ driver: await http.patch<DriverInfo>('/driver', profile) }),
  setDocument: async (photoId) => set({ driver: await http.post<DriverInfo>('/driver/document', { photoId }) }),
  setOnline: async (online) => {
    set({ driver: await http.post<DriverInfo>('/driver/online', { online }) });
    if (online) await get().loadOrders();
  },
  leave: async () => {
    await http.delete('/driver');
    set({ driver: null, orders: {}, status: 'idle', earnings: null });
  },
  loadEarnings: async () => set({ earnings: await fetchQ<DriverEarnings>(['driver', 'earnings'], '/driver/earnings') }),
  loadWallet: async () => set({ wallet: await fetchQ<DriverWallet>(['driver', 'wallet'], '/driver/wallet') }),
  setPayoutPhone: async (phone) => {
    await http.patch('/driver/payout-account', { phone });
    await get().loadWallet();
  },
  withdraw: async () => {
    try {
      return await http.post<PayoutResult>('/driver/payouts');
    } finally {
      await get().loadWallet();
    }
  },
  setSharing: (sharing, at) => set({ sharing, ...(at ? { myLocation: at } : {}) }),

  accept: async (id) => get().upsert(await http.post<DriverOrder>(`${path(id)}/accept`)),
  release: async (id) => get().upsert(await http.post<DriverOrder>(`${path(id)}/release`)),
  deliver: async (id, proof) => get().upsert(await http.post<DriverOrder>(`${path(id)}/deliver`, proof)),

  reset: () => set({ driver: undefined, orders: {}, status: 'idle', earnings: null, wallet: null, sharing: 'off', myLocation: null }),
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

/** La entrega en curso del repartidor (tomada y sin entregar), si tiene. */
export function activeDelivery(orders: Record<string, DriverOrder>): DriverOrder | null {
  return Object.values(orders).find((o) => o.mine && (o.status === 'driver_assigned' || o.status === 'on_the_way')) ?? null;
}
