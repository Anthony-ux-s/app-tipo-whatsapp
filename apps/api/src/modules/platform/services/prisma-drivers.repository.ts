import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { DriverRecord, DriversRepository } from './drivers.repository';

@Injectable()
export class PrismaDriversRepository implements DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<DriverRecord | null> {
    const row = await this.prisma.driver.findUnique({ where: { userId } });
    return row ? { userId: row.userId, vehicle: row.vehicle, plate: row.plate } : null;
  }

  async listUserIds(): Promise<string[]> {
    const rows = await this.prisma.driver.findMany({ where: { user: { deletedAt: null } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }
}
