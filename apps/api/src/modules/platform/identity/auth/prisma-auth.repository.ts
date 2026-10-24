import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../infra/prisma/prisma.service';
import { toUserRecord } from '../../../../infra/prisma/user-row';
import type { UserRecord } from '../user.record';
import { DELETED_ACCOUNT } from '../../../../kernel/legal';
import type { AccountData, AuthRepository, NewUser, ProfileChanges } from './auth.repository';

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

  async findByVerifiedEmail(email: string): Promise<UserRecord | null> {
    const row = await this.prisma.user.findFirst({ where: { email, emailVerifiedAt: { not: null }, deletedAt: null } });
    return row ? toUserRecord(row) : null;
  }

  async findActiveByPhones(phones: string[]): Promise<UserRecord[]> {
    if (phones.length === 0) return [];
    const rows = await this.prisma.user.findMany({ where: { phone: { in: phones }, deletedAt: null } });
    return rows.map(toUserRecord);
  }

  async findActiveByIds(ids: string[]): Promise<UserRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.user.findMany({ where: { id: { in: ids }, deletedAt: null } });
    return rows.map(toUserRecord);
  }

  async listAdminIds(): Promise<string[]> {
    const rows = await this.prisma.user.findMany({ where: { isAdmin: true, deletedAt: null, blockedAt: null }, select: { id: true } });
    return rows.map((r) => r.id);
  }

  async searchDirectory(excludeId: string, query: string, limit: number): Promise<UserRecord[]> {
    const q = query.trim();
    const digits = q.replace(/\D/g, '');
    const rows = await this.prisma.user.findMany({
      where: {
        id: { not: excludeId },
        deletedAt: null,
        ...(q
          ? {
              OR: [
                { displayName: { contains: q, mode: 'insensitive' } },
                { username: { contains: q.replace(/^@/, '').toLowerCase(), mode: 'insensitive' } },
                ...(digits.length >= 3 ? [{ phone: { contains: digits } }] : []),
              ],
            }
          : {}),
      },
      orderBy: { displayName: 'asc' },
      take: limit,
    });
    return rows.map(toUserRecord);
  }

  async contactIds(userId: string): Promise<string[]> {
    const rows = await this.prisma.conversationParticipant.findMany({
      where: { conversation: { participants: { some: { userId } } }, userId: { not: userId } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
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
    const { preferences, keyBackup, ...rest } = changes;
    const row = await this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(preferences ? { preferences: JSON.stringify(preferences) } : {}),
        ...(keyBackup ? { keyBackup: JSON.stringify(keyBackup) } : {}),
      },
    });
    return toUserRecord(row);
  }

  async touchLastSeen(id: string, at: Date): Promise<void> {
    await this.prisma.user.updateMany({ where: { id }, data: { lastSeenAt: at } });
  }

  /**
   * Se borran nombre, usuario, teléfono, contraseña y respaldo de claves; la persona sale de todos sus
   * espacios y chats. La clave pública se conserva: los demás la necesitan para seguir descifrando las
   * claves de conversación que esta persona envolvió para ellos.
   */
  async anonymize(id: string, at: Date): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.pushSubscription.deleteMany({ where: { userId: id } }),
      this.prisma.messageReceipt.deleteMany({ where: { userId: id } }),
      this.prisma.messageMention.deleteMany({ where: { userId: id } }),
      this.prisma.conversationParticipant.deleteMany({ where: { userId: id } }),
      this.prisma.user.update({
        where: { id },
        data: {
          ...DELETED_ACCOUNT,
          username: null,
          phone: null,
          phoneVerifiedAt: null,
          email: null,
          emailVerifiedAt: null,
          avatarFileId: null,
          passwordHash: '!',
          keyBackup: JSON.stringify({ ciphertext: '', iv: '', salt: '', iterations: 0 }),
          preferences: '{}',
          lastSeenAt: null,
          deletedAt: at,
        },
      }),
    ]);
  }

  async exportData(id: string): Promise<AccountData> {
    const [participants, messagesSent, ordersPlaced] = await Promise.all([
      this.prisma.conversationParticipant.findMany({
        where: { userId: id },
        include: {
          conversation: {
            select: { kind: true, title: true, participants: { select: { user: { select: { id: true, displayName: true } } } } },
          },
        },
      }),
      this.prisma.message.count({ where: { senderId: id, kind: { not: 'system' } } }),
      this.prisma.order.count({ where: { userId: id } }),
    ]);
    return {
      conversations: participants.map((p) => ({
        kind: p.conversation.kind,
        title:
          p.conversation.kind === 'direct'
            ? (p.conversation.participants.find((x) => x.user.id !== id)?.user.displayName ?? 'Chat')
            : p.conversation.title,
        joinedAt: p.joinedAt,
      })),
      messagesSent,
      ordersPlaced,
    };
  }
}
