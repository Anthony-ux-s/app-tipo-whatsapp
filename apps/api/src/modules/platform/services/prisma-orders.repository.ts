import { Injectable } from '@nestjs/common';
import type { Currency, OrderStatus, OrderTimelineEntry, ServiceId } from '@parla/types';
import type { Business as BusinessRow, Order as OrderRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { NewOrder, OrderChanges, OrderRecord, OrdersRepository } from './orders.repository';

type OrderWithBusiness = OrderRow & { business: BusinessRow | null };

const WITH_BUSINESS = { business: true } as const;

/** Pedidos que el negocio ve: todo menos los que aún esperan el pago o se vencieron sin pagar. */
const VISIBLE_TO_BUSINESS: OrderStatus[] = [
  'paid', 'preparing', 'rejected', 'searching_driver', 'driver_assigned', 'on_the_way', 'delivered', 'cancelled',
];

function toOrderRecord(row: OrderWithBusiness): OrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    service: row.service as ServiceId,
    business: row.business
      ? { id: row.business.id, name: row.business.name, ownerId: row.business.ownerId, address: row.business.address }
      : null,
    status: row.status as OrderStatus,
    lines: JSON.parse(row.lines),
    subtotalCents: row.subtotalCents,
    deliveryFeeCents: row.deliveryFeeCents,
    totalCents: row.totalCents,
    currency: row.currency as Currency,
    address: JSON.parse(row.address),
    payment: JSON.parse(row.payment),
    deliveryQuoteId: row.deliveryQuoteId,
    delivery: row.delivery ? JSON.parse(row.delivery) : null,
    driverId: row.driverId,
    deliveryCode: row.deliveryCode,
    deliveryCodeAttempts: row.deliveryCodeAttempts,
    timeline: JSON.parse(row.timeline),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(order: NewOrder): Promise<OrderRecord> {
    const timeline: OrderTimelineEntry[] = [{ status: order.status, at: new Date().toISOString() }];
    const row = await this.prisma.order.create({
      data: {
        ...order,
        lines: JSON.stringify(order.lines),
        address: JSON.stringify(order.address),
        payment: JSON.stringify(order.payment),
        timeline: JSON.stringify(timeline),
      },
      include: WITH_BUSINESS,
    });
    return toOrderRecord(row);
  }

  async findById(id: string): Promise<OrderRecord | null> {
    const row = await this.prisma.order.findUnique({ where: { id }, include: WITH_BUSINESS });
    return row ? toOrderRecord(row) : null;
  }

  async listForUser(userId: string, limit: number): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit, include: WITH_BUSINESS });
    return rows.map(toOrderRecord);
  }

  async listForBusiness(businessId: string, limit: number): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({
      where: { businessId, status: { in: VISIBLE_TO_BUSINESS } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: WITH_BUSINESS,
    });
    return rows.map(toOrderRecord);
  }

  async listAvailableForDrivers(limit: number): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({
      where: { status: 'searching_driver', driverId: null },
      orderBy: { updatedAt: 'asc' },
      take: limit,
      include: WITH_BUSINESS,
    });
    return rows.map(toOrderRecord);
  }

  async listForDriver(driverId: string, limit: number): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({ where: { driverId }, orderBy: { updatedAt: 'desc' }, take: limit, include: WITH_BUSINESS });
    return rows.map(toOrderRecord);
  }

  countActiveForDriver(driverId: string): Promise<number> {
    return this.prisma.order.count({ where: { driverId, status: { in: ['driver_assigned', 'on_the_way'] } } });
  }

  async updateIfStatus(id: string, expected: OrderStatus, changes: OrderChanges): Promise<OrderRecord | null> {
    const current = await this.prisma.order.findUnique({ where: { id }, select: { status: true, timeline: true } });
    if (!current || current.status !== expected) return null;
    const timeline: OrderTimelineEntry[] = JSON.parse(current.timeline);
    if (changes.status !== expected) {
      timeline.push({ status: changes.status, at: new Date().toISOString(), ...(changes.note ? { note: changes.note } : {}) });
    }
    // El `where` con el estado esperado hace atómico el cambio: si otro lo movió antes, no toca nada.
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: expected },
      data: {
        status: changes.status,
        timeline: JSON.stringify(timeline),
        ...(changes.payment ? { payment: JSON.stringify(changes.payment) } : {}),
        ...(changes.delivery ? { delivery: JSON.stringify(changes.delivery) } : {}),
        ...(changes.driverId ? { driverId: changes.driverId } : {}),
      },
    });
    return count === 1 ? this.findById(id) : null;
  }

  async addFailedCodeAttempt(id: string): Promise<number> {
    const row = await this.prisma.order.update({ where: { id }, data: { deliveryCodeAttempts: { increment: 1 } }, select: { deliveryCodeAttempts: true } });
    return row.deliveryCodeAttempts;
  }
}
