import { Injectable } from '@nestjs/common';
import type { IntegrableService, IntegrationFormat } from '@parla/types';
import type { ServiceIntegration as IntegrationRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { IntegrationChanges, IntegrationRecord, IntegrationsRepository } from './integrations.repository';

function toRecord(service: IntegrableService, row: IntegrationRow | null): IntegrationRecord {
  return {
    service,
    name: row?.name ?? '',
    format: (row?.format === 'redwiiil' ? 'redwiiil' : 'parla') as IntegrationFormat,
    enabled: row?.enabled ?? false,
    baseUrl: row?.baseUrl ?? '',
    prefix: row?.prefix ?? '',
    apiKey: row?.apiKey ?? '',
    adminKey: row?.adminKey ?? '',
    updatedAt: row?.updatedAt ?? null,
    updatedById: row?.updatedById ?? null,
  };
}

@Injectable()
export class PrismaIntegrationsRepository implements IntegrationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async get(service: IntegrableService): Promise<IntegrationRecord> {
    return toRecord(service, await this.prisma.serviceIntegration.findUnique({ where: { service } }));
  }

  async save(service: IntegrableService, changes: IntegrationChanges, adminId: string): Promise<IntegrationRecord> {
    const data = { ...changes, updatedById: adminId };
    const row = await this.prisma.serviceIntegration.upsert({ where: { service }, create: { service, ...data }, update: data });
    return toRecord(service, row);
  }
}
