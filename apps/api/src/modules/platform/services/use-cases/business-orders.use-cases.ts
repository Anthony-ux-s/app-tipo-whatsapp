import { Inject, Injectable, Optional } from '@nestjs/common';
import { REALTIME_PUBLISHER, type RealtimePublisher } from '../../../../infra/realtime/realtime-publisher.port';
import type { BusinessInfo, BusinessOrder, BusinessStatus, GeoPoint, OrderContactRole, OrderStatus, PublicUser, ServiceId, UpdateBusinessRequest } from '@parla/types';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import { assertHour, businessStatus } from '../../../../kernel/business-hours';
import { ConflictError, NotFoundError, ValidationError } from '../../../../kernel/domain-error';
import { parsePhone } from '../../../../kernel/phone';
import { assertLocation } from '../../../../kernel/store-rules';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { toPublicUser } from '../../identity/user.mapper';
import { BUSINESSES_REPOSITORY, type BusinessesRepository, type BusinessRecord } from '../businesses.repository';
import { DispatchPolicy } from '../dispatch.policy';
import { ORDERS_REPOSITORY, type OrderChanges, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { toBusinessInfo } from '../../stores/stores.use-cases';
import { customersOf, OrderEvents, toBusinessOrder } from './orders.use-cases';

const BUSINESS_HISTORY_LIMIT = 100;

/** El negocio de quien consulta, o null si no es dueño de ninguno. */
@Injectable()
export class GetMyBusinessUseCase {
  constructor(@Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository) {}

  async execute(userId: string): Promise<BusinessInfo | null> {
    const business = await this.businesses.findByOwner(userId);
    return business ? toBusinessInfo(business) : null;
  }
}

/** El dueño pausa o reanuda los pedidos («Recibir pedidos») y cambia el horario. */
@Injectable()
export class UpdateMyBusinessUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    /** Para avisar al instante al resto de dispositivos del dueño (opcional en pruebas). */
    @Optional() @Inject(REALTIME_PUBLISHER) private readonly realtime?: RealtimePublisher,
  ) {}

  async execute(userId: string, changes: UpdateBusinessRequest): Promise<BusinessInfo> {
    const business = await this.businesses.findByOwner(userId);
    if (!business) throw new NotFoundError('No tienes un negocio en Parla');
    // Una ferretería conectada a FerroHub configura sus datos allá (nombre, dirección, ubicación y horario): Parla solo los lee.
    if (business.connector?.kind === 'ferrohub' && ['name', 'description', 'address', 'location', 'opensAt', 'closesAt'].some((k) => (changes as Record<string, unknown>)[k] !== undefined)) {
      throw new ValidationError('Los datos de tu tienda se configuran en FerroHub. Ábrelo desde «Mi negocio» y Parla los actualiza solo.');
    }
    if (changes.opensAt !== undefined) assertHour(changes.opensAt, 'Abre');
    if (changes.closesAt !== undefined) assertHour(changes.closesAt, 'Cierra');
    const patch: UpdateBusinessRequest = {};
    if (changes.acceptingOrders !== undefined) patch.acceptingOrders = changes.acceptingOrders;
    if (changes.opensAt !== undefined) patch.opensAt = changes.opensAt;
    if (changes.closesAt !== undefined) patch.closesAt = changes.closesAt;
    if (changes.name !== undefined) {
      const name = changes.name.trim();
      if (name.length < 3 || name.length > 60) throw new ValidationError('El nombre de la tienda lleva de 3 a 60 letras');
      patch.name = name;
    }
    if (changes.description !== undefined) {
      if (changes.description.length > 300) throw new ValidationError('La descripción lleva hasta 300 letras');
      patch.description = changes.description.trim();
    }
    if (changes.address !== undefined) {
      const address = changes.address.trim();
      if (address.length < 6 || address.length > 200) throw new ValidationError('Escribe la dirección de la tienda (donde el repartidor recoge los pedidos)');
      patch.address = address;
    }
    // El teléfono de contacto es de Parla (también en tiendas de FerroHub): siempre se puede cambiar, nunca vaciar.
    if (changes.phone !== undefined) patch.phone = parsePhone(changes.phone);
    if (changes.location !== undefined) {
      assertLocation(changes.location);
      patch.location = changes.location;
    }
    if (Object.keys(patch).length === 0) throw new ValidationError('No hay cambios');
    const updated = await this.businesses.update(business.id, patch);
    // Una tienda rechazada que corrige sus datos vuelve a revisión (soporte la ve de nuevo).
    const profileChanged = patch.name !== undefined || patch.description !== undefined || patch.address !== undefined || patch.location !== undefined;
    const result = business.status === 'rejected' && profileChanged ? toBusinessInfo(await this.businesses.setReview(business.id, { status: 'pending', reviewNote: '', reviewedById: userId })) : toBusinessInfo(updated);
    this.realtime?.toUsers([userId], 'business:updated', result);
    return result;
  }
}

