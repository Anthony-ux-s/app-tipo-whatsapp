/** Enums de la base de datos, como uniones de literales (coinciden 1:1 con el esquema Prisma). */

/** Rol dentro de un grupo: quien lo creó lo administra (como en WhatsApp). */
export type ParticipantRole = 'admin' | 'member';

export type ConversationKind = 'direct' | 'group';

/** `sticker` lleva cifrado qué sticker es (el servidor no lo sabe), igual que el texto. */
export type MessageKind = 'text' | 'image' | 'audio' | 'video' | 'sticker' | 'system';

export const MEDIA_MESSAGE_KINDS: readonly MessageKind[] = ['image', 'audio', 'video'];

/** Transiciones: sent → delivered → read (final). */
export type DeliveryStatus = 'sent' | 'delivered' | 'read';
export const DELIVERY_STATUS_ORDER: readonly DeliveryStatus[] = ['sent', 'delivered', 'read'];

export type PresenceStatus = 'online' | 'offline';

export type ThemePreference = 'light' | 'dark' | 'system';

/** Tamaño de la letra de los mensajes. */
export type ChatFontSize = 'small' | 'medium' | 'large' | 'xlarge';

/** Tipo de letra de los mensajes. */
export type ChatFont = 'inter' | 'jakarta' | 'serif' | 'mono';
