import { Inject, Injectable } from '@nestjs/common';
import type { BusinessInfo, BusinessOrder, PublicUser } from '@parla/types';
import { PresenceRegistry } from '../../../../infra/realtime/presence.registry';
import { ConflictError, NotFoundError } from '../../../../kernel/domain-error';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { toPublicUser } from '../../identity/user.mapper';
import { BUSINESSES_REPOSITORY, type BusinessesRepository } from '../businesses.repository';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { customersOf, OrderEvents, toBusinessOrder } from './orders.use-cases';

const BUSINESS_HISTORY_LIMIT = 100;

/** El negocio de quien consulta, o null si no es dueño de ninguno. */
@Injectable()
export class GetMyBusinessUseCase {
  constructor(@Inject(BUSINESSES_REPOSITORY) private readonly businesses: BusinessesRepository) {}

  async execute(userId: string): Promise<BusinessInfo | null> {
    const business = await this.businesses.findByOwner(userId);
    return business ? { id: business.id, name: business.name, service: business.service } : null;
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

/**
 * El dueño acepta (empieza a prepararlo) o rechaza un pedido pagado. Repetir la misma decisión no
 * cambia nada; cambiar de opinión cuando ya se decidió, no se puede. «Listo» lo resuelve el gateway,
 * porque despacha el motorizado de Rapidito.
 */
@Injectable()
export class DecideBusinessOrderUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly events: OrderEvents,
  ) {}

  async execute(userId: string, id: string, decision: 'accept' | 'reject'): Promise<BusinessOrder> {
    let order = await findBusinessOrder(this.orders, userId, id);
    const target = decision === 'accept' ? 'preparing' : 'rejected';
    if (order.status !== target) {
      if (order.status !== 'paid') throw new ConflictError('Este pedido ya no está esperando tu respuesta');
      const updated = await this.orders.updateIfStatus(id, 'paid', { status: target });
      if (!updated) throw new ConflictError('Este pedido ya no está esperando tu respuesta');
      this.events.changed(updated);
      order = updated;
    }
    return toBusinessOrder(order, await customersOf(this.users, [order]));
  }
}

/**
 * Con quién hablar sobre un pedido (bidireccional): al cliente le devuelve el dueño del negocio y al
 * dueño, el cliente. Con su clave pública, el navegador abre el chat cifrado de siempre. 404 para
 * cualquier otra persona, y para el dueño mientras el pedido no esté pagado.
 */
@Injectable()
export class GetOrderContactUseCase {
  constructor(
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    private readonly presence: PresenceRegistry,
  ) {}

  async execute(userId: string, orderId: string): Promise<PublicUser> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Pedido no encontrado');
    let contactId: string | null = null;
    if (order.userId === userId) contactId = order.business?.ownerId ?? null;
    else if (order.business?.ownerId === userId) contactId = (await findBusinessOrder(this.orders, userId, orderId)).userId;
    if (!contactId || contactId === userId) throw new NotFoundError('Pedido no encontrado');
    const [contact] = await this.users.findActiveByIds([contactId]);
    if (!contact) throw new NotFoundError('Esa cuenta ya no está en Parla');
    return toPublicUser(contact, this.presence.statusOf(contact.id));
  }
}
