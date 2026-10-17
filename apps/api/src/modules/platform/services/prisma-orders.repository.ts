import { Injectable } from '@nestjs/common';
import type { Currency, OrderRating, OrderStatus, OrderTimelineEntry, RatingSummary, ServiceId } from '@parla/types';
import type { Business as BusinessRow, Order as OrderRow, Prisma } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { NewOrder, OrderChanges, OrderRecord, OrdersRepository } from './orders.repository';

type OrderWithBusiness = OrderRow & {
  business: BusinessRow | null;
  driver: { lastLat: number | null; lastLng: number | null; lastLocationAt: Date | null } | null;
};

/** El negocio y la última ubicación del repartidor (para el mapa). */
const WITH_BUSINESS = { business: true, driver: { select: { lastLat: true, lastLng: true, lastLocationAt: true } } } as const;

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
      ? {
          id: row.business.id,
          name: row.business.name,
          ownerId: row.business.ownerId,
          address: row.business.address,
          location: row.business.lat !== null && row.business.lng !== null ? { lat: row.business.lat, lng: row.business.lng } : null,
        }
      : null,
    status: row.status as OrderStatus,
    lines: JSON.parse(row.lines),
    subtotalCents: row.subtotalCents,
    deliveryFeeCents: row.deliveryFeeCents,
    tipCents: row.tipCents,
    totalCents: row.totalCents,
    currency: row.currency as Currency,
    address: JSON.parse(row.address),
    payment: JSON.parse(row.payment),
    deliveryQuoteId: row.deliveryQuoteId,
    etaMinutes: row.etaMinutes,
    delivery: row.delivery ? JSON.parse(row.delivery) : null,
    driverId: row.driverId,
    driverLocation:
      row.driver && row.driver.lastLat !== null && row.driver.lastLng !== null && row.driver.lastLocationAt
        ? { lat: row.driver.lastLat, lng: row.driver.lastLng, at: row.driver.lastLocationAt }
        : null,
    deliveryCode: row.deliveryCode,
    deliveryCodeAttempts: row.deliveryCodeAttempts,
    timeline: JSON.parse(row.timeline),
    rating: row.ratedAt
      ? { driverStars: row.driverStars, storeStars: row.storeStars, comment: row.ratingComment, at: row.ratedAt.toISOString() }
      : null,
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

  async listActiveForDriver(driverId: string): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({ where: { driverId, status: { in: ['driver_assigned', 'on_the_way'] } }, include: WITH_BUSINESS });
    return rows.map(toOrderRecord);
  }

  async driverEarnings(driverId: string, since: { today: Date; week: Date }) {
    const sum = async (from?: Date): Promise<[number, number, number]> => {
      const where: Prisma.OrderWhereInput = { driverId, status: 'delivered', ...(from ? { updatedAt: { gte: from } } : {}) };
      const r = await this.prisma.order.aggregate({ where, _sum: { deliveryFeeCents: true, tipCents: true }, _count: true });
      const tips = r._sum.tipCents ?? 0;
      return [(r._sum.deliveryFeeCents ?? 0) + tips, r._count, tips];
    };
    const [today, week, total] = await Promise.all([sum(since.today), sum(since.week), sum()]);
    return { today: [today[0], today[1]] as [number, number], week: [week[0], week[1]] as [number, number], total: [total[0], total[1]] as [number, number], tipsCents: total[2] };
  }

  async listByStatus(statuses: OrderStatus[], limit: number): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({ where: { status: { in: statuses } }, orderBy: { updatedAt: 'asc' }, take: limit, include: WITH_BUSINESS });
    return rows.map(toOrderRecord);
  }

  async rate(id: string, rating: Omit<OrderRating, 'at'>, at: Date): Promise<OrderRecord | null> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, ratedAt: null },
      data: { driverStars: rating.driverStars, storeStars: rating.storeStars, ratingComment: rating.comment, ratedAt: at },
    });
    return count === 1 ? this.findById(id) : null;
  }

  async ratingSummary(of: { driverId: string } | { businessId: string }): Promise<RatingSummary> {
    const byDriver = 'driverId' in of;
    const field = byDriver ? 'driverStars' : 'storeStars';
    const r = await this.prisma.order.aggregate({
      where: { ...(byDriver ? { driverId: of.driverId } : { businessId: of.businessId }), [field]: { not: null } },
      _avg: { [field]: true },
      _count: { [field]: true },
    });
    const avg = (r._avg as Record<string, number | null>)[field];
    const count = (r._count as Record<string, number>)[field] ?? 0;
    return { average: avg === null ? null : Math.round(avg * 10) / 10, count };
  }

  async updateIfStatus(id: string, expected: OrderStatus, changes: OrderChanges): Promise<OrderRecord | null> {
    const current = await this.prisma.order.findUnique({ where: { id }, select: { status: true, timeline: true } });
    if (!current || current.status !== expected) return null;
    const timeline: OrderTimelineEntry[] = JSON.parse(current.timeline);
    if (changes.status !== expected || changes.note) {
      timeline.push({ status: changes.status, at: new Date().toISOString(), ...(changes.note ? { note: changes.note } : {}) });
    }
    // El `where` con el estado esperado hace atómico el cambio: si otro lo movió antes, no toca nada.
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: expected },
      data: {
        status: changes.status,
        timeline: JSON.stringify(timeline),
        ...(changes.payment ? { payment: JSON.stringify(changes.payment) } : {}),
        ...(changes.delivery !== undefined ? { delivery: changes.delivery ? JSON.stringify(changes.delivery) : null } : {}),
        ...(changes.driverId !== undefined ? { driverId: changes.driverId } : {}),
      },
    });
    return count === 1 ? this.findById(id) : null;
  }

  async resetDeliveryCode(id: string, code: string): Promise<OrderRecord> {
    await this.prisma.order.update({ where: { id }, data: { deliveryCode: code, deliveryCodeAttempts: 0 } });
    return (await this.findById(id))!;
  }

  async addFailedCodeAttempt(id: string): Promise<number> {
    const row = await this.prisma.order.update({ where: { id }, data: { deliveryCodeAttempts: { increment: 1 } }, select: { deliveryCodeAttempts: true } });
    return row.deliveryCodeAttempts;
  }
}
