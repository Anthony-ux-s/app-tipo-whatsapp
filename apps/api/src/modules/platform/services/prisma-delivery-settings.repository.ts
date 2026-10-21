import { Injectable } from '@nestjs/common';
import type { DeliveryPricing } from '@parla/types';
import type { DeliverySettings as SettingsRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { withPricingDefaults } from '../../../kernel/delivery-pricing';
import type { DeliverySettingsRepository, StoredDeliverySettings } from './delivery-settings.repository';

const ID = 'default';
/** La tarifa casi nunca cambia y se lee en cada cotización: se guarda en memoria unos segundos. */
const CACHE_MS = 10_000;

function toSettings(row: SettingsRow | null): StoredDeliverySettings {
  return {
    pricing: withPricingDefaults(row ? (JSON.parse(row.pricing) as Partial<DeliveryPricing>) : null),
    updatedAt: row?.updatedAt ?? null,
    updatedById: row?.updatedById ?? null,
  };
}

@Injectable()
export class PrismaDeliverySettingsRepository implements DeliverySettingsRepository {
  private cached: { value: StoredDeliverySettings; at: number } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async get(): Promise<StoredDeliverySettings> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const value = toSettings(await this.prisma.deliverySettings.findUnique({ where: { id: ID } }));
    this.cached = { value, at: Date.now() };
    return value;
  }

  async save(pricing: DeliveryPricing, adminId: string): Promise<StoredDeliverySettings> {
    const data = { pricing: JSON.stringify(pricing), updatedById: adminId };
    const row = await this.prisma.deliverySettings.upsert({ where: { id: ID }, create: { id: ID, ...data }, update: data });
    const value = toSettings(row);
    this.cached = { value, at: Date.now() };
    return value;
  }
}
