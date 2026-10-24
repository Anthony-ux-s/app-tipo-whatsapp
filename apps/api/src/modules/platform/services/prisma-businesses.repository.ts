import { Injectable } from '@nestjs/common';
import type { CatalogSource, ServiceId, StoreIntegrationFormat, StoreStatus, UpdateBusinessRequest } from '@parla/types';
import type { Business as BusinessRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { open, seal } from '../../../kernel/secret-box';
import type { BusinessesRepository, BusinessRecord, ConnectorLink, NewBusiness, StoreApiConfig, StoreFilter } from './businesses.repository';

export function toBusinessRecord(row: BusinessRow): BusinessRecord {
  return {
    id: row.id,
    name: row.name,
    service: row.service as ServiceId,
    description: row.description,
    ownerId: row.ownerId,
    address: row.address,
    location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    status: row.status as StoreStatus,
    reviewNote: row.reviewNote,
    source: row.source as CatalogSource,
    acceptingOrders: row.acceptingOrders,
    opensAt: row.opensAt,
    closesAt: row.closesAt,
    createdAt: row.createdAt,
    bigOrderCents: row.bigOrderCents,
    bigOrderUnits: row.bigOrderUnits,
    adminWhatsapp: row.adminWhatsapp,
    payoutPhone: row.payoutPhone,
    // Las llaves viven cifradas en la base: aquí se abren para usarlas.
    api: { format: row.apiFormat as StoreIntegrationFormat, baseUrl: row.apiBaseUrl, prefix: row.apiPrefix, apiKey: open(row.apiKey), adminKey: open(row.apiAdminKey) },
    connector:
      row.connector === 'ferrohub'
        ? { kind: 'ferrohub', origin: row.connectorOrigin === 'provision' ? 'provision' : 'code', tenantId: row.connectorTenant, webhookSecret: open(row.connectorSecret), connectedAt: row.connectedAt ?? row.createdAt, verifiedAt: row.verifiedAt }
        : null,
  };
}

@Injectable()
export class PrismaBusinessesRepository implements BusinessesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<BusinessRecord | null> {
    const row = await this.prisma.business.findUnique({ where: { id } });
    return row ? toBusinessRecord(row) : null;
  }

  async findByOwner(ownerId: string): Promise<BusinessRecord | null> {
    const row = await this.prisma.business.findUnique({ where: { ownerId } });
    return row ? toBusinessRecord(row) : null;
  }

  async create(input: NewBusiness): Promise<BusinessRecord> {
    const { location, ...rest } = input;
    const row = await this.prisma.business.create({ data: { ...rest, lat: location?.lat ?? null, lng: location?.lng ?? null, status: 'pending', source: 'native' } });
    return toBusinessRecord(row);
  }

  async update(id: string, changes: UpdateBusinessRequest): Promise<BusinessRecord> {
    const { location, ...rest } = changes;
    const data = { ...rest, ...(location !== undefined ? { lat: location?.lat ?? null, lng: location?.lng ?? null } : {}) };
    return toBusinessRecord(await this.prisma.business.update({ where: { id }, data }));
  }

  async setReview(id: string, review: { status: StoreStatus; reviewNote: string; reviewedById: string }): Promise<BusinessRecord> {
    return toBusinessRecord(await this.prisma.business.update({ where: { id }, data: { ...review, reviewedAt: new Date() } }));
  }

  async setSource(id: string, source: CatalogSource, api: StoreApiConfig): Promise<BusinessRecord> {
    const data = { source, apiFormat: api.format, apiBaseUrl: api.baseUrl, apiPrefix: api.prefix, apiKey: seal(api.apiKey), apiAdminKey: seal(api.adminKey) };
    return toBusinessRecord(await this.prisma.business.update({ where: { id }, data }));
  }

  async setConnector(id: string, link: ConnectorLink | null): Promise<BusinessRecord> {
    const data = link
      ? { connector: link.kind, connectorOrigin: link.origin, connectorTenant: link.tenantId, connectorSecret: seal(link.webhookSecret), connectedAt: link.connectedAt, verifiedAt: link.verifiedAt }
      : { connector: '', connectorOrigin: '', connectorTenant: '', connectorSecret: '', connectedAt: null, verifiedAt: null };
    return toBusinessRecord(await this.prisma.business.update({ where: { id }, data }));
  }

  async setBigOrderRules(id: string, rules: { totalCents: number | null; units: number | null; whatsapp: string }): Promise<BusinessRecord> {
    return toBusinessRecord(await this.prisma.business.update({ where: { id }, data: { bigOrderCents: rules.totalCents, bigOrderUnits: rules.units, adminWhatsapp: rules.whatsapp } }));
  }

  async setPayoutPhone(id: string, phone: string): Promise<void> {
    await this.prisma.business.update({ where: { id }, data: { payoutPhone: phone } });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.business.delete({ where: { id } });
  }

  async list(filter: StoreFilter): Promise<BusinessRecord[]> {
    const rows = await this.prisma.business.findMany({
      where: { ...(filter.service ? { service: filter.service } : {}), ...(filter.status ? { status: filter.status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    return rows.map(toBusinessRecord);
  }

  async countApprovedByService(): Promise<Record<string, number>> {
    const groups = await this.prisma.business.groupBy({ by: ['service'], where: { status: 'approved' }, _count: { _all: true } });
    return Object.fromEntries(groups.map((g) => [g.service, g._count._all]));
  }
}
