import type { EncryptedKeyBackup, UserPreferences } from '@parla/types';

/** Usuario tal como lo ven los casos de uso (sin tipos de Prisma). */
export interface UserRecord {
  id: string;
  username: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  /** Correo verificado (para restablecer la contraseña). */
  email: string | null;
  emailVerifiedAt: Date | null;
  avatarFileId: string | null;
  displayName: string;
  about: string;
  avatarColor: string;
  passwordHash: string;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
  preferences: UserPreferences;
  lastSeenAt: Date | null;
  createdAt: Date;
  termsVersion: string | null;
  termsAcceptedAt: Date | null;
  deletedAt: Date | null;
  /** Soporte de Parla (aprueba repartidores y resuelve reclamos). */
  isAdmin: boolean;
  /** Suspendida por soporte: no puede entrar. */
  blockedAt: Date | null;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  enterToSend: true,
  notificationSound: true,
  chatEffects: true,
  chatFontSize: 'medium',
  chatFont: 'inter',
};
