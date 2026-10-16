import type { ConversationSummary, MediaAttachment } from '@parla/types';
import { openFile } from './crypto-vault';
import { http } from './http';

const cache = new Map<string, Promise<string>>();

/** Descarga el archivo cifrado, lo descifra en el navegador y devuelve una URL local (blob:). */
export function decryptedMediaUrl(
  conversation: Pick<ConversationSummary, 'id' | 'myKey'>,
  media: MediaAttachment,
): Promise<string> {
  const cached = cache.get(media.fileId);
  if (cached) return cached;
  const promise = (async () => {
    const encrypted = await http.binary(`/chats/media/${media.fileId}`);
    const plain = await openFile(conversation, encrypted, media.iv);
    return URL.createObjectURL(new Blob([plain], { type: media.mimeType }));
  })();
  promise.catch(() => cache.delete(media.fileId));
  cache.set(media.fileId, promise);
  return promise;
}
