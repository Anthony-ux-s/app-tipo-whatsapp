import type { ChatMessage } from '@shared/types/chat.types';
import { daysBetween, formatDayLabel } from '@shared/utils/date';

export type TimelineItem =
  | { type: 'day'; id: string; label: string }
  | { type: 'message'; id: string; message: ChatMessage; firstOfRun: boolean; lastOfRun: boolean };

const RUN_GAP_MS = 5 * 60 * 1000;

function continuesRun(previous: ChatMessage | undefined, current: ChatMessage): boolean {
  if (!previous || previous.kind === 'system' || current.kind === 'system') return false;
  if (previous.senderId !== current.senderId) return false;
  const a = new Date(previous.createdAt);
  const b = new Date(current.createdAt);
  return daysBetween(a, b) === 0 && b.getTime() - a.getTime() < RUN_GAP_MS;
}

/**
 * Convierte los mensajes en la línea de tiempo del chat: separadores de día y "rachas" de un
 * mismo remitente (para dibujar la cola de la burbuja solo en el primero y el nombre en grupos).
 */
export function buildTimeline(messages: ChatMessage[], now = new Date()): TimelineItem[] {
  const items: TimelineItem[] = [];
  let lastDay: string | null = null;
  messages.forEach((message, index) => {
    const date = new Date(message.createdAt);
    const dayKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    if (dayKey !== lastDay) {
      items.push({ type: 'day', id: `day-${dayKey}`, label: formatDayLabel(message.createdAt, now) });
      lastDay = dayKey;
    }
    const previous = messages[index - 1];
    const next = messages[index + 1];
    items.push({
      type: 'message',
      id: message.clientId,
      message,
      firstOfRun: !continuesRun(previous, message),
      lastOfRun: !next || !continuesRun(message, next),
    });
  });
  return items;
}
