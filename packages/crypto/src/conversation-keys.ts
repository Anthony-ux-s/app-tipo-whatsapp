import { base64ToBytes, bytesToBase64, randomBytes, textDecoder, textEncoder } from './encoding';

const subtle = () => globalThis.crypto.subtle;
const WRAP_INFO = textEncoder.encode('parla/conversation-key/v1');
const WRAP_SALT = new Uint8Array(32);

export interface Sealed {
  ciphertext: string;
  iv: string;
}

/** Clave simétrica nueva para una conversación. */
export function generateConversationKey(): Promise<CryptoKey> {
  return subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/** Secreto compartido ECDH → HKDF → clave AES para envolver la clave de la conversación. */
async function wrappingKey(myPrivateKey: CryptoKey, theirPublicKey: CryptoKey): Promise<CryptoKey> {
  const bits = await subtle().deriveBits({ name: 'ECDH', public: theirPublicKey }, myPrivateKey, 256);
  const hkdf = await subtle().importKey('raw', bits, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: WRAP_SALT, info: WRAP_INFO },
    hkdf,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Envuelve la clave de la conversación para un destinatario (con su clave pública). */
export async function wrapConversationKey(
  conversationKey: CryptoKey,
  myPrivateKey: CryptoKey,
  recipientPublicKey: CryptoKey,
): Promise<{ wrappedKey: string; iv: string }> {
  const raw = await subtle().exportKey('raw', conversationKey);
  const key = await wrappingKey(myPrivateKey, recipientPublicKey);
  const iv = randomBytes(12);
  const wrapped = await subtle().encrypt({ name: 'AES-GCM', iv }, key, raw);
  return { wrappedKey: bytesToBase64(wrapped), iv: bytesToBase64(iv) };
}

/** Desenvuelve la clave de la conversación con mi clave privada y la pública de quien la envolvió. */
export async function unwrapConversationKey(
  wrapped: { wrappedKey: string; iv: string },
  myPrivateKey: CryptoKey,
  wrapperPublicKey: CryptoKey,
): Promise<CryptoKey> {
  const key = await wrappingKey(myPrivateKey, wrapperPublicKey);
  const raw = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(wrapped.iv) },
    key,
    base64ToBytes(wrapped.wrappedKey),
  );
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

export async function encryptText(key: CryptoKey, text: string): Promise<Sealed> {
  const iv = randomBytes(12);
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(text));
  return { ciphertext: bytesToBase64(ciphertext), iv: bytesToBase64(iv) };
}

export async function decryptText(key: CryptoKey, sealed: Sealed): Promise<string> {
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(sealed.iv) },
    key,
    base64ToBytes(sealed.ciphertext),
  );
  return textDecoder.decode(plain);
}

/** Cifra un archivo (foto, audio, vídeo) antes de subirlo. */
export async function encryptBytes(
  key: CryptoKey,
  data: ArrayBuffer | Uint8Array<ArrayBuffer>,
): Promise<{ data: ArrayBuffer; iv: string }> {
  const iv = randomBytes(12);
  const encrypted = await subtle().encrypt({ name: 'AES-GCM', iv }, key, data);
  return { data: encrypted, iv: bytesToBase64(iv) };
}

export function decryptBytes(key: CryptoKey, data: ArrayBuffer, iv: string): Promise<ArrayBuffer> {
  return subtle().decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv) }, key, data);
}
