import { Inject, Injectable } from '@nestjs/common';
import type { AdminOrder, OrderStatus } from '@parla/types';
import { NotFoundError } from '../../../../kernel/domain-error';
import { AUTH_REPOSITORY, type AuthRepository } from '../../identity/auth/auth.repository';
import { ORDERS_REPOSITORY, type OrderRecord, type OrdersRepository } from '../orders.repository';
import { requireAdmin } from './claims.use-cases';

export type AdminOrdersView = 'active' | 'delivered' | 'closed' | 'all';

/** Qué estados entran en cada pestaña de «Pedidos» del panel de soporte. */
export const ADMIN_ORDER_VIEWS: Record<AdminOrdersView, OrderStatus[] | undefined> = {
  active: ['pending_payment', 'paid', 'preparing', 'searching_driver', 'driver_assigned', 'on_the_way'],
  delivered: ['delivered'],
  closed: ['cancelled', 'rejected', 'payment_expired'],
  all: undefined,
};

const ADMIN_LIMIT = 100;

async function toAdminOrders(orders: OrderRecord[], users: AuthRepository): Promise<AdminOrder[]> {
  const customers = new Map((await users.findActiveByIds([...new Set(orders.map((o) => o.userId))])).map((u) => [u.id, u]));
  return orders.map((o) => {
    const customer = customers.get(o.userId);
    return {
      id: o.id,
      status: o.status,
      customerName: customer?.displayName ?? 'Cuenta eliminada',
      customerPhone: customer?.phone ?? null,
      businessName: o.business?.name ?? null,
      driverName: o.delivery?.driverName ?? null,
      totalCents: o.totalCents,
      discountCents: o.discountCents,
      couponCode: o.couponCode,
      address: o.address,
      lines: o.lines,
      timeline: o.timeline,
      paidAt: o.payment.paidAt,
      refundedAt: o.payment.refundedAt ?? null,
      openClaims: o.claims.filter((c) => c.status === 'open' || c.status === 'refunding').length,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  });
}

/** Soporte: todos los pedidos (los más recientes primero), por pestaña y buscando por id o cliente. */
@Injectable()
export class ListAdminOrdersUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(adminId: string, view: AdminOrdersView, query = ''): Promise<AdminOrder[]> {
    await requireAdmin(this.users, adminId);
    const found = await this.orders.search({ statuses: ADMIN_ORDER_VIEWS[view], query: query.trim().slice(0, 60), limit: ADMIN_LIMIT });
    return toAdminOrders(found, this.users);
  }
}

@Injectable()
export class GetAdminOrderUseCase {
  constructor(
    @Inject(AUTH_REPOSITORY) private readonly users: AuthRepository,
    @Inject(ORDERS_REPOSITORY) private readonly orders: OrdersRepository,
  ) {}

  async execute(adminId: string, id: string): Promise<AdminOrder> {
    await requireAdmin(this.users, adminId);
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('Pedido no encontrado');
    return (await toAdminOrders([order], this.users))[0];
  }
}

/** Para el gateway: ¿esta cuenta es de soporte? (cancelar un pedido trabado mueve dinero allá). */
@Injectable()
export class IsAdminUseCase {
  constructor(@Inject(AUTH_REPOSITORY) private readonly users: AuthRepository) {}

  async execute(userId: string): Promise<{ isAdmin: boolean }> {
    const [user] = await this.users.findActiveByIds([userId]);
    return { isAdmin: !!user?.isAdmin };
  }
}
