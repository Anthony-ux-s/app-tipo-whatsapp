import { Injectable } from '@nestjs/common';
import type { VerificationCode } from '@prisma/client';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import type { VerificationChannel, VerificationPurpose } from '../../../../kernel/verification-rules';
import type { NewVerification, VerificationCodesRepository, VerificationRecord } from './verification-codes.repository';

const toRecord = (row: VerificationCode): VerificationRecord => ({
  ...row,
  channel: row.channel as VerificationChannel,
  purpose: row.purpose as VerificationPurpose,
});

@Injectable()
export class PrismaVerificationCodesRepository implements VerificationCodesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(input: NewVerification): Promise<VerificationRecord> {
    return toRecord(await this.prisma.verificationCode.create({ data: input }));
  }

  async listRecent(target: string, purpose: VerificationPurpose, since: Date): Promise<VerificationRecord[]> {
    const rows = await this.prisma.verificationCode.findMany({ where: { target, purpose, createdAt: { gte: since } } });
    return rows.map(toRecord);
  }

  async findLatestPending(query: { purpose: VerificationPurpose; target?: string; userId?: string }): Promise<VerificationRecord | null> {
    const row = await this.prisma.verificationCode.findFirst({
      where: { purpose: query.purpose, verifiedAt: null, ...(query.target ? { target: query.target } : {}), ...(query.userId ? { userId: query.userId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return row ? toRecord(row) : null;
  }

  async countAttempt(id: string): Promise<void> {
    await this.prisma.verificationCode.update({ where: { id }, data: { attempts: { increment: 1 } } });
  }

  async markVerified(id: string, proofHash: string, at: Date): Promise<void> {
    await this.prisma.verificationCode.update({ where: { id }, data: { verifiedAt: at, proofHash } });
  }

  async findByProof(proofHash: string): Promise<VerificationRecord | null> {
    const row = await this.prisma.verificationCode.findFirst({ where: { proofHash } });
    return row ? toRecord(row) : null;
  }

  async consume(id: string, at: Date): Promise<boolean> {
    const { count } = await this.prisma.verificationCode.updateMany({ where: { id, consumedAt: null }, data: { consumedAt: at } });
    return count === 1;
  }
}