/** Si una tienda recibe pedidos ahora (lo ve el cliente antes de pagar). Null si la tienda no existe. */
@Injectable()
export class GetBusinessStatusUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(storeId: string, now = new Date()): Promise<BusinessStatus | null> {
    const business = await this.businesses.findById(storeId);
    if (!business) return null;
    const rating = await this.orders.ratingSummary({ businessId: business.id });
    return { name: business.name, ...businessStatus(business, now), opensAt: business.opensAt, closesAt: business.closesAt, rating };
  }
}

/** Para el gateway: el negocio con su dueño y si recibe pedidos ahora (antes de cotizar o cobrar). */
export interface InternalBusiness {
  id: string;
  name: string;
  service: ServiceId;
  ownerId: string;
  /** Punto de la tienda: el gateway cotiza el envío por distancia hasta el cliente. */
  location: GeoPoint | null;
  open: boolean;
  closedMessage: string | null;
}

@Injectable()
export class GetInternalBusinessUseCase {
  constructor(@Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository) {}

  async execute(by: 'store' | 'owner', key: string, now = new Date()): Promise<InternalBusiness> {
    const business = by === 'store' ? await this.businesses.findById(key) : await this.businesses.findByOwner(key);
    if (!business) throw new NotFoundError('Negocio no encontrado');
    return { id: business.id, name: business.name, service: business.service, ownerId: business.ownerId, location: business.location, ...businessStatus(business, now) };
  }
}

/** Pedidos que recibe el negocio del dueño, del más nuevo al más viejo. */
@Injectable()
export class ListBusinessOrdersUseCase {
  constructor(
    @Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
  ) {}

  async execute(userId: string): Promise<BusinessOrder[]> {
    const business = await this.businesses.findByOwner(userId);
    if (!business) throw new NotFoundError('No tienes un negocio en Parla');
    const orders = await this.orders.listForBusiness(business.id, BUSINESS_HISTORY_LIMIT);
    const customers = await customersOf(this.users, orders);
    return orders.map((order) => toBusinessOrder(order, customers));
  }
}

/** Un pedido del negocio. 404 también si es de otro negocio o aún no se paga: no se revela que existe. */
async function findBusinessOrder(orders: OrdersRepository, userId: string, id: string): Promise<OrderRecord> {
  const order = await orders.findById(id);
  if (!order || order.business?.ownerId !== userId || order.status === 'pending_payment' || order.status === 'payment_expired') {
    throw new NotFoundError('Pedido no encontrado');
  }
  return order;
}

@Injectable()
export class GetBusinessOrderUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
  ) {}

  async execute(userId: string, id: string): Promise<BusinessOrder> {
    const order = await findBusinessOrder(this.orders, userId, id);
    return toBusinessOrder(order, await customersOf(this.users, [order]));
  }
}

/** Rechazar y cancelar los resuelve el gateway, porque devuelven el pago en la billetera. */
export type BusinessAction = 'accept' | 'ready' | 'handoff' | 'reassign';

