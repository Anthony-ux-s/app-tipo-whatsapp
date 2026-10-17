import { Inject, Injectable } from '@nestjs/common';
import type {
  BusinessOrder,
  DriverOrder,
  InternalCreateOrder,
  InternalOrder,
  InternalUpdateOrder,
  Order,
  OrderCustomer,
  OrderStatus,
} from '@parla/types';
import { ConflictError, NotFoundError } from '../../../../kernel/domain-error';
import {
  assertOrderTotals,
  assertOrderTransition,
  businessDeliveryPush,
  businessOrderPush,
  driverLostPush,
  driverOfferPush,
  MAX_DELIVERY_CODE_ATTEMPTS,
  newDeliveryCode,
  orderPush,
} from '../../../../kernel/order-rules';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { avatarUrlOf } from '../../identity/user.mapper';
import { NotificationDispatcher } from '../../messaging/push/use-cases/notification-dispatcher';
import { BUSINESSES_REPOSITORY, type BusinessesRepository } from '../businesses.repository';
import { DRIVERS_REPOSITORY, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrderChanges, type OrderRecord, type OrdersRepository } from '../orders.repository';

const HISTORY_LIMIT = 50;

/** Desde que el pedido está listo, el cliente tiene a mano el código que le pedirá el repartidor. */
const CODE_VISIBLE: OrderStatus[] = ['searching_driver', 'driver_assigned', 'on_the_way', 'delivered'];

/** Estados en los que el pedido ya no le concierne solo al cliente: lo ve también el negocio. */
const BUSINESS_SEES = (status: OrderStatus) => status !== 'pending_payment' && status !== 'payment_expired';

/**
 * Único lugar donde un pedido se convierte en contrato público (sin datos internos). El código de
 * entrega solo va en la vista del cliente.
 */
