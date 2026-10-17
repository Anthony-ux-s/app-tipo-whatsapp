import { Injectable } from '@nestjs/common';
import type { Currency, OrderStatus, ServiceId } from '@parla/types';
import type { Order as OrderRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { NewOrder, OrderChanges, OrderRecord, OrdersRepository } from './orders.repository';

function toOrderRecord(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    userId: row.userId,
    service: row.service as ServiceId,
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
    });
    return toOrderRecord(row);
  }

  async findById(id: string): Promise<OrderRecord | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? toOrderRecord(row) : null;
  }

  async listForUser(userId: string, limit: number): Promise<OrderRecord[]> {
    const rows = await this.prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: limit });
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
