import { describe, expect, it } from 'vitest';
import { parseInviteCode } from '../../modules/workspaces/utils/invite-link.utils';
import { formatDayLabel, formatDuration, formatListTimestamp } from './date';
import { initials, matchesSearch } from './text';
import { passwordStrength, validatePassword, validatePhone, validateUsername } from './validators';

describe('validaciones de formularios', () => {
  it('teléfono con indicativo', () => {
    expect(validatePhone('+57 300 123 4567')).toBeNull();
    expect(validatePhone('3001234567')).not.toBeNull();
  });

  it('nombre de usuario', () => {
    expect(validateUsername('maria.lopez')).toBeNull();
    expect(validateUsername('ma')).not.toBeNull();
    expect(validateUsername('con espacio')).not.toBeNull();
  });

  it('contraseña y su fuerza', () => {
    expect(validatePassword('Parla2026!')).toBeNull();
    expect(validatePassword('solotexto')).toBe('Combina letras y números');
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abcdefg1')).toBe(2);
    expect(passwordStrength('Parla2026!')).toBe(3);
  });
});

describe('fechas como en la lista de chats', () => {
  const now = new Date('2026-10-15T18:00:00');
  it('hoy muestra la hora, ayer "Ayer" y luego el día', () => {
    expect(formatListTimestamp('2026-10-14T09:00:00', now)).toBe('Ayer');
    expect(formatListTimestamp('2026-10-12T09:00:00', now)).toMatch(/^[A-ZÁÉÍÓÚ]/);
    expect(formatDayLabel('2026-10-15T08:00:00', now)).toBe('Hoy');
  });

  it('duración de notas de voz', () => {
    expect(formatDuration(4000)).toBe('0:04');
    expect(formatDuration(75_500)).toBe('1:16');
  });
});

describe('texto', () => {
  it('iniciales y búsqueda sin tildes', () => {
    expect(initials('Laura Méndez')).toBe('LM');
    expect(initials('sofía')).toBe('S');
    expect(matchesSearch('Andrés Rojas', 'andres')).toBe(true);
    expect(matchesSearch('Andrés Rojas', 'camila')).toBe(false);
  });

  it('acepta el enlace de invitación completo o solo el código', () => {
    expect(parseInviteCode('https://parla.app/invitacion/andino2026')).toBe('andino2026');
    expect(parseInviteCode(' andino2026 ')).toBe('andino2026');
    expect(parseInviteCode('???')).toBeNull();
  });
});
