import type { EncryptedKeyBackup, UserPreferences } from '@parla/types';
import type { UserRecord } from '../user.record';

export interface NewUser {
  phone: string;
  phoneVerifiedAt: Date;
  username: string | null;
  displayName: string;
  avatarColor: string;
  passwordHash: string;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
  preferences: UserPreferences;
  termsVersion: string;
  termsAcceptedAt: Date;
}

export interface ProfileChanges {
  displayName?: string;
  /** null quita el nombre de usuario. */
  username?: string | null;
  email?: string;
  emailVerifiedAt?: Date;
  avatarFileId?: string | null;
  passwordHash?: string;
  publicKey?: string;
  keyBackup?: EncryptedKeyBackup;
  about?: string;
  avatarColor?: string;
  preferences?: UserPreferences;
}

export interface AuthRepository {
  findById(id: string): Promise<UserRecord | null>;
  findByPhone(phone: string): Promise<UserRecord | null>;
  findByUsername(username: string): Promise<UserRecord | null>;
  /** Solo cuentas con ese correo ya verificado. */
  findByVerifiedEmail(email: string): Promise<UserRecord | null>;
  /** Cuentas activas con alguno de esos teléfonos (para cruzar la libreta de contactos). */
  findActiveByPhones(phones: string[]): Promise<UserRecord[]>;
  /** Cuentas activas con esos ids (las eliminadas no aparecen). */
  findActiveByIds(ids: string[]): Promise<UserRecord[]>;
  /** Directorio de Parla: cuentas activas por nombre, usuario o teléfono, sin incluir a quien busca. */
  searchDirectory(excludeId: string, query: string, limit: number): Promise<UserRecord[]>;
  /** Personas con las que comparte al menos un chat (a quienes les importa su presencia). */
  contactIds(userId: string): Promise<string[]>;
  create(user: NewUser): Promise<UserRecord>;
  update(id: string, changes: ProfileChanges): Promise<UserRecord>;
  touchLastSeen(id: string, at: Date): Promise<void>;
  /** Borra los datos personales y deja la cuenta inutilizable (ver DeleteAccountUseCase). */
  anonymize(id: string, at: Date): Promise<void>;
  /** Datos de la cuenta para la exportación (derecho de acceso). */
  exportData(id: string): Promise<AccountData>;
}

export interface AccountData {
  conversations: { title: string; kind: string; joinedAt: Date }[];
  messagesSent: number;
  tasksCreated: number;
  tasksAssigned: number;
  ordersPlaced: number;
}

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');
