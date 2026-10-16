import type { PresenceStatus, ThemePreference } from './enums.types';

/** Clave privada ECDH cifrada con la contraseña del usuario (el servidor nunca la ve en claro). */
export interface EncryptedKeyBackup {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
}

export interface UserPreferences {
  theme: ThemePreference;
  enterToSend: boolean;
  notificationSound: boolean;
}

export interface UserProfile {
  id: string;
  username: string | null;
  phone: string | null;
  displayName: string;
  about: string;
  avatarColor: string;
  presence: PresenceStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string | null;
  displayName: string;
  about: string;
  avatarColor: string;
  presence: PresenceStatus;
  lastSeenAt: string | null;
  /** Clave pública ECDH en formato JWK serializado. */
  publicKey: string;
}

export interface SessionUser extends UserProfile {
  preferences: UserPreferences;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
}

export interface RegisterRequest {
  /** Teléfono en formato internacional (+57...) o nombre de usuario; al menos uno. */
  phone?: string;
  username?: string;
  displayName: string;
  password: string;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
}

export interface LoginRequest {
  /** Teléfono o nombre de usuario. */
  identifier: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: SessionUser;
}

export interface UpdateProfileRequest {
  displayName?: string;
  about?: string;
  avatarColor?: string;
  preferences?: Partial<UserPreferences>;
}
