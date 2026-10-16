import { ValidationError } from './domain-error';

/** Nombre de usuario: 3–24 caracteres, minúsculas, números, punto o guion bajo. */
const USERNAME_RE = /^[a-z0-9._]{3,24}$/;
/** Teléfono internacional E.164: + y de 8 a 15 dígitos. */
const PHONE_RE = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s()-]/g, '');
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, '').toLowerCase();
}

export function isValidPhone(phone: string): boolean {
  return PHONE_RE.test(phone);
}

export function isValidUsername(username: string): boolean {
  return USERNAME_RE.test(username);
}

export type Identifier = { phone: string } | { username: string };

/** Interpreta lo que el usuario escribe al iniciar sesión: teléfono si empieza con + o es numérico. */
export function parseIdentifier(raw: string): Identifier {
  const trimmed = raw.trim();
  const compact = normalizePhone(trimmed);
  if (/^\+?\d+$/.test(compact)) {
    const phone = compact.startsWith('+') ? compact : `+${compact}`;
    if (!isValidPhone(phone)) throw new ValidationError('El número de teléfono no es válido');
    return { phone };
  }
  const username = normalizeUsername(trimmed);
  if (!isValidUsername(username)) throw new ValidationError('El nombre de usuario no es válido');
  return { username };
}

export function assertPasswordStrength(password: string): void {
  if (password.length < 8) throw new ValidationError('La contraseña debe tener al menos 8 caracteres');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ValidationError('La contraseña debe combinar letras y números');
  }
}
