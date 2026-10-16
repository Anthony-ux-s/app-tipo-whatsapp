import type { EncryptedKeyBackup, UserPreferences } from '@parla/types';

/** Usuario tal como lo ven los casos de uso (sin tipos de Prisma). */
export interface UserRecord {
  id: string;
  username: string | null;
  phone: string | null;
  displayName: string;
  about: string;
  avatarColor: string;
  passwordHash: string;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
  preferences: UserPreferences;
  lastSeenAt: Date | null;
  createdAt: Date;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  enterToSend: true,
  notificationSound: true,
};
