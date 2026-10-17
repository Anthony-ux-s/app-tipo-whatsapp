import { describe, expect, it } from 'vitest';
import { defaultCountry, toE164 } from '../const/countries.const';
import { mediaFileName } from './download';
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
});

describe('países e indicativos', () => {
  it('elige el país por el idioma del navegador y arma el número internacional', () => {
    expect(defaultCountry('es-PE').name).toBe('Perú');
    expect(defaultCountry('es-MX').code).toBe('52');
    expect(defaultCountry('en').iso).toBe('CO');
    expect(toE164(defaultCountry('es-CO'), '300 123 4567')).toBe('+573001234567');
    expect(toE164(defaultCountry('es-AR'), '011 2345-6789')).toBe('+541123456789');
  });
});

describe('nombre de archivos descargados', () => {
  it('usa el tipo y la fecha del mensaje', () => {
    const sentAt = new Date(2026, 9, 17, 15, 30, 12);
    expect(mediaFileName('image/jpeg', sentAt)).toBe('Parla-IMG-20261017-153012.jpg');
    expect(mediaFileName('video/mp4', sentAt)).toBe('Parla-VID-20261017-153012.mp4');
    expect(mediaFileName('audio/webm;codecs=opus', sentAt)).toBe('Parla-AUD-20261017-153012.webm');
  });

  it('no deja pasar caracteres raros del tipo', () => {
    expect(mediaFileName('image/svg+xml', 'no es fecha')).toBe('Parla-IMG-archivo.svgxm');
  });
});
