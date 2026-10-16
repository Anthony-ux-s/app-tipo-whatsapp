import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Código de invitación legible (sin 0/O ni 1/l para evitar confusiones). */
export function generateInviteCode(length = 10): string {
  let code = '';
  for (let i = 0; i < length; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}
