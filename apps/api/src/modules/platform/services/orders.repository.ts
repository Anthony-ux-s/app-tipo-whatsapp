import type { Currency, DeliveryAddress, OrderDelivery, OrderLine, OrderPayment, OrderStatus, ServiceId } from '@parla/types';

/** Pedido tal como lo ven los casos de uso (sin tipos de Prisma). */
export interface OrderRecord {
  id: string;
  userId: string;
  service: ServiceId;
  status: OrderStatus;
  lines: OrderLine[];
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  currency: Currency;
  address: DeliveryAddress;
  payment: OrderPayment;
  deliveryQuoteId: string;
  delivery: OrderDelivery | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewOrder = Omit<OrderRecord, 'createdAt' | 'updatedAt' | 'delivery'>;

export interface OrderChanges {
  status: OrderStatus;
  payment?: OrderPayment;
  delivery?: OrderDelivery;
}

export interface OrdersRepository {
  create(order: NewOrder): Promise<OrderRecord>;
  findById(id: string): Promise<OrderRecord | null>;
  listForUser(userId: string, limit: number): Promise<OrderRecord[]>;
  /**
   * Aplica el cambio solo si el pedido sigue en `expected` (comparar y cambiar atómico).
   * Devuelve el pedido actualizado, o null si otro aviso ya lo cambió.
   */
  updateIfStatus(id: string, expected: OrderStatus, changes: OrderChanges): Promise<OrderRecord | null>;
}

export const ORDERS_REPOSITORY = Symbol('ORDERS_REPOSITORY');
