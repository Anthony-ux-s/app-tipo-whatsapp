import type { CallKind } from '@parla/types';
import { ConflictError, ValidationError } from './domain-error';

/** Segundos que suena una llamada antes de darse por perdida. */
export const RING_TIMEOUT_MS = 45_000;

export function assertCallKind(kind: unknown): asserts kind is CallKind {
  if (kind !== 'audio' && kind !== 'video') throw new ValidationError('Tipo de llamada no válido');
}

/** Las llamadas grupales son de malla P2P: cada persona envía su audio/video a todas las demás. */
export function assertRoomForParticipant(current: number, max: number): void {
  if (current >= max) {
    throw new ConflictError(`La llamada ya tiene ${max} personas, el máximo de tu plan`);
  }
}

export function callLabel(kind: CallKind): string {
  return kind === 'video' ? 'Videollamada' : 'Llamada de voz';
}

export function formatCallDuration(ms: number): string {
  const total = Math.max(1, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** Texto del aviso que queda en el chat al terminar la llamada. */
export function callLogText(kind: CallKind, answered: boolean, durationMs: number): string {
  const icon = kind === 'video' ? '🎥' : '📞';
  if (!answered) return `${icon} ${callLabel(kind)} perdida`;
  return `${icon} ${callLabel(kind)} · ${formatCallDuration(durationMs)}`;
}
