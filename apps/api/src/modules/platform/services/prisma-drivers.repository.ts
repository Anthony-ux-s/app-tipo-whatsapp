import { Injectable } from '@nestjs/common';
import type { DriverProfileRequest, DriverVehicle, GeoPoint } from '@parla/types';
import type { Driver as DriverRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { DriverRecord, DriversRepository } from './drivers.repository';

function toDriverRecord(row: DriverRow): DriverRecord {
  return {
    userId: row.userId,
    vehicle: row.vehicle as DriverVehicle,
    plate: row.plate,
    online: row.online,
    active: row.active,
    payoutPhone: row.payoutPhone,
    location: row.lastLat !== null && row.lastLng !== null && row.lastLocationAt ? { lat: row.lastLat, lng: row.lastLng, at: row.lastLocationAt } : null,
  };
}

@Injectable()
export class PrismaDriversRepository implements DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<DriverRecord | null> {
    const row = await this.prisma.driver.findUnique({ where: { userId } });
    return row ? toDriverRecord(row) : null;
  }

  async listUserIds(): Promise<string[]> {
    const rows = await this.prisma.driver.findMany({ where: { active: true, online: true, user: { deletedAt: null } }, select: { userId: true } });
    return rows.map((r) => r.userId);
  }

  async register(userId: string, profile: Required<DriverProfileRequest>): Promise<DriverRecord> {
    const data = { vehicle: profile.vehicle, plate: profile.plate, active: true, online: false };
    return toDriverRecord(await this.prisma.driver.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
  }

  async update(userId: string, changes: Partial<Pick<DriverRecord, 'vehicle' | 'plate' | 'online' | 'active' | 'payoutPhone'>>): Promise<DriverRecord> {
    return toDriverRecord(await this.prisma.driver.update({ where: { userId }, data: changes }));
  }

  async saveLocation(userId: string, point: GeoPoint, at: Date): Promise<void> {
    await this.prisma.driver.update({ where: { userId }, data: { lastLat: point.lat, lastLng: point.lng, lastLocationAt: at } });
  }
}
