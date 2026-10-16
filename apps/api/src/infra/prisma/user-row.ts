import type { User } from '@prisma/client';
import { DEFAULT_PREFERENCES, type UserRecord } from '../../modules/platform/identity/user.record';

/** Fila Prisma → UserRecord. Solo la usan los adaptadores Prisma. */
export function toUserRecord(row: User): UserRecord {
  return {
    id: row.id,
    username: row.username,
    phone: row.phone,
    displayName: row.displayName,
    about: row.about,
    avatarColor: row.avatarColor,
    passwordHash: row.passwordHash,
    publicKey: row.publicKey,
    keyBackup: JSON.parse(row.keyBackup),
    preferences: { ...DEFAULT_PREFERENCES, ...JSON.parse(row.preferences) },
    lastSeenAt: row.lastSeenAt,
    createdAt: row.createdAt,
    termsVersion: row.termsVersion,
    termsAcceptedAt: row.termsAcceptedAt,
    deletedAt: row.deletedAt,
  };
}
