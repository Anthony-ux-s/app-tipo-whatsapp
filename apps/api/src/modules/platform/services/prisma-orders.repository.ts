import { Injectable } from '@nestjs/common';
import type { Currency, OrderRating, OrderStatus, OrderTimelineEntry, RatingSummary } from '@parla/types';
import type { Business as BusinessRow, Claim as ClaimRow, Order as OrderRow } from '@prisma/client';
import { toClaimRecord } from './prisma-claims.repository';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { bigOrderRulesOf } from '../../../kernel/big-order';
import type { AdminOrderFilter, NewOrder, OfferReservation, OrderChanges, OrderRecord, OrdersRepository } from './orders.repository';

type OrderWithBusiness = OrderRow & {
  business: BusinessRow | null;
  driver: { lastLat: number | null; lastLng: number | null; lastLocationAt: Date | null } | null;
  claims: ClaimRow[];
};

/** El negocio, la última ubicación del repartidor (para el mapa) y los reclamos. */
const WITH_BUSINESS = {
  business: true,
  driver: { select: { lastLat: true, lastLng: true, lastLocationAt: true } },
  claims: { orderBy: { createdAt: 'desc' } },
} as const;

/** Pedidos que el negocio ve: todo menos los que aún esperan el pago o se vencieron sin pagar. */
const VISIBLE_TO_BUSINESS: OrderStatus[] = [
  'paid', 'preparing', 'rejected', 'searching_driver', 'driver_assigned', 'on_the_way', 'delivered', 'cancelled',
];

function toOrderRecord(row: OrderWithBusiness): OrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    service: row.service,
    business: row.business
      ? {
          id: row.business.id,
          name: row.business.name,
          ownerId: row.business.ownerId,
          address: row.business.address,
          location: row.business.lat !== null && row.business.lng !== null ? { lat: row.business.lat, lng: row.business.lng } : null,
          bigOrder: bigOrderRulesOf(row.business),
        }
      : null,
    status: row.status as OrderStatus,
    lines: JSON.parse(row.lines),
    subtotalCents: row.subtotalCents,
    deliveryFeeCents: row.deliveryFeeCents,
    tipCents: row.tipCents,
    discountCents: row.discountCents,
    couponCode: row.couponCode,
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
    offerRadiusKm: row.offerRadiusKm,
    offerWaveAt: row.offerWaveAt,
    reservedFor: row.offerUntil ? { driverId: row.offerDriverId, until: row.offerUntil } : null,
    pickup: row.pickupLat !== null && row.pickupLng !== null ? { lat: row.pickupLat, lng: row.pickupLng } : null,
    deliveryPhotoId: row.deliveryPhotoId,
    deliveredWithoutCode: row.deliveredWithoutCode,
    claims: row.claims.map(toClaimRecord),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create({ pickup, ...order }: NewOrder): Promise<OrderRecord> {
    const timeline: OrderTimelineEntry[] = [{ status: order.status, at: new Date().toISOString() }];
    const row = await this.prisma.order.create({
      data: {
        ...order,
        pickupLat: pickup?.lat ?? null,
        pickupLng: pickup?.lng ?? null,
        lines: JSON.stringify(order.lines),
        address: JSON.stringify(order.address),
        payment: JSON.stringify(order.payment),
        timeline: JSON.stringify(timeline),
        // El uso del cupón se guarda con el pedido, en la misma escritura.
        ...(order.couponCode ? { coupon: { create: { couponCode: order.couponCode, userId: order.userId, discountCents: order.discountCents } } } : {}),
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

  async listByStatus(statuses: OrderStatus[], limit: number): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({ where: { status: { in: statuses } }, orderBy: { updatedAt: 'asc' }, take: limit, include: WITH_BUSINESS });
    return rows.map(toOrderRecord);
  }

  async reserveOffer(id: string, reservation: OfferReservation | null): Promise<OrderRecord | null> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: 'searching_driver', driverId: null },
      data: { offerDriverId: reservation?.driverId ?? null, offerUntil: reservation?.until ?? null },
    });
    return count === 1 ? this.findById(id) : null;
  }

  async widenOffer(id: string, radiusKm: number | null, at: Date): Promise<OrderRecord | null> {
    const { count } = await this.prisma.order.updateMany({ where: { id, status: 'searching_driver', driverId: null }, data: { offerRadiusKm: radiusKm, offerWaveAt: at } });
    return count === 1 ? this.findById(id) : null;
  }

  async search(filter: AdminOrderFilter): Promise<OrderRecord[]> {
    const q = filter.query?.trim();
    const rows = await this.prisma.order.findMany({
      where: {
        ...(filter.statuses?.length ? { status: { in: filter.statuses } } : {}),
        ...(q ? { OR: [{ id: { contains: q, mode: 'insensitive' } }, { user: { displayName: { contains: q, mode: 'insensitive' } } }, { user: { phone: { contains: q } } }] } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: filter.limit,
      include: WITH_BUSINESS,
    });
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

  async ratingSummaries(businessIds: string[]): Promise<Map<string, RatingSummary>> {
    if (businessIds.length === 0) return new Map();
    const rows = await this.prisma.order.groupBy({
      by: ['businessId'],
      where: { businessId: { in: businessIds }, storeStars: { not: null } },
      _avg: { storeStars: true },
      _count: { storeStars: true },
    });
    return new Map(
      rows.flatMap((r) => (r.businessId ? [[r.businessId, { average: r._avg.storeStars === null ? null : Math.round(r._avg.storeStars * 10) / 10, count: r._count.storeStars }] as const] : [])),
    );
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
        ...(changes.offer ? { offerRadiusKm: changes.offer.radiusKm, offerWaveAt: changes.offer.at } : {}),
        ...(changes.reservation !== undefined ? { offerDriverId: changes.reservation?.driverId ?? null, offerUntil: changes.reservation?.until ?? null } : {}),
        ...(changes.deliveryPhotoId ? { deliveryPhotoId: changes.deliveryPhotoId } : {}),
        ...(changes.deliveredWithoutCode !== undefined ? { deliveredWithoutCode: changes.deliveredWithoutCode } : {}),
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
