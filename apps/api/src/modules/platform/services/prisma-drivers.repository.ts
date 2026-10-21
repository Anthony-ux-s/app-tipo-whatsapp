import { Injectable } from '@nestjs/common';
import type { DriverStatus, DriverVehicle, GeoPoint } from '@parla/types';
import type { Driver as DriverRow } from '@prisma/client';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import type { DriverChanges, DriverRecord, DriverRegistration, DriversRepository } from './drivers.repository';

function toDriverRecord(row: DriverRow): DriverRecord {
  return {
    userId: row.userId,
    vehicle: row.vehicle as DriverVehicle,
    plate: row.plate,
    online: row.online,
    active: row.active,
    status: row.status as DriverStatus,
    dniNumber: row.dniNumber,
    licenseNumber: row.licenseNumber,
    documentPhotoId: row.documentPhotoId,
    reviewNote: row.reviewNote,
    payoutPhone: row.payoutPhone,
    location: row.lastLat !== null && row.lastLng !== null && row.lastLocationAt ? { lat: row.lastLat, lng: row.lastLng, at: row.lastLocationAt } : null,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class PrismaDriversRepository implements DriversRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByUser(userId: string): Promise<DriverRecord | null> {
    const row = await this.prisma.driver.findUnique({ where: { userId } });
    return row ? toDriverRecord(row) : null;
  }

  async listOnline(): Promise<DriverRecord[]> {
    const rows = await this.prisma.driver.findMany({ where: { active: true, online: true, status: 'approved', user: { deletedAt: null } } });
    return rows.map(toDriverRecord);
  }

  async register(userId: string, r: DriverRegistration): Promise<DriverRecord> {
    const existing = await this.prisma.driver.findUnique({ where: { userId }, select: { status: true } });
    const status = existing?.status === 'approved' ? 'approved' : 'pending';
    const data = { vehicle: r.vehicle, plate: r.plate, dniNumber: r.dniNumber, licenseNumber: r.licenseNumber, active: true, online: false, status, reviewNote: null };
    return toDriverRecord(await this.prisma.driver.upsert({ where: { userId }, create: { userId, ...data }, update: data }));
  }

  async update(userId: string, changes: DriverChanges): Promise<DriverRecord> {
    const data = { ...changes, ...(changes.status && changes.status !== 'pending' ? { reviewedAt: new Date() } : {}) };
    return toDriverRecord(await this.prisma.driver.update({ where: { userId }, data }));
  }

  async saveLocation(userId: string, point: GeoPoint, at: Date): Promise<void> {
    await this.prisma.driver.update({ where: { userId }, data: { lastLat: point.lat, lastLng: point.lng, lastLocationAt: at } });
  }

  async listByStatus(status: DriverStatus, limit: number): Promise<DriverRecord[]> {
    const rows = await this.prisma.driver.findMany({ where: { status, active: true }, orderBy: { createdAt: 'asc' }, take: limit });
    return rows.map(toDriverRecord);
  }
}
