import type { EncryptedKeyBackup, UserPreferences } from '@parla/types';
import type { UserRecord } from '../user.record';

export interface NewUser {
  phone: string | null;
  username: string | null;
  displayName: string;
  avatarColor: string;
  passwordHash: string;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
  preferences: UserPreferences;
}

export interface ProfileChanges {
  displayName?: string;
  about?: string;
  avatarColor?: string;
  preferences?: UserPreferences;
}

export interface AuthRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByPhone(phone: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  create(user: NewUser): Promise<UserRecord>;
  update(id: string, changes: ProfileChanges): Promise<UserRecord>;
  touchLastSeen(id: string, at: Date): Promise<void>;
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');
