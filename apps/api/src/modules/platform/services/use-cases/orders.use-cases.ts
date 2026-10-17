import { Inject, Injectable } from '@nestjs/common';
import type { BusinessOrder, InternalCreateOrder, InternalOrder, InternalUpdateOrder, Order, OrderCustomer } from '@parla/types';
import { ConflictError, NotFoundError } from '../../../../kernel/domain-error';
import { assertOrderTotals, assertOrderTransition, businessOrderPush, orderPush } from '../../../../kernel/order-rules';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { avatarUrlOf } from '../../identity/user.mapper';
import { BUSINESSES_REPOSITORY, type BusinessesRepository } from '../businesses.repository';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { ORDERS_REPOSITORY, type OrderChanges, type OrderRecord, type OrdersRepository } from '../orders.repository';

const HISTORY_LIMIT = 50;

/** Único lugar donde un pedido se convierte en contrato público (sin datos internos). */
export function toOrder(order: OrderRecord): Order {
  return {
    id: order.id,
    service: order.service,
    business: order.business,
    status: order.status,
    lines: order.lines,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    totalCents: order.totalCents,
    currency: order.currency,
    address: order.address,
    payment: order.payment,
    delivery: order.delivery,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function toInternalOrder(order: OrderRecord): InternalOrder {
  return { ...toOrder(order), userId: order.userId, deliveryQuoteId: order.deliveryQuoteId, businessOwnerId: order.business?.ownerId ?? null };
}

/** Quién hizo cada pedido, para el dueño del negocio. */
export async function customersOf(users: AuthRepository, orders: OrderRecord[]): Promise<Map<string, OrderCustomer>> {
  const found = await users.findActiveByIds([...new Set(orders.map((o) => o.userId))]);
  return new Map(found.map((u) => [u.id, { id: u.id, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: avatarUrlOf(u) }]));
}

/** Pedido para el dueño: con el cliente (si la cuenta ya no existe, solo queda el id). */
export function toBusinessOrder(order: OrderRecord, customers: Map<string, OrderCustomer>): BusinessOrder {
  const customer = customers.get(order.userId) ?? { id: order.userId, displayName: 'Cuenta eliminada', avatarColor: 'slate', avatarUrl: null };
  return { ...toOrder(order), customer };
}

/**
 * Avisa del cambio por tiempo real y, si no tienen Parla abierta, por push: al cliente siempre, y al
 * dueño del negocio desde que el pedido está pagado (antes no le concierne).
 */
@Injectable()
export class OrderEvents {
  constructor(
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly notifications: NotificationDispatcher,
  ) {}

  changed(order: OrderRecord): void {
    this.realtime.toUsers([order.userId], 'order:updated', toOrder(order));
    const push = orderPush(order.id, order.status, order.totalCents, order.delivery?.driverName ?? null, order.business?.name ?? null);
    if (push) void this.notifications.notify([order.userId], () => push);
    if (order.business && order.status !== 'pending_payment' && order.status !== 'payment_expired') {
      void this.toBusiness(order, order.business.ownerId);
    }
  }

  private async toBusiness(order: OrderRecord, ownerId: string): Promise<void> {
    const businessOrder = toBusinessOrder(order, await customersOf(this.users, [order]));
    this.realtime.toUsers([ownerId], 'business-order:updated', businessOrder);
    const push = businessOrderPush(order.id, order.status, order.totalCents, businessOrder.customer.displayName);
    if (push) void this.notifications.notify([ownerId], () => push);
  }
}

/** El gateway guarda el pedido que armó con la tienda, el delivery y la pasarela. */
@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(input: InternalCreateOrder): Promise<InternalOrder> {
    const [customer] = await this.users.findActiveByIds([input.userId]);
    if (!customer) throw new NotFoundError('Esa cuenta no existe');
    assertOrderTotals(input.lines, input.subtotalCents, input.deliveryFeeCents, input.totalCents);
    if (await this.orders.findById(input.id)) throw new ConflictError('Ese pedido ya existe');

    // El negocio que atiende el servicio recibe el pedido cuando se pague.
    const business = await this.businesses.findByService(input.service);
    const order = await this.orders.create({ ...input, businessId: business?.id ?? null, status: 'pending_payment' });
    this.events.changed(order);
    return toInternalOrder(order);
  }
}

@Injectable()
export class GetInternalOrderUseCase {
  constructor(@Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository) {}

  async execute(id: string): Promise<InternalOrder> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('Pedido no encontrado');
    return toInternalOrder(order);
  }
}

/**
 * Cambios que llegan de la pasarela y del delivery (vía gateway). Idempotente: con `expectStatus`,
 * un aviso repetido recibe 409 y no cambia nada; y un pedido nunca retrocede de estado.
 */
@Injectable()
export class UpdateOrderUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(id: string, input: InternalUpdateOrder): Promise<InternalOrder> {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('Pedido no encontrado');
    if (input.expectStatus && order.status !== input.expectStatus) {
      throw new ConflictError('El pedido ya cambió de estado');
    }
    assertOrderTransition(order.status, input.status);

    const changes: OrderChanges = { status: input.status };
    if (input.paidAt) changes.payment = { ...order.payment, paidAt: input.paidAt };
    if (input.delivery) changes.delivery = input.delivery;
    const updated = await this.orders.updateIfStatus(id, order.status, changes);
    if (!updated) throw new ConflictError('El pedido ya cambió de estado');
    if (updated.status !== order.status) this.events.changed(updated);
    return toInternalOrder(updated);
  }
}

/** «Mis pedidos»: el historial de quien consulta. */
@Injectable()
export class ListMyOrdersUseCase {
  constructor(@Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository) {}

  async execute(userId: string): Promise<Order[]> {
    return (await this.orders.listForUser(userId, HISTORY_LIMIT)).map(toOrder);
  }
}

@Injectable()
export class GetMyOrderUseCase {
  constructor(@Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository) {}

  /** 404 también si el pedido es de otra persona: no se revela que existe. */
  async execute(userId: string, id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order || order.userId !== userId) throw new NotFoundError('Pedido no encontrado');
    return toOrder(order);
  }
}
