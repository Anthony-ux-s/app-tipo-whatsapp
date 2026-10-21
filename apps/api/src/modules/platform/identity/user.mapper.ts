import type { PresenceStatus, PublicUser, SessionUser } from '@parla/types';
import type { UserRecord } from './user.record';

/** Las fotos se sirven por una URL impredecible (como las de WhatsApp Web), sin sesión: van en <img>. */
export function avatarUrlOf(user: Pick<UserRecord, 'avatarFileId'>): string | null {
  return user.avatarFileId ? `/api/avatars/${user.avatarFileId}` : null;
}

/** Único lugar donde un usuario se convierte en contrato público o de sesión. */
export function toPublicUser(user: UserRecord, presence: PresenceStatus): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    about: user.about,
    avatarColor: user.avatarColor,
    avatarUrl: avatarUrlOf(user),
    presence,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    publicKey: user.publicKey,
  };
}

export function toSessionUser(user: UserRecord, presence: PresenceStatus): SessionUser {
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    email: user.emailVerifiedAt ? user.email : null,
    displayName: user.displayName,
    about: user.about,
    avatarColor: user.avatarColor,
    avatarUrl: avatarUrlOf(user),
    presence,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    preferences: user.preferences,
    publicKey: user.publicKey,
    keyBackup: user.keyBackup,
    isAdmin: user.isAdmin,
  };
}
