import type { MessageKind, PushPayload, TaskStatus, ParticipantRole } from '@parla/types';
import { ForbiddenError, ValidationError } from './domain-error';

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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function assertValidDueDate(dueDate: string | null | undefined): void {
  if (dueDate == null) return;
  const parsed = new Date(`${dueDate}T00:00:00Z`);
  if (!DATE_RE.test(dueDate) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dueDate) {
    throw new ValidationError('La fecha límite no es válida');
  }
}

/** Quién puede cambiar una tarea: quien la creó, la persona asignada o quien administra el grupo. */
export function assertCanEditTask(
  task: { createdById: string; assigneeId: string | null },
  actorId: string,
  actorRole: ParticipantRole | null,
): void {
  if (task.createdById === actorId || task.assigneeId === actorId || actorRole === 'admin') return;
  throw new ForbiddenError('Solo quien creó la tarea, la persona asignada o un administrador pueden cambiarla');
}

/** Datos de cierre al cambiar el estado: hecha guarda quién y cuándo; reabrirla los limpia. */
export function completionFor(status: TaskStatus, actorId: string, now: Date) {
  return status === 'done'
    ? { completedAt: now, completedById: actorId }
    : { completedAt: null, completedById: null };
}

const KIND_LABEL: Record<MessageKind, string> = {
  text: 'Nuevo mensaje',
  image: '📷 Foto',
  audio: '🎤 Nota de voz',
  video: '🎬 Video',
  task: '📋 Nueva tarea',
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

export function taskAssignedPush(ctx: PushContext): PushPayload {
  return {
    title: ctx.conversationKind === 'group' ? ctx.conversationTitle : ctx.senderName,
    body: `${ctx.senderName} te asignó una tarea`,
    url: `${urlFor(ctx)}?panel=tareas`,
    tag: `task-${ctx.conversationId}`,
  };
}
