import { Inject, Injectable, Optional } from '@nestjs/common';
import type {
  BusinessOrder,
  DriverOrder,
  InternalCreateOrder,
  InternalOrder,
  InternalUpdateOrder,
  Order,
  OrderCustomer,
  OrderClaim,
  OrderStatus,
  GeoPoint,
  RateOrderRequest,
} from '@parla/types';
import { ConflictError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { isBigOrder } from '../../../../kernel/big-order';
import { StoreStatusSync } from './store-status-sync';
import { distanceKm } from '../../../../kernel/geo';
import {
  assertOrderTotals,
  deliveryPaidOnArrival,
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
import type { ClaimRecord } from '../claims.repository';
import { DispatchPolicy } from '../dispatch.policy';
import { DriverPayPolicy } from '../driver-pay.policy';
import { DRIVERS_REPOSITORY, type DriversRepository } from '../drivers.repository';
import { ORDERS_REPOSITORY, type OrderChanges, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { ADDRESSES_REPOSITORY, type AddressesRepository } from '../addresses.repository';
import { COUPONS_REPOSITORY, type CouponsRepository } from '../coupons.repository';
import { SAVED_ADDRESSES_LIMIT } from './addresses.use-cases';
import { evaluateCoupon } from './coupon-evaluation';

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
    big: order.business ? isBigOrder(order, order.business.bigOrder) : false,
    lines: order.lines,
    subtotalCents: order.subtotalCents,
    deliveryFeeCents: order.deliveryFeeCents,
    tipCents: order.tipCents,
    deliveryOnArrivalCents: deliveryPaidOnArrival(order) ? order.deliveryFeeCents : 0,
    discountCents: order.discountCents,
    couponCode: order.couponCode,
    totalCents: order.totalCents,
    currency: order.currency,
    address: order.address,
    payment: order.payment,
    delivery: order.delivery,
    timeline: order.timeline,
    rating: order.rating,
    hasDeliveryPhoto: !!order.deliveryPhotoId,
    deliveredWithoutCode: order.deliveredWithoutCode,
    claims: order.claims.map(toOrderClaim),
    // Mientras el repartidor lo lleva, cliente y tienda lo siguen en el mapa.
    ...(order.status === 'driver_assigned' || order.status === 'on_the_way'
      ? { driverLocation: order.driverLocation && { orderId: order.id, lat: order.driverLocation.lat, lng: order.driverLocation.lng, at: order.driverLocation.at.toISOString() } }
      : {}),
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

/** Un reclamo como lo ven el cliente y la tienda (sin datos internos de la devolución). */
export function toOrderClaim(c: ClaimRecord): OrderClaim {
  return {
    id: c.id,
    orderId: c.orderId,
    reason: c.reason,
    comment: c.comment,
    items: c.items,
    hasPhoto: !!c.photoId,
    suggestedCents: c.suggestedCents,
    status: c.status,
    refundCents: c.status === 'refunded' ? c.refundCents : null,
    resolutionNote: c.resolutionNote,
    createdAt: c.createdAt.toISOString(),
    resolvedAt: c.resolvedAt?.toISOString() ?? null,
  };
}

/** Quién hizo cada pedido, para el dueño del negocio y el repartidor. */
export async function customersOf(users: AuthRepository, orders: OrderRecord[]): Promise<Map<string, OrderCustomer>> {
  const found = await users.findActiveByIds([...new Set(orders.map((o) => o.userId))]);
  return new Map(found.map((u) => [u.id, { id: u.id, displayName: u.displayName, avatarColor: u.avatarColor, avatarUrl: avatarUrlOf(u), phone: u.phone }]));
}

function customerOf(order: OrderRecord, customers: Map<string, OrderCustomer>): OrderCustomer {
  return customers.get(order.userId) ?? { id: order.userId, displayName: 'Cuenta eliminada', avatarColor: 'slate', avatarUrl: null };
}

/** Pedido para el dueño: con el cliente (sin el código de entrega, que es del cliente). */
export function toBusinessOrder(order: OrderRecord, customers: Map<string, OrderCustomer>): BusinessOrder {
  const customer = customerOf(order, customers);
  const big = order.business ? isBigOrder(order, order.business.bigOrder) : false;
  // El teléfono del cliente solo lo ve la tienda en un pedido grande: para confirmarlo con él al instante.
  return { ...toOrder(order), customer: big ? customer : { ...customer, phone: undefined } };
}

/**
 * Pedido para un repartidor: qué recoge, dónde, adónde va, cuánto gana y a qué distancia está la
 * tienda. Solo el nombre de pila del cliente.
 */
export function toDriverOrder(
  order: OrderRecord,
  driverId: string,
  customers: Map<string, OrderCustomer>,
  pay: DriverPayPolicy,
  viewerLocation: GeoPoint | null = null,
): DriverOrder {
  const split = pay.split(order.deliveryFeeCents, order.tipCents);
  const store = order.business?.location ?? null;
  return {
    id: order.id,
    status: order.status,
    business: { name: order.business?.name ?? 'Tienda', address: order.business?.address ?? '', location: order.business?.location ?? null },
    address: order.address,
    customerName: customerOf(order, customers).displayName.split(' ')[0],
    lines: order.lines,
    deliveryFeeCents: order.deliveryFeeCents,
    tipCents: order.tipCents,
    collectOnArrivalCents: deliveryPaidOnArrival(order) ? order.deliveryFeeCents + order.tipCents : 0,
    commissionDueCents: deliveryPaidOnArrival(order) ? split.commissionCents : 0,
    commissionCents: split.commissionCents,
    commissionPercent: pay.commissionPercent,
    earningsCents: split.earningsCents,
    distanceToStoreKm: viewerLocation && store ? Math.round(distanceKm(viewerLocation, store) * 10) / 10 : null,
    exclusiveUntil: order.status === 'searching_driver' && order.reservedFor?.driverId === driverId ? order.reservedFor.until.toISOString() : null,
    hasDeliveryPhoto: !!order.deliveryPhotoId,
    mine: order.driverId === driverId,
    timeline: order.timeline,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}

/**
 * Avisa del cambio por tiempo real y, si no tienen Parla abierta, por push: al cliente siempre; al
 * dueño desde que está pagado; al repartidor que lo tomó; y, cuando queda listo para recoger, solo a
 * los repartidores que alcanza la oferta por cercanía (y a todos cuando alguien lo toma, para que
 * desaparezca de sus ofertas).
 */
@Injectable()
export class OrderEvents {
  constructor(
    @Inject(REALTIME_PUBLISHER) private readonly realtime: RealtimePublisher,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(DRIVERS_REPOSITORY) private readonly drivers: DriversRepository,
    private readonly notifications: NotificationDispatcher,
    private readonly pay: DriverPayPolicy,
    private readonly dispatch: DispatchPolicy,
    /** Avisa a la ferretería conectada cada paso del pedido (opcional: sin esto todo funciona igual). */
    @Optional() private readonly storeSync?: StoreStatusSync,
  ) {}

  /**
   * @param previousDriverId repartidor que acaba de perder el pedido (lo soltó o la tienda pidió otro),
   * para avisarle y sacárselo de «Mis entregas».
   */
  changed(order: OrderRecord, previousDriverId: string | null = null, statusChanged = true): void {
    this.realtime.toUsers([order.userId], 'order:updated', toOrder(order, true));
    if (statusChanged) void this.storeSync?.statusChanged(order);
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
      ? (businessOrderPush(order.id, order.status, order.totalCents, customerName, order.business ? isBigOrder(order, order.business.bigOrder) : false)
        ?? businessDeliveryPush(order.id, order.status, order.delivery?.driverName ?? null, customerName))
      : null;
    if (push) void this.notifications.notify([ownerId], () => push);

    // searching_driver: se ofrece (solo a los que alcanza la oleada); driver_assigned: alguien acaba
    // de tomarlo y se avisa a todos los conectados para que desaparezca de sus ofertas.
    const offerChanged = statusChanged && (order.status === 'searching_driver' || order.status === 'driver_assigned');
    const online = offerChanged ? await this.drivers.listOnline() : [];
    const reached = order.status === 'searching_driver' ? online.filter((d) => this.dispatch.canSee(order, d)) : online;
    const locations = new Map(online.map((d) => [d.userId, d.location]));
    const driverIds = new Set(reached.map((d) => d.userId));
    if (order.driverId) driverIds.add(order.driverId);
    if (previousDriverId) driverIds.add(previousDriverId);
    for (const driverId of driverIds) {
      this.realtime.toUsers([driverId], 'driver-order:updated', toDriverOrder(order, driverId, customers, this.pay, locations.get(driverId) ?? null));
    }
    const lostBy = previousDriverId ?? (order.status === 'cancelled' ? order.driverId : null);
    const lost = statusChanged && lostBy ? driverLostPush(order.id, order.status, order.business?.name ?? 'La tienda') : null;
    if (lostBy && lost) void this.notifications.notify([lostBy], () => lost);
    if (offerChanged && order.status === 'searching_driver') {
      const offer = driverOfferPush(order.id, order.business?.name ?? 'Una tienda', this.pay.split(order.deliveryFeeCents, order.tipCents).earningsCents);
      // A quien lo acaba de soltar no se le vuelve a ofrecer por push.
      void this.notifications.notify(reached.map((d) => d.userId).filter((id) => id !== previousDriverId), () => offer);
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
    @Inject(COUPONS_REPOSITORY) private readonly coupons: CouponsRepository,
    @Inject(ADDRESSES_REPOSITORY) private readonly addresses: AddressesRepository,
  ) {}

  async execute(input: InternalCreateOrder): Promise<InternalOrder> {
    const [customer] = await this.users.findActiveByIds([input.userId]);
    if (!customer) throw new NotFoundError('Esa cuenta no existe');
    const discountCents = input.discountCents ?? 0;
    assertOrderTotals(input.lines, input.subtotalCents, input.deliveryFeeCents, input.totalCents, input.tipCents ?? 0, discountCents);
    if (await this.orders.findById(input.id)) throw new ConflictError('Ese pedido ya existe');
    // El cupón se vuelve a validar aquí (pudo vencer o agotarse desde la cotización).
    let couponCode: string | null = null;
    if (input.couponCode) {
      const applied = await evaluateCoupon(this.coupons, { code: input.couponCode, userId: input.userId, subtotalCents: input.subtotalCents, deliveryFeeCents: input.deliveryFeeCents });
      if (applied.discountCents !== discountCents) throw new ConflictError('El descuento del cupón cambió; vuelve a revisar tu carrito');
      couponCode = applied.code;
    } else if (discountCents !== 0) {
      throw new ValidationError('Un descuento necesita un cupón');
    }

    // La tienda del pedido (la clave de tienda es su id) lo recibe cuando se pague.
    const business = await this.businesses.findById(input.service);
    const order = await this.orders.create({
      ...input,
      businessId: business?.id ?? null,
      pickup: business?.location ?? null,
      status: 'pending_payment',
      deliveryCode: newDeliveryCode(),
      etaMinutes: input.etaMinutes,
      tipCents: input.tipCents ?? 0,
      discountCents,
      couponCode,
    });
    this.events.changed(order);
    // Se recuerda la dirección para el próximo pedido (si falla, el pedido sigue igual).
    await this.addresses.remember(input.userId, input.address, new Date(), SAVED_ADDRESSES_LIMIT).catch(() => undefined);
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
    if (input.paidAt || input.refundedAt || input.chargeId) {
      changes.payment = {
        ...order.payment,
        ...(input.paidAt ? { paidAt: input.paidAt } : {}),
        ...(input.refundedAt ? { refundedAt: input.refundedAt } : {}),
        ...(input.chargeId ? { chargeId: input.chargeId } : {}),
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

/**
 * Al recibir el pedido, el cliente califica al repartidor y a la tienda (1 a 5 estrellas) y deja un
 * comentario si quiere. Una sola vez por pedido; la tienda lo ve en su pedido.
 */
@Injectable()
export class RateOrderUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(userId: string, id: string, input: RateOrderRequest): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order || order.userId !== userId) throw new NotFoundError('Pedido no encontrado');
    if (order.status !== 'delivered') throw new ConflictError('Podrás calificar cuando recibas tu pedido');
    const stars = (n: number | null | undefined) => {
      if (n === null || n === undefined) return null;
      if (!Number.isInteger(n) || n < 1 || n > 5) throw new ValidationError('Las estrellas van de 1 a 5');
      return n;
    };
    const driverStars = order.driverId ? stars(input.driverStars) : null;
    const storeStars = order.business ? stars(input.storeStars) : null;
    if (driverStars === null && storeStars === null) throw new ValidationError('Elige al menos una calificación');
    const comment = (input.comment ?? '').trim().slice(0, 300);
    const rated = await this.orders.rate(id, { driverStars, storeStars, comment }, new Date());
    if (!rated) throw new ConflictError('Ya calificaste este pedido');
    this.events.changed(rated, null, false);
    return toOrder(rated, true);
  }
}
