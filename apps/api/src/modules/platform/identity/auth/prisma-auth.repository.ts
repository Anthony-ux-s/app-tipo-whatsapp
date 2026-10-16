import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { toUserRecord } from '../../../../infra/prisma/user-row';
import type { UserRecord } from '../user.record';
import type { AuthRepository, NewUser, ProfileChanges } from './auth.repository';

@Injectable()
export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { id } });
    return row ? toUserRecord(row) : null;
  }

  async findByPhone(phone: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { phone } });
    return row ? toUserRecord(row) : null;
  }

  async findByUsername(username: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findUnique({ where: { username } });
    return row ? toUserRecord(row) : null;
  }

  async create(user: NewUser): Promise<UserRecord> {
    const row = await this.prisma.user.create({
      data: {
        ...user,
        keyBackup: JSON.stringify(user.keyBackup),
        preferences: JSON.stringify(user.preferences),
      },
    });
    return toUserRecord(row);
  }

  async update(id: string, changes: ProfileChanges): Promise<UserRecord> {
    const { preferences, ...rest } = changes;
    const row = await this.prisma.user.update({
      where: { id },
      data: { ...rest, ...(preferences ? { preferences: JSON.stringify(preferences) } : {}) },
    });
    return toUserRecord(row);
  }

  async touchLastSeen(id: string, at: Date): Promise<void> {
    await this.prisma.user.updateMany({ where: { id }, data: { lastSeenAt: at } });
  }
}
