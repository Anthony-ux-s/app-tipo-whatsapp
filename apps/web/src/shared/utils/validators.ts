/** Validaciones de formularios (las mismas reglas que exige la API). */

export function normalizePhone(raw: string): string {
  return raw.replace(/[\s()-]/g, '');
}

export function validatePhone(raw: string): string | null {
  const phone = normalizePhone(raw);
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return 'Escribe el teléfono con indicativo, por ejemplo +57 300 123 4567';
  return null;
}

export function validateUsername(raw: string): string | null {
  const username = raw.trim().replace(/^@/, '').toLowerCase();
  if (!/^[a-z0-9._]{3,24}$/.test(username)) {
    return 'De 3 a 24 letras minúsculas, números, punto o guion bajo';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Mínimo 8 caracteres';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Combina letras y números';
  return null;
}

/** 0 a 3: qué tan fuerte es la contraseña, para la barra del registro. */
export function passwordStrength(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score++;
  if (password.length >= 12 || /[^A-Za-z0-9]/.test(password)) score++;
  return score;
}
