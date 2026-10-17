import type {
  Currency,
  DeliveryAddress,
  OrderBusiness,
  OrderDelivery,
  OrderLine,
  OrderPayment,
  OrderStatus,
  OrderTimelineEntry,
  ServiceId,
} from '@parla/types';

/** Pedido tal como lo ven los casos de uso (sin tipos de Prisma). */
export interface OrderRecord {
  id: string;
  userId: string;
  service: ServiceId;
  /** Negocio que prepara el pedido (con su dueño y dirección); null en pedidos sin negocio. */
  business: OrderBusiness | null;
  status: OrderStatus;
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: Currency;
  address: DeliveryAddress;
  payment: OrderPayment;
  deliveryQuoteId: string;
  /** Minutos que Rapidito estimó para el envío. */
  etaMinutes: number;
  delivery: OrderDelivery | null;
  /** Repartidor de Rapidito que lo tomó; null mientras nadie lo toma. */
  driverId: string | null;
  /** Código de entrega: solo lo ve el cliente. */
  deliveryCode: string;
  deliveryCodeAttempts: number;
  timeline: OrderTimelineEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export type NewOrder = Omit<
  OrderRecord,
  'createdAt' | 'updatedAt' | 'delivery' | 'business' | 'driverId' | 'deliveryCodeAttempts' | 'timeline'
> & { businessId: string | null };

export interface OrderChanges {
  status: OrderStatus;
  payment?: OrderPayment;
  /** null quita al repartidor (lo soltó o la tienda pidió otro). */
  delivery?: OrderDelivery | null;
  driverId?: string | null;
  /**
   * Detalle del paso para la línea de tiempo (p. ej. quién lo entregó y cómo se confirmó). Con el
   * mismo estado (p. ej. una devolución después de cancelar) se anota igual.
   */
  note?: string;
}

export interface OrdersRepository {
  create(order: NewOrder): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  listForUser(userId: string, limit: number): Promise<OrderRecord[]>;
  /** Pedidos que atiende un negocio, ya pagados (los que esperan pago no le conciernen). */
  listForBusiness(businessId: string, limit: number): Promise<OrderRecord[]>;
  /** Pedidos listos para recoger que ningún repartidor tomó todavía. */
  listAvailableForDrivers(limit: number): Promise<OrderRecord[]>;
  listForDriver(driverId: string, limit: number): Promise<OrderRecord[]>;
  /** Entregas en curso del repartidor (tomadas y aún no entregadas). */
  countActiveForDriver(driverId: string): Promise<number>;
  /**
   * Aplica el cambio solo si el pedido sigue en `expected` (comparar y cambiar atómico) y, si cambia
   * de estado, lo anota en la línea de tiempo. Devuelve el pedido actualizado, o null si otro cambio
   * ya lo movió.
   */
  updateIfStatus(id: string, expected: OrderStatus, changes: OrderChanges): Promise<OrderRecord | null>;
  /** Suma un intento fallido del código de entrega y devuelve cuántos van. */
  addFailedCodeAttempt(id: string): Promise<number>;
  /** Código de entrega nuevo, con los intentos en cero (lo pide el cliente si se bloqueó). */
  resetDeliveryCode(id: string, code: string): Promise<OrderRecord>;
}

export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');
