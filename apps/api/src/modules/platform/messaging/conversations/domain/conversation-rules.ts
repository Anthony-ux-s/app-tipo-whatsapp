import type { WrappedKey } from '@parla/types';
import { ValidationError } from '../../../../../kernel/domain-error';

export const MAX_GROUP_SIZE = 256;

/** Clave estable para no duplicar chats individuales entre las mismas dos personas. */
export function directKeyFor(a: string, b: string): string {
  return [a, b].sort().join(':');
}

/**
 * Cada participante debe recibir exactamente una copia de la clave, envuelta por quien hace
 * la acción. Así el servidor nunca necesita conocer la clave de la conversación.
 */
export function assertKeysCover(keys: WrappedKey[], userIds: string[], wrapperId: string): void {
  const expected = new Set(userIds);
  const received = new Set(keys.map((k) => k.userId));
  const sameSize = expected.size === received.size && keys.length === received.size;
  if (!sameSize || [...expected].some((id) => !received.has(id))) {
    throw new ValidationError('Falta la clave cifrada de algún participante');
  }
  if (keys.some((k) => k.wrappedById !== wrapperId)) {
    throw new ValidationError('Las claves deben estar envueltas por quien hace la acción');
  }
}

export function validateGroupTitle(raw: string): string {
  const title = raw.trim();
  if (title.length < 2) throw new ValidationError('El nombre del grupo debe tener al menos 2 caracteres');
  if (title.length > 60) throw new ValidationError('El nombre del grupo es demasiado largo');
  return title;
}
