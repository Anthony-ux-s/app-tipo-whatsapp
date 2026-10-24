import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

/**
 * Cifrado de secretos en reposo (llaves de API de las tiendas, secreto de sus avisos): AES-256-GCM con una
 * clave derivada de `SECRETS_KEY` (o, si no existe, de `JWT_SECRET`). Lo guardado empieza con «enc:v1:»; un valor
 * sin ese prefijo (guardado antes de este cambio) se lee tal cual y se cifra la próxima vez que se escriba.
 *
 * Si se cambia la clave, lo cifrado deja de poder leerse: `open` devuelve vacío y la tienda hay que volver a conectarla.
 */
const PREFIX = 'enc:v1:';

function key(): Buffer {
  const secret = process.env.SECRETS_KEY || process.env.JWT_SECRET || 'parla-dev-secret-cambiar-en-produccion';
  return Buffer.from(hkdfSync('sha256', secret, 'parla-secret-box', 'v1', 32));
}

export function seal(plain: string): string {
  if (!plain || plain.startsWith(PREFIX)) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

export function open(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}
