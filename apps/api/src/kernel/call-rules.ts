import type { CallKind } from '@parla/types';

/**
 * Las llamadas se coordinan en el servicio de tiempo real (Elixir). El core solo pone el texto de
 * la notificación push de llamada entrante y guarda el aviso que queda en el chat.
 */
export function callLabel(kind: CallKind): string {
  return kind === 'video' ? 'Videollamada' : 'Llamada de voz';
}
