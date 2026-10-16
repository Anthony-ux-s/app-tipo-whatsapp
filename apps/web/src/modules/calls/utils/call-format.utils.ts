import type { CallEndReason, CallKind } from '@parla/types';
import type { CallPhase } from '@shared/stores/call.store';
import { formatDuration } from '@shared/utils/date';

const END_LABELS: Record<CallEndReason, string> = {
  completed: 'Llamada finalizada',
  missed: 'Nadie contestó',
  declined: 'Llamada rechazada',
  cancelled: 'Llamada cancelada',
  failed: 'No se pudo conectar',
};

/** Texto de estado bajo el nombre ("Llamando…", "02:15", "Llamada finalizada"). */
export function callStatusLabel(phase: CallPhase, kind: CallKind, elapsedMs: number, endReason: CallEndReason | null): string {
  switch (phase) {
    case 'outgoing':
      return 'Llamando…';
    case 'incoming':
      return kind === 'video' ? 'Videollamada entrante' : 'Llamada de voz entrante';
    case 'connecting':
      return 'Conectando…';
    case 'active':
      return formatDuration(elapsedMs);
    case 'ended':
      return endReason ? END_LABELS[endReason] : 'Llamada finalizada';
    default:
      return '';
  }
}

/** Columnas de la cuadrícula de video según cuántas personas hay. */
export function gridClass(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count <= 4) return 'grid-cols-1 sm:grid-cols-2';
  return 'grid-cols-2 lg:grid-cols-3';
}
