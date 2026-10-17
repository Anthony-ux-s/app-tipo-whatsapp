import { describe, expect, it } from 'vitest';
import { callStatusLabel, gridClass } from './call-format.utils';

describe('pantalla de llamada', () => {
  it('muestra el estado según la fase', () => {
    expect(callStatusLabel('outgoing', 'video', 0, null)).toBe('Llamando…');
    expect(callStatusLabel('incoming', 'video', 0, null)).toBe('Videollamada entrante');
    expect(callStatusLabel('incoming', 'audio', 0, null)).toBe('Llamada de voz entrante');
    expect(callStatusLabel('connecting', 'audio', 0, null)).toBe('Conectando…');
    expect(callStatusLabel('active', 'audio', 125_000, null)).toBe('2:05');
    expect(callStatusLabel('ended', 'audio', 0, 'declined')).toBe('Llamada rechazada');
    expect(callStatusLabel('ended', 'audio', 0, 'missed')).toBe('Nadie contestó');
  });

  it('acomoda la cuadrícula al número de personas', () => {
    expect(gridClass(1)).toBe('grid-cols-1');
    expect(gridClass(3)).toContain('sm:grid-cols-2');
    expect(gridClass(6)).toContain('lg:grid-cols-3');
  });
});
