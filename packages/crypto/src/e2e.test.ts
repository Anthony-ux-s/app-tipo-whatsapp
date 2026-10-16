import { describe, expect, it } from 'vitest';
import {
  decryptBytes,
  decryptPrivateKey,
  decryptText,
  encryptBytes,
  encryptPrivateKey,
  encryptText,
  generateConversationKey,
  generateIdentityKeyPair,
  importPrivateKey,
  importPublicKey,
  unwrapConversationKey,
  wrapConversationKey,
} from './index';

async function identity() {
  const pair = await generateIdentityKeyPair();
  return {
    ...pair,
    privateKey: await importPrivateKey(pair.privateKeyJwk),
    publicKey: await importPublicKey(pair.publicKeyJwk),
  };
}

describe('respaldo de la clave privada', () => {
  it('se recupera con la contraseña correcta', async () => {
    const { privateKeyJwk } = await generateIdentityKeyPair();
    const backup = await encryptPrivateKey(privateKeyJwk, 'secreto-123', 1000);
    expect(backup.ciphertext).not.toContain('"d"');
    await expect(decryptPrivateKey(backup, 'secreto-123')).resolves.toBe(privateKeyJwk);
  });

  it('falla con una contraseña equivocada', async () => {
    const { privateKeyJwk } = await generateIdentityKeyPair();
    const backup = await encryptPrivateKey(privateKeyJwk, 'secreto-123', 1000);
    await expect(decryptPrivateKey(backup, 'otra')).rejects.toThrow();
  });
});

describe('clave de conversación', () => {
  it('Ana la envuelve para Beto y Beto lee lo que Ana cifró', async () => {
    const ana = await identity();
    const beto = await identity();
    const key = await generateConversationKey();

    const forBeto = await wrapConversationKey(key, ana.privateKey, beto.publicKey);
    const betoKey = await unwrapConversationKey(forBeto, beto.privateKey, ana.publicKey);

    const sealed = await encryptText(key, 'Hola equipo 👋 ¿revisamos el informe?');
    await expect(decryptText(betoKey, sealed)).resolves.toBe('Hola equipo 👋 ¿revisamos el informe?');
  });

  it('quien la envuelve también puede guardarla para sí mismo', async () => {
    const ana = await identity();
    const key = await generateConversationKey();
    const forAna = await wrapConversationKey(key, ana.privateKey, ana.publicKey);
    const again = await unwrapConversationKey(forAna, ana.privateKey, ana.publicKey);
    const sealed = await encryptText(key, 'nota');
    await expect(decryptText(again, sealed)).resolves.toBe('nota');
  });

  it('un tercero no puede desenvolver la clave', async () => {
    const ana = await identity();
    const beto = await identity();
    const intruso = await identity();
    const key = await generateConversationKey();
    const forBeto = await wrapConversationKey(key, ana.privateKey, beto.publicKey);
    await expect(unwrapConversationKey(forBeto, intruso.privateKey, ana.publicKey)).rejects.toThrow();
  });

  it('el texto cifrado no revela el contenido y cada mensaje usa un IV distinto', async () => {
    const key = await generateConversationKey();
    const a = await encryptText(key, 'mismo texto');
    const b = await encryptText(key, 'mismo texto');
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(atob(a.ciphertext)).not.toContain('mismo texto');
  });

  it('cifra y descifra archivos binarios', async () => {
    const key = await generateConversationKey();
    const original = new Uint8Array([1, 2, 3, 250, 251, 252]);
    const { data, iv } = await encryptBytes(key, original);
    const plain = new Uint8Array(await decryptBytes(key, data, iv));
    expect(Array.from(plain)).toEqual(Array.from(original));
  });
});
