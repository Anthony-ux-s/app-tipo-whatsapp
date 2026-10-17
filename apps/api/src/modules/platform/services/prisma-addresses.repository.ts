import { Injectable } from '@nestjs/common';
import type { DeliveryAddress, SavedAddress } from '@parla/types';
import type { SavedAddress as AddressRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { AddressesRepository } from './addresses.repository';

function toSavedAddress(row: AddressRow): SavedAddress {
  return {
    id: row.id,
    label: row.label,
    line: row.line,
    reference: row.reference,
    location: row.lat !== null && row.lng !== null ? { lat: row.lat, lng: row.lng } : null,
    lastUsedAt: row.lastUsedAt.toISOString(),
  };
}

@Injectable()
export class PrismaAddressesRepository implements AddressesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string, limit: number): Promise<SavedAddress[]> {
    const rows = await this.prisma.savedAddress.findMany({ where: { userId }, orderBy: { lastUsedAt: 'desc' }, take: limit });
    return rows.map(toSavedAddress);
  }

  async remember(userId: string, address: DeliveryAddress, at: Date, keep: number): Promise<void> {
    const point = { lat: address.location?.lat ?? null, lng: address.location?.lng ?? null };
    await this.prisma.savedAddress.upsert({
      where: { userId_line: { userId, line: address.line } },
      create: { userId, line: address.line, reference: address.reference, ...point, lastUsedAt: at },
      update: { reference: address.reference, ...(address.location ? point : {}), lastUsedAt: at },
    });
    const old = await this.prisma.savedAddress.findMany({ where: { userId }, orderBy: { lastUsedAt: 'desc' }, skip: keep, select: { id: true } });
    if (old.length) await this.prisma.savedAddress.deleteMany({ where: { id: { in: old.map((a) => a.id) } } });
  }

  async setLabel(userId: string, id: string, label: string): Promise<SavedAddress | null> {
    const { count } = await this.prisma.savedAddress.updateMany({ where: { id, userId }, data: { label } });
    if (!count) return null;
    const row = await this.prisma.savedAddress.findUnique({ where: { id } });
    return row ? toSavedAddress(row) : null;
  }

  async delete(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.savedAddress.deleteMany({ where: { id, userId } });
    return count > 0;
  }
}
