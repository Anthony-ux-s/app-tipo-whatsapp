/** Enums de la base de datos, como uniones de literales (coinciden 1:1 con el esquema Prisma). */

export type WorkspaceRole = 'admin' | 'member';
export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['admin', 'member'];

export type ConversationKind = 'direct' | 'group';

export type MessageKind = 'text' | 'image' | 'audio' | 'video' | 'system';
export const MEDIA_MESSAGE_KINDS: readonly MessageKind[] = ['image', 'audio', 'video'];

/** Transiciones: sent → delivered → read (final). */
export type DeliveryStatus = 'sent' | 'delivered' | 'read';
export const DELIVERY_STATUS_ORDER: readonly DeliveryStatus[] = ['sent', 'delivered', 'read'];

export type PresenceStatus = 'online' | 'offline';

export type ThemePreference = 'light' | 'dark' | 'system';
