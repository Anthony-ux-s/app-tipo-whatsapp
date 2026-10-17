import { Injectable } from '@nestjs/common';
import type { Currency, OrderStatus, ServiceId } from '@parla/types';
import type { Business as BusinessRow, Order as OrderRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { NewOrder, OrderChanges, OrderRecord, OrdersRepository } from './orders.repository';

type OrderWithBusiness = OrderRow & { business: BusinessRow | null };

const WITH_BUSINESS = { business: true } as const;

/** Pedidos que el negocio ve: todo menos los que aún esperan el pago o se vencieron sin pagar. */
const VISIBLE_TO_BUSINESS: OrderStatus[] = ['paid', 'preparing', 'rejected', 'searching_driver', 'on_the_way', 'delivered', 'cancelled'];

function toOrderRecord(row: OrderWithBusiness): OrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    service: row.service as ServiceId,
    business: row.business ? { id: row.business.id, name: row.business.name, ownerId: row.business.ownerId } : null,
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
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaOrdersRepository implements OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(order: NewOrder): Promise<OrderRecord> {
    const row = await this.prisma.order.create({
      data: {
        ...order,
        lines: JSON.stringify(order.lines),
        address: JSON.stringify(order.address),
        payment: JSON.stringify(order.payment),
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

  async updateIfStatus(id: string, expected: OrderStatus, changes: OrderChanges): Promise<OrderRecord | null> {
    const { count } = await this.prisma.order.updateMany({
      where: { id, status: expected },
      data: {
        status: changes.status,
        ...(changes.payment ? { payment: JSON.stringify(changes.payment) } : {}),
        ...(changes.delivery ? { delivery: JSON.stringify(changes.delivery) } : {}),
      },
    });
    return count === 1 ? this.findById(id) : null;
  }
}
