import { base64ToBytes, bytesToBase64, randomBytes, textDecoder, textEncoder } from './encoding';

const subtle = () => globalThis.crypto.subtle;

const ECDH_PARAMS: EcKeyImportParams = { name: 'ECDH', namedCurve: 'P-256' };
export const PBKDF2_ITERATIONS = 210_000;

export interface IdentityKeyPair {
  publicKeyJwk: string;
  privateKeyJwk: string;
}

export interface KeyBackup {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
}

/** Crea el par de claves ECDH de identidad de un usuario. */
export async function generateIdentityKeyPair(): Promise<IdentityKeyPair> {
  const pair = await subtle().generateKey(ECDH_PARAMS, true, ['deriveBits']);
  const [publicJwk, privateJwk] = await Promise.all([
    subtle().exportKey('jwk', pair.publicKey),
    subtle().exportKey('jwk', pair.privateKey),
  ]);
  return { publicKeyJwk: JSON.stringify(publicJwk), privateKeyJwk: JSON.stringify(privateJwk) };
}

export function importPublicKey(jwk: string): Promise<CryptoKey> {
  return subtle().importKey('jwk', JSON.parse(jwk), ECDH_PARAMS, true, []);
}

export function importPrivateKey(jwk: string): Promise<CryptoKey> {
  return subtle().importKey('jwk', JSON.parse(jwk), ECDH_PARAMS, false, ['deriveBits']);
}

async function passwordKey(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const material = await subtle().importKey('raw', textEncoder.encode(password), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** Cifra la clave privada con la contraseña para guardarla en el servidor como respaldo. */
export async function encryptPrivateKey(
  privateKeyJwk: string,
  password: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<KeyBackup> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await passwordKey(password, salt, iterations);
  const ciphertext = await subtle().encrypt({ name: 'AES-GCM', iv }, key, textEncoder.encode(privateKeyJwk));
  return {
    ciphertext: bytesToBase64(ciphertext),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    iterations,
  };
}

/** Recupera la clave privada; falla si la contraseña no es la correcta. */
export async function decryptPrivateKey(backup: KeyBackup, password: string): Promise<string> {
  const key = await passwordKey(password, base64ToBytes(backup.salt), backup.iterations);
  const plain = await subtle().decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(backup.iv) },
    key,
    base64ToBytes(backup.ciphertext),
  );
  return textDecoder.decode(plain);
}
