import { Injectable } from '@nestjs/common';
import type { ServiceId } from '@parla/types';
import type { Business as BusinessRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { BusinessesRepository, BusinessRecord } from './businesses.repository';

function toBusinessRecord(row: BusinessRow): BusinessRecord {
  return { id: row.id, name: row.name, service: row.service as ServiceId, ownerId: row.ownerId };
}

@Injectable()
export class PrismaBusinessesRepository implements BusinessesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByService(service: ServiceId): Promise<BusinessRecord | null> {
    const row = await this.prisma.business.findUnique({ where: { service } });
    return row ? toBusinessRecord(row) : null;
  }

  async findByOwner(ownerId: string): Promise<BusinessRecord | null> {
    const row = await this.prisma.business.findUnique({ where: { ownerId } });
    return row ? toBusinessRecord(row) : null;
  }
}
