import { Injectable } from '@nestjs/common';
import { Prisma, type StoreLedgerEntry as EntryRow } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { StoreLedgerEntryRecord, StoreLedgerRepository } from './store-ledger.repository';

function toRecord(row: EntryRow): StoreLedgerEntryRecord {
  return {
    id: row.id,
    businessId: row.businessId,
    orderId: row.orderId,
    kind: row.kind as StoreLedgerEntryRecord['kind'],
    amountCents: row.amountCents,
    status: row.status as StoreLedgerEntryRecord['status'],
    transferId: row.transferId,
    failureReason: row.failureReason,
    reason: row.reason as StoreLedgerEntryRecord['reason'],
    createdAt: row.createdAt,
  };
}

/** Los movimientos que cuentan para el saldo: todo menos los depósitos que fallaron. */
const COUNTS = { status: { not: 'failed' } } as const;

@Injectable()
export class PrismaStoreLedgerRepository implements StoreLedgerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async recordSale(e: { businessId: string; orderId: string; saleCents: number; commissionCents: number }): Promise<boolean> {
    const rows = [
      { kind: 'sale', amountCents: e.saleCents },
      ...(e.commissionCents > 0 ? [{ kind: 'commission', amountCents: -e.commissionCents }] : []),
    ].map((r) => ({ ...r, businessId: e.businessId, orderId: e.orderId }));
    try {
      await this.prisma.$transaction(rows.map((data) => this.prisma.storeLedgerEntry.create({ data })));
      return true;
    } catch (error) {
      // Ya estaba anotada (único por pedido y tipo): un aviso repetido no suma dos veces.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return false;
      throw error;
    }
  }

  async balance(businessId: string) {
    const [all, pending] = await Promise.all([
      this.prisma.storeLedgerEntry.aggregate({ where: { businessId, ...COUNTS }, _sum: { amountCents: true } }),
      this.prisma.storeLedgerEntry.aggregate({ where: { businessId, kind: 'payout', status: 'pending' }, _sum: { amountCents: true } }),
    ]);
    return { availableCents: all._sum.amountCents ?? 0, pendingPayoutCents: 0 - (pending._sum.amountCents ?? 0) };
  }

  async list(businessId: string, limit: number): Promise<StoreLedgerEntryRecord[]> {
    const rows = await this.prisma.storeLedgerEntry.findMany({ where: { businessId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit });
    return rows.map(toRecord);
  }

  async reservePayout(businessId: string, minCents: number, reason: 'manual' | 'auto') {
    return this.prisma.$transaction(async (tx) => {
      const pending = await tx.storeLedgerEntry.count({ where: { businessId, kind: 'payout', status: 'pending' } });
      if (pending > 0) return 'pending' as const;
      const { _sum } = await tx.storeLedgerEntry.aggregate({ where: { businessId, ...COUNTS }, _sum: { amountCents: true } });
      const available = _sum.amountCents ?? 0;
      if (available < minCents) return 'no_balance' as const;
      const row = await tx.storeLedgerEntry.create({
        data: { id: `sp_${randomUUID().replace(/-/g, '').slice(0, 20)}`, businessId, kind: 'payout', amountCents: -available, status: 'pending', reason },
      });
      return toRecord(row);
    });
  }

  async findPayout(id: string): Promise<StoreLedgerEntryRecord | null> {
    const row = await this.prisma.storeLedgerEntry.findFirst({ where: { id, kind: 'payout' } });
    return row ? toRecord(row) : null;
  }

  async settlePayout(id: string, status: 'paid' | 'failed', transferId: string | null, failureReason: string | null) {
    const { count } = await this.prisma.storeLedgerEntry.updateMany({
      where: { id, kind: 'payout', status: 'pending' },
      data: { status, transferId, failureReason, settledAt: new Date() },
    });
    return count === 1 ? this.findPayout(id) : null;
  }

  async stuckPayouts(before: Date): Promise<StoreLedgerEntryRecord[]> {
    const rows = await this.prisma.storeLedgerEntry.findMany({ where: { kind: 'payout', status: 'pending', createdAt: { lt: before } }, orderBy: { createdAt: 'asc' } });
    return rows.map(toRecord);
  }

  async duePayouts(minCents: number): Promise<string[]> {
    const stores = await this.prisma.business.findMany({ where: { payoutPhone: { not: '' } }, select: { id: true } });
    const due: string[] = [];
    for (const { id } of stores) {
      const pending = await this.prisma.storeLedgerEntry.count({ where: { businessId: id, kind: 'payout', status: 'pending' } });
      if (pending > 0) continue;
      const { availableCents } = await this.balance(id);
      if (availableCents >= minCents) due.push(id);
    }
    return due;
  }
}
