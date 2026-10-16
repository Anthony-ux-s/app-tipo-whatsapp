import { textEncoder } from '@parla/crypto';

/**
 * Huella de seguridad de una clave pública: 12 grupos de 5 dígitos (como los "safety numbers").
 * Si coincide al compararla en persona, nadie se interpuso en la conversación.
 */
export async function keyFingerprint(publicKeyJwk: string): Promise<string[]> {
  const { x, y } = JSON.parse(publicKeyJwk) as { x: string; y: string };
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', textEncoder.encode(`${x}.${y}`)));
  const groups: string[] = [];
  for (let i = 0; i < 12; i++) {
    const value = ((digest[i * 2] << 8) | digest[i * 2 + 1]) * 1.5 + digest[(i + 24) % 32];
    groups.push(String(Math.floor(value) % 100000).padStart(5, '0'));
  }
  return groups;
}
