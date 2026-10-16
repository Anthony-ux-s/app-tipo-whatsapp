import type { MessageKind } from '@parla/types';
import type { ChatFilter } from '../types/chats.types';

export const MEDIA_LABELS: Record<MessageKind, string> = {
  text: 'Mensaje',
  image: 'Foto',
  audio: 'Nota de voz',
  video: 'Video',
  task: 'Tarea',
  system: 'Aviso',
};

export const CHAT_FILTERS: { id: ChatFilter; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'unread', label: 'No leídos' },
  { id: 'groups', label: 'Grupos' },
  { id: 'direct', label: 'Personas' },
];

export const QUICK_EMOJIS = ['😀', '😂', '😊', '😍', '🙏', '👍', '👏', '🙌', '🎉', '🔥', '💪', '✅', '☕', '🚀', '📦', '📈', '🤝', '💡', '⏰', '❤️', '😅', '🤔', '👀', '😮'];

export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const ACCEPTED_MEDIA = 'image/*,video/*';
