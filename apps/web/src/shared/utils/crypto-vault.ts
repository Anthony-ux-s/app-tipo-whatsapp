import {
  decryptBytes,
  decryptText,
  encryptBytes,
  encryptText,
  generateConversationKey,
  importPrivateKey,
  importPublicKey,
  unwrapConversationKey,
  wrapConversationKey,
} from '@parla/crypto';
import type { ConversationSummary, EncryptedPayload, PublicUser, WrappedKey } from '@parla/types';

/**
 * Bóveda de claves del dispositivo. La clave privada se guarda en este navegador para no pedir la
 * contraseña en cada recarga; las claves de conversación solo viven en memoria.
 */
const PRIVATE_KEY_PREFIX = 'parla.pk.';

let privateKey: CryptoKey | null = null;
const conversationKeys = new Map<string, Promise<CryptoKey>>();

export async function unlockVault(userId: string, privateKeyJwk: string): Promise<void> {
  privateKey = await importPrivateKey(privateKeyJwk);
  localStorage.setItem(PRIVATE_KEY_PREFIX + userId, privateKeyJwk);
}

/** Intenta abrir la bóveda con la clave guardada en este dispositivo. */
export async function restoreVault(userId: string): Promise<boolean> {
  const jwk = localStorage.getItem(PRIVATE_KEY_PREFIX + userId);
  if (!jwk) return false;
  try {
    privateKey = await importPrivateKey(jwk);
    return true;
  } catch {
    return false;
  }
}

/** Cierra la bóveda. Con `forget` también borra la clave guardada en este dispositivo (entrar de nuevo pedirá la contraseña). */
export function lockVault(userId: string | null, forget = true): void {
  privateKey = null;
  conversationKeys.clear();
  if (userId && forget) localStorage.removeItem(PRIVATE_KEY_PREFIX + userId);
}

/**
 * ¿Este dispositivo ya tiene la clave de esta cuenta? Solo vale si es la misma que la pública de la cuenta
 * (si la contraseña se restableció en otro dispositivo, la clave guardada quedó vieja y no sirve).
 */
export function deviceKeyMatches(userId: string, publicKeyJwk: string): boolean {
  try {
    const stored = localStorage.getItem(PRIVATE_KEY_PREFIX + userId);
    if (!stored) return false;
    const mine = JSON.parse(stored) as { x?: string; y?: string };
    const account = JSON.parse(publicKeyJwk) as { x?: string; y?: string };
    return Boolean(mine.x && mine.y) && mine.x === account.x && mine.y === account.y;
  } catch {
    return false;
  }
}

function requirePrivateKey(): CryptoKey {
  if (!privateKey) throw new Error('La bóveda de claves está cerrada');
  return privateKey;
}

/** Clave de la conversación, desenvuelta una sola vez y guardada en memoria. */
export function conversationKey(conversation: Pick<ConversationSummary, 'id' | 'myKey'>): Promise<CryptoKey> {
  const cached = conversationKeys.get(conversation.id);
  if (cached) return cached;
  const myKey = conversation.myKey;
  if (!myKey) return Promise.reject(new Error('No tienes la clave de esta conversación'));
  const promise = importPublicKey(myKey.wrapperPublicKey).then((wrapperKey) =>
    unwrapConversationKey(myKey, requirePrivateKey(), wrapperKey),
  );
  promise.catch(() => conversationKeys.delete(conversation.id));
  conversationKeys.set(conversation.id, promise);
  return promise;
}

/** Nueva clave de conversación envuelta para cada participante (incluido yo). */
export async function createWrappedKeys(
  me: PublicUser,
  participants: PublicUser[],
): Promise<WrappedKey[]> {
  const key = await generateConversationKey();
  return wrapExistingKey(key, me.id, [me, ...participants.filter((p) => p.id !== me.id)]);
}

export async function wrapExistingKey(key: CryptoKey, myId: string, users: PublicUser[]): Promise<WrappedKey[]> {
  const mine = requirePrivateKey();
  return Promise.all(
    users.map(async (user) => {
      const wrapped = await wrapConversationKey(key, mine, await importPublicKey(user.publicKey));
      return { userId: user.id, wrappedKey: wrapped.wrappedKey, iv: wrapped.iv, wrappedById: myId };
    }),
  );
}

export async function sealText(conversation: Pick<ConversationSummary, 'id' | 'myKey'>, text: string): Promise<EncryptedPayload> {
  return encryptText(await conversationKey(conversation), text);
}

export async function openText(
  conversation: Pick<ConversationSummary, 'id' | 'myKey'>,
  payload: EncryptedPayload,
): Promise<string> {
  return decryptText(await conversationKey(conversation), payload);
}

export async function sealFile(
  conversation: Pick<ConversationSummary, 'id' | 'myKey'>,
  data: ArrayBuffer,
): Promise<{ data: ArrayBuffer; iv: string }> {
  return encryptBytes(await conversationKey(conversation), new Uint8Array(data));
}

export async function openFile(
  conversation: Pick<ConversationSummary, 'id' | 'myKey'>,
  data: ArrayBuffer,
  iv: string,
): Promise<ArrayBuffer> {
  return decryptBytes(await conversationKey(conversation), data, iv);
}
