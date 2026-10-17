import type { CallKind } from '@parla/types';

/**
 * Las llamadas se coordinan en el servicio de tiempo real (Elixir). El core solo pone el texto de
 * la notificación push de llamada entrante y guarda el aviso que queda en el chat.
 */
/** Personas en una misma llamada: las llamadas grupales son una malla P2P y no escalan más allá. */
export const MAX_CALL_PARTICIPANTS = 8;

export function callLabel(kind: CallKind): string {
  return kind === 'video' ? 'Videollamada' : 'Llamada de voz';
}
