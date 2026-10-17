import type { MessageKind, PushPayload } from '@parla/types';
import { ValidationError } from './domain-error';

/** Menciones válidas: participantes del chat, sin repetir y sin mencionarse a uno mismo. */
export function sanitizeMentions(requested: readonly string[] | undefined, participantIds: readonly string[], senderId: string): string[] {
  const allowed = new Set(participantIds);
  return [...new Set(requested ?? [])].filter((id) => id !== senderId && allowed.has(id));
}

/** Los hilos no se anidan: responder a una respuesta cuelga del mismo mensaje raíz. */
export function threadRootOf(target: { id: string; kind: MessageKind; replyTo: { id: string } | null }): string {
  if (target.kind === 'system') throw new ValidationError('No se puede responder a un aviso del sistema');
  return target.replyTo?.id ?? target.id;
}

const KIND_LABEL: Record<MessageKind, string> = {
  text: 'Nuevo mensaje',
  image: '📷 Foto',
  audio: '🎤 Nota de voz',
  video: '🎬 Video',
  sticker: '💟 Sticker',
  system: 'Aviso',
};

export interface PushContext {
  conversationId: string;
  conversationKind: 'direct' | 'group';
  conversationTitle: string;
  senderName: string;
}

const urlFor = (ctx: PushContext) => `/app/c/${ctx.conversationId}`;

/**
 * Texto de la notificación push de un mensaje. Nunca incluye el contenido: va cifrado de extremo a
 * extremo y el servidor no lo conoce (el navegador abierto sí muestra el texto descifrado).
 */
export function messagePush(ctx: PushContext, kind: MessageKind, mentioned: boolean): PushPayload {
  const label = KIND_LABEL[kind];
  if (mentioned) {
    return { title: ctx.conversationTitle, body: `${ctx.senderName} te mencionó`, url: urlFor(ctx), tag: ctx.conversationId };
  }
  if (ctx.conversationKind === 'direct') {
    return { title: ctx.senderName, body: label, url: urlFor(ctx), tag: ctx.conversationId };
  }
  return { title: ctx.conversationTitle, body: `${ctx.senderName}: ${label}`, url: urlFor(ctx), tag: ctx.conversationId };
}
