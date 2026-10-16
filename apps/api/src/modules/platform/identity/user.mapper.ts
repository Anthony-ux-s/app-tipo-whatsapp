import type { PresenceStatus, PublicUser, SessionUser } from '@parla/types';
import type { UserRecord } from './user.record';

/** Único lugar donde un usuario se convierte en contrato público o de sesión. */
export function toPublicUser(user: UserRecord, presence: PresenceStatus): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    about: user.about,
    avatarColor: user.avatarColor,
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
    displayName: user.displayName,
    about: user.about,
    avatarColor: user.avatarColor,
    presence,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
    preferences: user.preferences,
    publicKey: user.publicKey,
    keyBackup: user.keyBackup,
  };
}
