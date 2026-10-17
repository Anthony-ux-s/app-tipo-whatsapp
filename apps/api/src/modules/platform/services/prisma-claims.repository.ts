import { Injectable } from '@nestjs/common';
import type { ClaimReason, ClaimStatus } from '@parla/types';
import type { Claim as ClaimRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { ClaimChanges, ClaimRecord, ClaimsRepository, NewClaim } from './claims.repository';

export function toClaimRecord(row: ClaimRow): ClaimRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    userId: row.userId,
    reason: row.reason as ClaimReason,
    comment: row.comment,
    items: JSON.parse(row.items),
    photoId: row.photoId,
    suggestedCents: row.suggestedCents,
    status: row.status as ClaimStatus,
    refundCents: row.refundCents,
    refundRef: row.refundRef,
    providerRefundId: row.providerRefundId,
    resolutionNote: row.resolutionNote,
    resolvedById: row.resolvedById,
    createdAt: row.createdAt,
    resolvedAt: row.resolvedAt,
  };
}

@Injectable()
export class PrismaClaimsRepository implements ClaimsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(claim: NewClaim): Promise<ClaimRecord> {
    return toClaimRecord(await this.prisma.claim.create({ data: { ...claim, items: JSON.stringify(claim.items) } }));
  }

  async findById(id: string): Promise<ClaimRecord | null> {
    const row = await this.prisma.claim.findUnique({ where: { id } });
    return row ? toClaimRecord(row) : null;
  }

  async listByStatus(statuses: ClaimStatus[], limit: number): Promise<ClaimRecord[]> {
    const rows = await this.prisma.claim.findMany({ where: { status: { in: statuses } }, orderBy: { createdAt: 'asc' }, take: limit });
    return rows.map(toClaimRecord);
  }

  async updateIfStatus(id: string, expected: ClaimStatus, changes: ClaimChanges): Promise<ClaimRecord | null> {
    const { count } = await this.prisma.claim.updateMany({ where: { id, status: expected }, data: changes });
    return count === 1 ? this.findById(id) : null;
  }
}
