import type { ConversationSummary, Message } from '@parla/types';
import type { DecryptedText } from '@shared/types/chat.types';
import { taskTextKey } from '@shared/utils/ids';

const KIND_LABELS: Record<Message['kind'], string> = {
  text: 'Nuevo mensaje',
  image: '📷 Foto',
  audio: '🎤 Nota de voz',
  video: '🎬 Video',
  task: '📋 Nueva tarea',
  system: 'Aviso',
};

/**
 * Aviso local (app abierta en segundo plano). A diferencia del push del servidor, aquí el texto ya
 * está descifrado en el navegador y se puede mostrar.
 */
export function localNotificationFor(
  message: Message,
  conversation: ConversationSummary,
  texts: Record<string, DecryptedText>,
  myId: string,
): { title: string; body: string; url: string; tag: string } {
  const sender = conversation.participants.find((p) => p.user.id === message.senderId)?.user.displayName ?? 'Alguien';
  const decrypted = message.kind === 'task' && message.task ? texts[taskTextKey(message.task.id)] : texts[message.clientId];
  const content = decrypted?.ok && decrypted.text ? decrypted.text : KIND_LABELS[message.kind];
  const mentioned = message.mentions.includes(myId);
  const lead = mentioned ? `${sender} te mencionó: ` : conversation.kind === 'group' ? `${sender}: ` : '';
  return {
    title: conversation.kind === 'group' ? conversation.title : sender,
    body: `${lead}${message.kind === 'task' ? `📋 ${content}` : content}`,
    url: `/app/w/${conversation.workspaceId}/c/${conversation.id}`,
    tag: conversation.id,
  };
}