export function toOrder(order: OrderRecord, forCustomer = false): Order {
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
    timeline: order.timeline,
    ...(forCustomer && CODE_VISIBLE.includes(order.status)
      ? { deliveryCode: order.deliveryCode, deliveryCodeLocked: order.deliveryCodeAttempts >= MAX_DELIVERY_CODE_ATTEMPTS }
      : {}),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

function toInternalOrder(order: OrderRecord): InternalOrder {
  return { ...toOrder(order), userId: order.userId, deliveryQuoteId: order.deliveryQuoteId, businessOwnerId: order.business?.ownerId ?? null };
}

/** Quién hizo cada pedido, para el dueño del negocio y el repartidor. */
export async function customersOf(users: AuthRepository, orders: OrderRecord[]): Promise<Map<string, OrderCustomer>> {
  const found = await users.findActiveByIds([...new Set(orders.map((o) => o.userId))]);
  return new Map(found.map((u) => [u.id, { id: u.id, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: avatarUrlOf(u) }]));
}

function customerOf(order: OrderRecord, customers: Map<string, OrderCustomer>): OrderCustomer {
  return customers.get(order.userId) ?? { id: order.userId, displayName: 'Cuenta eliminada', avatarColor: 'slate', avatarUrl: null };
}

/** Pedido para el dueño: con el cliente (sin el código de entrega, que es del cliente). */
export function toBusinessOrder(order: OrderRecord, customers: Map<string, OrderCustomer>): BusinessOrder {
  return { ...toOrder(order), customer: customerOf(order, customers) };
}

/** Pedido para un repartidor: qué recoge, dónde y adónde va. Solo el nombre de pila del cliente. */
export function toDriverOrder(order: OrderRecord, driverId: string, customers: Map<string, OrderCustomer>): DriverOrder {
  return {
    id: order.id,
    status: order.status,
    business: { name: order.business?.name ?? 'Tienda', address: order.business?.address ?? '' },
    address: order.address,
    customerName: customerOf(order, customers).displayName.split(' ')[0],
    lines: order.lines,
    deliveryFeeCents: order.deliveryFeeCents,
    mine: order.driverId === driverId,
    timeline: order.timeline,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Avisa del cambio por tiempo real y, si no tienen Parla abierta, por push: al cliente siempre; al
 * dueño desde que está pagado; al repartidor que lo tomó; y a todos los repartidores cuando queda
 * listo para recoger (y cuando alguien lo toma, para que desaparezca de sus ofertas).
 */
@Injectable()
export class OrderEvents {
  constructor(
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    private readonly notifications: NotificationDispatcher,
  ) {}

  /**
   * @param previousDriverId repartidor que acaba de perder el pedido (lo soltó o la tienda pidió otro),
   * para avisarle y sacárselo de «Mis entregas».
   */
  changed(order: OrderRecord, previousDriverId: string | null = null, statusChanged = true): void {
    this.realtime.toUsers([order.userId], 'order:updated', toOrder(order, true));
    if (statusChanged) {
      const refunded = !!order.payment.refundedAt;
      const push = orderPush(order.id, order.status, order.totalCents, order.delivery?.driverName ?? null, order.business?.name ?? null, refunded);
      if (push) void this.notifications.notify([order.userId], () => push);
    }
    if (order.business && BUSINESS_SEES(order.status)) void this.toOthers(order, order.business.ownerId, previousDriverId, statusChanged);
  }

  private async toOthers(order: OrderRecord, ownerId: string, previousDriverId: string | null, statusChanged: boolean): Promise<void> {
    const customers = await customersOf(this.users, [order]);
    const businessOrder = toBusinessOrder(order, customers);
    this.realtime.toUsers([ownerId], 'business-order:updated', businessOrder);
    const customerName = businessOrder.customer.displayName;
    const push = statusChanged
      ? (businessOrderPush(order.id, order.status, order.totalCents, customerName)
        ?? businessDeliveryPush(order.id, order.status, order.delivery?.driverName ?? null, customerName))
      : null;
    if (push) void this.notifications.notify([ownerId], () => push);

    // searching_driver: se ofrece (o se vuelve a ofrecer); driver_assigned: alguien acaba de tomarlo.
    const offerChanged = statusChanged && (order.status === 'searching_driver' || order.status === 'driver_assigned');
    const driverIds = new Set(offerChanged ? await this.drivers.listUserIds() : []);
    if (order.driverId) driverIds.add(order.driverId);
    if (previousDriverId) driverIds.add(previousDriverId);
    for (const driverId of driverIds) {
      this.realtime.toUsers([driverId], 'driver-order:updated', toDriverOrder(order, driverId, customers));
    }
    const lostBy = previousDriverId ?? (order.status === 'cancelled' ? order.driverId : null);
    const lost = statusChanged && lostBy ? driverLostPush(order.id, order.status, order.business?.name ?? 'La tienda') : null;
    if (lostBy && lost) void this.notifications.notify([lostBy], () => lost);
    if (offerChanged && order.status === 'searching_driver') {
      const offer = driverOfferPush(order.id, order.business?.name ?? 'Una tienda', order.deliveryFeeCents);
      // A quien lo acaba de soltar no se le vuelve a ofrecer por push.
      void this.notifications.notify([...driverIds].filter((id) => id !== previousDriverId), () => offer);
    }
  }
}

/** El gateway guarda el pedido que armó con la tienda, la tarifa de Rapidito y la pasarela. */
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
    const order = await this.orders.create({
      ...input,
      businessId: business?.id ?? null,
      status: 'pending_payment',
      deliveryCode: newDeliveryCode(),
      etaMinutes: input.etaMinutes,
    });
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
 * Cambios que llegan de la pasarela vía gateway (pago, cancelación con devolución, rechazo).
 * Idempotente: con `expectStatus`, un aviso repetido recibe 409 y no cambia nada; y un pedido nunca
 * retrocede de estado. Con el mismo estado solo registra la devolución (un pago que llegó tarde).
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

    const changes: OrderChanges = { status: input.status, note: input.note };
    if (input.paidAt || input.refundedAt) {
      changes.payment = {
        ...order.payment,
        ...(input.paidAt ? { paidAt: input.paidAt } : {}),
        ...(input.refundedAt ? { refundedAt: input.refundedAt } : {}),
      };
    }
    if (input.delivery) changes.delivery = input.delivery;
    const updated = await this.orders.updateIfStatus(id, order.status, changes);
    if (!updated) throw new ConflictError('El pedido ya cambió de estado');
    const statusChanged = updated.status !== order.status;
    if (statusChanged || input.refundedAt) this.events.changed(updated, null, statusChanged);
    return toInternalOrder(updated);
  }
}

/** «Mis pedidos»: el historial de quien consulta. */
@Injectable()
export class ListMyOrdersUseCase {
  constructor(@Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository) {}

  async execute(userId: string): Promise<Order[]> {
    return (await this.orders.listForUser(userId, HISTORY_LIMIT)).map((o) => toOrder(o, true));
  }
}

@Injectable()
export class GetMyOrderUseCase {
  constructor(@Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository) {}

  /** 404 también si el pedido es de otra persona: no se revela que existe. */
  async execute(userId: string, id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order || order.userId !== userId) throw new NotFoundError('Pedido no encontrado');
    return toOrder(order, true);
  }
}

/**
 * El cliente genera un código de entrega nuevo cuando el anterior se bloqueó por intentos fallidos
 * (lo tiene que dictar en persona; si alguien lo estaba adivinando, el nuevo no le sirve).
 */
@Injectable()
export class RenewDeliveryCodeUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(userId: string, id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order || order.userId !== userId) throw new NotFoundError('Pedido no encontrado');
    if (order.status !== 'driver_assigned' && order.status !== 'on_the_way') throw new ConflictError('Este pedido ya no necesita código');
    if (order.deliveryCodeAttempts < MAX_DELIVERY_CODE_ATTEMPTS) throw new ConflictError('Tu código sigue activo');
    const updated = await this.orders.resetDeliveryCode(id, newDeliveryCode());
    this.events.changed(updated, null, false);
    return toOrder(updated, true);
  }
}
