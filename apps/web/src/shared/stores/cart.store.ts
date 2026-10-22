import type { DeliveryAddress, Product, ServiceId } from '@parla/types';
import { create } from 'zustand';

export interface CartItem {
  product: Product;
  quantity: number;
}

const ADDRESS_KEY = 'parla.deliveryAddress';
const MAX_QUANTITY = 50;

function savedAddress(): DeliveryAddress {
  try {
    const raw = localStorage.getItem(ADDRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<DeliveryAddress>) : {};
    return { line: parsed.line ?? '', reference: parsed.reference ?? '', location: parsed.location ?? null };
  } catch {
    return { line: '', reference: '', location: null };
  }
}

interface CartState {
  /** De qué servicio es el carrito: un pedido es de una sola tienda. */
  service: ServiceId;
  items: Record<string, CartItem>;
  address: DeliveryAddress;
  /** Suma o resta unidades; en 0 sale del carrito. Si es de otro servicio, empieza un carrito nuevo. */
  change: (product: Product, delta: number, service?: ServiceId) => void;
  remove: (productId: string) => void;
  setAddress: (address: DeliveryAddress) => void;
  /** Propina para el repartidor (se cobra con el pedido). */
  tipCents: number;
  setTip: (cents: number) => void;
  clear: () => void;
  /** «Volver a pedir»: el carrito queda con estos productos (hasta el stock de ahora). */
  refill: (lines: { product: Product; quantity: number }[], service?: ServiceId) => number;
}

/**
 * Carrito del Mercado. Los precios que guarda son solo para mostrar: el total que se cobra lo calcula
 * el gateway con los precios de la tienda.
 */
export const useCartStore = create<CartState>((set, get) => ({
  service: 'mercado',
  items: {},
  address: savedAddress(),

  change: (product, delta, service = 'mercado') => {
    // Otra tienda: el carrito anterior no se mezcla con este.
    const fresh = service !== get().service;
    const current = fresh ? 0 : (get().items[product.id]?.quantity ?? 0);
    const quantity = Math.min(MAX_QUANTITY, Math.min(product.stock, Math.max(0, current + delta)));
    const items = fresh ? {} : { ...get().items };
    if (quantity === 0) delete items[product.id];
    else items[product.id] = { product, quantity };
    set({ items, service, ...(fresh ? { tipCents: 0 } : {}) });
  },

  remove: (productId) => {
    const items = { ...get().items };
    delete items[productId];
    set({ items });
  },

  setAddress: (address) => {
    set({ address });
    try {
      localStorage.setItem(ADDRESS_KEY, JSON.stringify(address));
    } catch {
      // Sin almacenamiento (ventana privada): la dirección vale solo para esta visita.
    }
  },

  tipCents: 0,
  setTip: (cents) => set({ tipCents: Math.max(0, Math.min(10_000, Math.round(cents))) }),
  clear: () => set({ items: {}, tipCents: 0 }),
  refill: (lines, service = 'mercado') => {
    const items: Record<string, CartItem> = {};
    for (const { product, quantity } of lines) {
      const q = Math.min(MAX_QUANTITY, product.stock, quantity);
      if (q > 0) items[product.id] = { product, quantity: q };
    }
    set({ items, service });
    return Object.keys(items).length;
  },
}));

export function cartCount(items: Record<string, CartItem>): number {
  return Object.values(items).reduce((sum, item) => sum + item.quantity, 0);
}

/** Subtotal estimado con los precios que se vieron (el definitivo lo da la cotización). */
export function cartEstimateCents(items: Record<string, CartItem>): number {
  return Object.values(items).reduce((sum, item) => sum + item.product.priceCents * item.quantity, 0);
}
