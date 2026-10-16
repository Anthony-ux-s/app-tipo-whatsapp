import type { ConversationSummary, Message, PublicUser } from '@parla/types';
import type { DecryptedText } from '@shared/types/chat.types';
import { formatLastSeen } from '@shared/utils/date';
import { firstName } from '@shared/utils/text';
import { taskTextKey } from '@shared/utils/ids';
import { MEDIA_LABELS } from '../const/chats.const';

export interface Preview {
  author: string | null;
  text: string;
  media: Message['kind'] | null;
}

/** Línea de vista previa de la lista de chats ("Tú: …", "Andrés: 🎤 Nota de voz"). */
export function previewFor(
  conversation: ConversationSummary,
  texts: Record<string, DecryptedText>,
  myId: string,
): Preview {
  const message = conversation.lastMessage;
  if (!message) return { author: null, text: 'Cifrado de extremo a extremo. Escribe el primer mensaje.', media: null };
  if (message.kind === 'system') return { author: null, text: message.systemText ?? '', media: null };

  const sender = conversation.participants.find((p) => p.user.id === message.senderId)?.user;
  const author =
    message.senderId === myId ? 'Tú' : conversation.kind === 'group' && sender ? firstName(sender.displayName) : null;
  if (message.kind === 'task') {
    const title = message.task ? texts[taskTextKey(message.task.id)] : undefined;
    return { author, text: title?.ok ? title.text : MEDIA_LABELS.task, media: 'task' };
  }
  const decrypted = texts[message.clientId];
  const caption = decrypted?.ok ? decrypted.text : '';

  if (message.kind !== 'text') {
    return { author, text: caption || MEDIA_LABELS[message.kind], media: message.kind };
  }
  if (!decrypted) return { author, text: 'Descifrando…', media: null };
  return { author, text: decrypted.ok ? decrypted.text : '🔒 No se pudo descifrar este mensaje', media: null };
}

/** El otro participante en un chat individual. */
export function counterpart(conversation: ConversationSummary, myId: string): PublicUser | null {
  if (conversation.kind !== 'direct') return null;
  return conversation.participants.find((p) => p.user.id !== myId)?.user ?? null;
}

/** "escribiendo…", "Ana está escribiendo…" o null. */
export function typingLabel(
  conversation: ConversationSummary,
  typing: Record<string, number> | undefined,
): string | null {
  const ids = Object.keys(typing ?? {});
  if (ids.length === 0) return null;
  if (conversation.kind === 'direct') return 'escribiendo…';
  const names = ids
    .map((id) => conversation.participants.find((p) => p.user.id === id)?.user.displayName)
    .filter(Boolean)
    .map((n) => firstName(n!));
  if (names.length === 0) return 'escribiendo…';
  return names.length === 1 ? `${names[0]} está escribiendo…` : `${names.join(', ')} están escribiendo…`;
}

/** Subtítulo de la cabecera: presencia en chats individuales, miembros en grupos. */
export function headerSubtitle(conversation: ConversationSummary, myId: string): string {
  const other = counterpart(conversation, myId);
  if (other) return other.presence === 'online' ? 'en línea' : formatLastSeen(other.lastSeenAt);
  const names = conversation.participants
    .map((p) => (p.user.id === myId ? 'Tú' : firstName(p.user.displayName)))
    .sort((a, b) => (a === 'Tú' ? 1 : b === 'Tú' ? -1 : a.localeCompare(b, 'es')));
  return names.join(', ');
}
