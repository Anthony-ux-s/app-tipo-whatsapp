import { ValidationError } from './domain-error';
import { isValidPhone, normalizePhone } from './identifier';

/**
 * Indicativos de los países donde se usa Parla (el más largo primero para que +1809 gane a +1).
 * Sirven para completar los números de la libreta que vienen sin indicativo.
 */
const CALLING_CODES = ['1809', '1829', '1849', '593', '591', '595', '598', '502', '503', '504', '505', '506', '507', '51', '52', '53', '54', '55', '56', '57', '58', '34', '1'];

/** Indicativo de un número E.164 («+573001234567» → «57»). */
export function callingCodeOf(e164: string): string | null {
  const digits = e164.replace(/^\+/, '');
  return CALLING_CODES.find((code) => digits.startsWith(code)) ?? null;
}

/** Teléfono escrito por la persona → E.164, o error claro. */
export function parsePhone(raw: string): string {
  const compact = normalizePhone(raw.trim()).replace(/^00/, '+');
  const phone = compact.startsWith('+') ? compact : `+${compact}`;
  if (!isValidPhone(phone)) throw new ValidationError('Escribe el número con su indicativo, por ejemplo +57 300 123 4567');
  return phone;
}

/**
 * Número de la libreta del teléfono → E.164. Los que vienen sin indicativo se completan con el del
 * propio usuario (así guarda la gente sus contactos locales). Devuelve null si no parece un teléfono.
 */
export function normalizeContactPhone(raw: string, defaultCallingCode: string | null): string | null {
  const compact = raw.replace(/[^\d+]/g, '').replace(/^00/, '+');
  if (!compact) return null;
  let phone: string;
  if (compact.startsWith('+')) phone = compact;
  else if (defaultCallingCode) phone = `+${defaultCallingCode}${compact.replace(/^0+/, '')}`;
  else return null;
  return isValidPhone(phone) ? phone : null;
}

/** «+573001234567» → «+57 *** *** 4567» (para decir a dónde se envió el código sin exponerlo entero). */
export function maskPhone(e164: string): string {
  const code = callingCodeOf(e164) ?? '';
  return `+${code} *** *** ${e164.slice(-4)}`;
}

/** «laura@example.com» → «l***a@example.com». */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  const visible = user.length <= 2 ? user[0] : `${user[0]}***${user[user.length - 1]}`;
  return `${visible}@${domain}`;
}

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

export function parseEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw new ValidationError('Escribe un correo válido, por ejemplo nombre@correo.com');
  return email;
}
