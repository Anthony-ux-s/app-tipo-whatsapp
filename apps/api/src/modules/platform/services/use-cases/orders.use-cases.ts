import { Inject, Injectable } from '@nestjs/common';
import type { InternalCreateOrder, InternalOrder, InternalUpdateOrder, Order } from '@parla/types';
import { ConflictError, NotFoundError } from '../../../../kernel/domain-error';
import { assertOrderTotals, assertOrderTransition, orderPush } from '../../../../kernel/order-rules';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { ORDERS_REPOSITORY, type OrderChanges, type OrderRecord, type OrdersRepository } from '../orders.repository';

const HISTORY_LIMIT = 50;

/** Único lugar donde un pedido se convierte en contrato público (sin datos internos). */
export function toOrder(order: OrderRecord): Order {
  return {
    id: order.id,
    service: order.service,
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
  return { ...toOrder(order), userId: order.userId, deliveryQuoteId: order.deliveryQuoteId };
}

/** Avisa al dueño por tiempo real y, si no tiene Parla abierta, por push. */
@Injectable()
export class OrderEvents {
  constructor(
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    private readonly notifications: NotificationDispatcher,
  ) {}

  changed(order: OrderRecord): void {
    this.realtime.toUsers([order.userId], 'order:updated', toOrder(order));
    const push = orderPush(order.id, order.status, order.totalCents, order.delivery?.driverName ?? null);
    if (push) void this.notifications.notify([order.userId], () => push);
  }
}

/** El gateway guarda el pedido que armó con la tienda, el delivery y la pasarela. */
@Injectable()
export class CreateOrderUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(input: InternalCreateOrder): Promise<InternalOrder> {
    const [owner] = await this.users.findActiveByIds([input.userId]);
    if (!owner) throw new NotFoundError('Esa cuenta no existe');
    assertOrderTotals(input.lines, input.subtotalCents, input.deliveryFeeCents, input.totalCents);
    if (await this.orders.findById(input.id)) throw new ConflictError('Ese pedido ya existe');

    const order = await this.orders.create({ ...input, status: 'pending_payment' });
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
