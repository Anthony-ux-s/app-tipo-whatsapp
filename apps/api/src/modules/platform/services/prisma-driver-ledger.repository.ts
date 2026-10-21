import { Injectable } from '@nestjs/common';
import type { LedgerEntryKind } from '@parla/types';
import { Prisma, type DriverLedgerEntry as EntryRow } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { DriverLedgerRepository, LedgerEntryRecord, LedgerTotals } from './driver-ledger.repository';

function toRecord(row: EntryRow): LedgerEntryRecord {
  return {
    id: row.id,
    driverId: row.driverId,
    orderId: row.orderId,
    kind: row.kind as LedgerEntryKind,
    amountCents: row.amountCents,
    status: row.status as LedgerEntryRecord['status'],
    transferId: row.transferId,
    failureReason: row.failureReason,
    reason: row.reason as LedgerEntryRecord['reason'],
    createdAt: row.createdAt,
  };
}

/** Los movimientos que cuentan para el saldo: todo menos los depósitos que fallaron. */
const COUNTS = { status: { not: 'failed' } } as const;

@Injectable()
export class PrismaDriverLedgerRepository implements DriverLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordDelivery(e: { driverId: string; orderId: string; feeCents: number; commissionCents: number; tipCents: number }): Promise<boolean> {
    const rows = [
      { kind: 'delivery_fee', amountCents: e.feeCents },
      { kind: 'commission', amountCents: -e.commissionCents },
      ...(e.tipCents > 0 ? [{ kind: 'tip', amountCents: e.tipCents }] : []),
    ].map((r) => ({ ...r, driverId: e.driverId, orderId: e.orderId }));
    try {
      await this.prisma.$transaction(rows.map((data) => this.prisma.driverLedgerEntry.create({ data })));
      return true;
    } catch (error) {
      // Ya estaba anotada (único por pedido y tipo): un aviso repetido no suma dos veces.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  async balance(driverId: string) {
    const [all, pending] = await Promise.all([
      this.prisma.driverLedgerEntry.aggregate({ where: { driverId, ...COUNTS }, _sum: { amountCents: true } }),
      this.prisma.driverLedgerEntry.aggregate({ where: { driverId, kind: 'payout', status: 'pending' }, _sum: { amountCents: true } }),
    ]);
    return { availableCents: all._sum.amountCents ?? 0, pendingPayoutCents: 0 - (pending._sum.amountCents ?? 0) };
  }

  async totals(driverId: string, since?: Date): Promise<LedgerTotals> {
    const where = { driverId, kind: { in: ['delivery_fee', 'commission', 'tip'] }, ...(since ? { createdAt: { gte: since } } : {}) };
    const rows = await this.prisma.driverLedgerEntry.groupBy({ by: ['kind'], where, _sum: { amountCents: true }, _count: true });
    const sum = (kind: string) => rows.find((r) => r.kind === kind)?._sum.amountCents ?? 0;
    return {
      netCents: sum('delivery_fee') + sum('commission') + sum('tip'),
      deliveries: rows.find((r) => r.kind === 'delivery_fee')?._count ?? 0,
      tipsCents: sum('tip'),
      commissionCents: -sum('commission'),
    };
  }

  async list(driverId: string, limit: number): Promise<LedgerEntryRecord[]> {
    const rows = await this.prisma.driverLedgerEntry.findMany({ where: { driverId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
    return rows.map(toRecord);
  }

  async reservePayout(driverId: string, minCents: number, reason: 'manual' | 'auto') {
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.driverLedgerEntry.count({ where: { driverId, kind: 'payout', status: 'pending' } });
      if (pending > 0) return 'pending' as const;
      const { _sum } = await tx.driverLedgerEntry.aggregate({ where: { driverId, ...COUNTS }, _sum: { amountCents: true } });
      const available = _sum.amountCents ?? 0;
      if (available < minCents) return 'no_balance' as const;
      const row = await tx.driverLedgerEntry.create({
        data: { id: `po_${randomUUID().replace(/-/g, '').slice(0, 20)}`, driverId, kind: 'payout', amountCents: -available, status: 'pending', reason },
      });
      return toRecord(row);
    });
  }

  async findPayout(id: string): Promise<LedgerEntryRecord | null> {
    const row = await this.prisma.driverLedgerEntry.findFirst({ where: { id, kind: 'payout' } });
    return row ? toRecord(row) : null;
  }

  async settlePayout(id: string, status: 'paid' | 'failed', transferId: string | null, failureReason: string | null) {
    const { count } = await this.prisma.driverLedgerEntry.updateMany({
      where: { id, kind: 'payout', status: 'pending' },
      data: { status, transferId, failureReason, settledAt: new Date() },
    });
    return count === 1 ? this.findPayout(id) : null;
  }

  async stuckPayouts(before: Date): Promise<LedgerEntryRecord[]> {
    const rows = await this.prisma.driverLedgerEntry.findMany({ where: { kind: 'payout', status: 'pending', createdAt: { lt: before } }, orderBy: { createdAt: 'asc' } });
    return rows.map(toRecord);
  }

  async duePayouts(minCents: number): Promise<string[]> {
    const drivers = await this.prisma.driver.findMany({ where: { active: true, payoutPhone: { not: null } }, select: { userId: true } });
    const due: string[] = [];
    for (const { userId } of drivers) {
      const pending = await this.prisma.driverLedgerEntry.count({ where: { driverId: userId, kind: 'payout', status: 'pending' } });
      if (pending > 0) continue;
      const { availableCents } = await this.balance(userId);
      if (availableCents >= minCents) due.push(userId);
    }
    return due;
  }
}