/** De qué estado a cuál lleva cada acción del dueño, y qué le dice si ya no se puede. */
const ACTIONS: Record<BusinessAction, { from: OrderStatus; to: OrderStatus; late: string }> = {
  accept: { from: 'paid', to: 'preparing', late: 'Este pedido ya no está esperando tu respuesta' },
  ready: { from: 'preparing', to: 'searching_driver', late: 'Primero acepta el pedido para prepararlo' },
  handoff: { from: 'driver_assigned', to: 'on_the_way', late: 'Todavía ningún repartidor tomó este pedido' },
  reassign: { from: 'driver_assigned', to: 'searching_driver', late: 'Este pedido ya no tiene repartidor asignado' },
};

/** Al recoger, el tiempo que falta es el tramo de la tienda al cliente (aprox. 60 % del estimado). */
const ON_THE_WAY_SHARE = 0.6;

/**
 * El dueño avanza su pedido: lo acepta, avisa que está listo (se ofrece a los repartidores de
 * Rapidito), confirma que se lo entregó al repartidor, o pide otro repartidor si el asignado no
 * llega. Repetir la misma acción no cambia nada; saltarse un paso o volver atrás, no se puede.
 */
@Injectable()
export class DecideBusinessOrderUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
    private readonly dispatch: DispatchPolicy,
  ) {}

  async execute(userId: string, id: string, action: BusinessAction): Promise<BusinessOrder> {
    let order = await findBusinessOrder(this.orders, userId, id);
    const step = ACTIONS[action];
    if (order.status !== step.to) {
      if (order.status !== step.from) throw new ConflictError(step.late);
      const driverName = order.delivery?.driverName ?? 'el repartidor';
      const changes: OrderChanges = { status: step.to };
      // Listo (o de nuevo sin repartidor): se ofrece por cercanía desde la primera oleada.
      if (step.to === 'searching_driver') Object.assign(changes, await this.dispatch.openOffer());
      if (action === 'handoff') {
        changes.note = `Entregado a ${driverName} en la tienda`;
        changes.delivery = order.delivery && {
          ...order.delivery,
          etaMinutes: Math.max(5, Math.round(order.etaMinutes * ON_THE_WAY_SHARE)),
          updatedAt: new Date().toISOString(),
        };
      }
      if (action === 'reassign') Object.assign(changes, { driverId: null, delivery: null, note: `La tienda pidió otro repartidor (${driverName} no llegó)` });
      const updated = await this.orders.updateIfStatus(id, step.from, changes);
      if (!updated) throw new ConflictError(step.late);
      this.events.changed(updated, action === 'reassign' ? order.driverId : null);
      order = updated;
    }
    return toBusinessOrder(order, await customersOf(this.users, [order]));
  }
}

/**
 * Con quién hablar sobre un pedido, en los dos sentidos: cliente ↔ negocio, cliente ↔ repartidor y
 * negocio ↔ repartidor. Devuelve a la otra persona con su clave pública para abrir el chat cifrado
 * de siempre. 404 para quien no participa, para el negocio antes del pago y con el repartidor antes
 * de que alguien tome el pedido.
 */
@Injectable()
export class GetOrderContactUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(userId: string, orderId: string, withRole: OrderContactRole): Promise<PublicUser> {
    if (!['business', 'customer', 'driver'].includes(withRole)) throw new ValidationError('Elige con quién quieres hablar');
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Pedido no encontrado');
    const paid = order.status !== 'pending_payment' && order.status !== 'payment_expired';
    const people: Record<OrderContactRole, string | null> = {
      customer: order.userId,
      business: paid ? (order.business?.ownerId ?? null) : (order.userId === userId ? (order.business?.ownerId ?? null) : null),
      driver: order.driverId,
    };
    const iAm = (Object.keys(people) as OrderContactRole[]).filter((role) => people[role] === userId);
    const contactId = people[withRole];
    // Hay que ser parte del pedido (y el negocio, solo una vez pagado) para ver a los demás.
    const allowed = iAm.some((role) => role !== withRole && (role !== 'business' || paid));
    if (!allowed || !contactId || contactId === userId) throw new NotFoundError('Pedido no encontrado');
    const [contact] = await this.users.findActiveByIds([contactId]);
    if (!contact) throw new NotFoundError('Esa cuenta ya no está en Parla');
    return toPublicUser(contact, this.presence.statusOf(contact.id));
  }
}
