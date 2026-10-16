import { Injectable } from '@nestjs/common';
import type { PaidPlanId, PaymentProvider, PaymentStatus } from '@parla/types';
import type { Payment } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { NewPayment, PaymentRow, PaymentsRepository } from './payments.repository';

function toRow(row: Payment): PaymentRow {
  return {
    ...row,
    plan: row.plan as PaidPlanId,
    status: row.status as PaymentStatus,
    provider: row.provider as PaymentProvider,
  };
}

@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewPayment): Promise<PaymentRow> {
    return toRow(await this.prisma.payment.create({ data: input }));
  }

  async attachCheckout(id: string, checkoutUrl: string, providerRef: string | null): Promise<void> {
    await this.prisma.payment.update({ where: { id }, data: { checkoutUrl, providerRef } });
  }

  async findById(id: string): Promise<PaymentRow | null> {
    const row = await this.prisma.payment.findUnique({ where: { id } });
    return row ? toRow(row) : null;
  }

  async settle(id: string, status: Exclude<PaymentStatus, 'pending'>, providerRef: string, at: Date): Promise<boolean> {
    const result = await this.prisma.payment.updateMany({
      where: { id, status: 'pending' },
      data: { status, providerRef, paidAt: status === 'approved' ? at : null },
    });
    return result.count === 1;
  }

  async listForWorkspace(workspaceId: string, take: number): Promise<PaymentRow[]> {
    const rows = await this.prisma.payment.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take });
    return rows.map(toRow);
  }
}
