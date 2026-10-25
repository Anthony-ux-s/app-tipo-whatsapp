import { describe, expect, it } from 'vitest';
import { addressVariants, reverseLabel } from './geocode';

describe('addressVariants', () => {
  it('expande «jr» y agrega la ciudad', () => {
    const v = addressVariants('jr leoncio prado 263');
    expect(v[0]).toBe('Jirón leoncio prado 263, Cajamarca');
    expect(v).toContain('Jirón leoncio prado, Cajamarca');
  });

  it('no repite la ciudad si ya la escribió', () => {
    expect(addressVariants('Av. Larco 123, Cajamarca')[0]).toBe('Avenida Larco 123, Cajamarca');
  });
});

describe('reverseLabel', () => {
  it('arma «calle número, barrio, ciudad»', () => {
    expect(reverseLabel({ address: { road: 'Jirón Leoncio Prado', house_number: '263', suburb: 'Centro', city: 'Cajamarca' } })).toBe('Jirón Leoncio Prado 263, Centro, Cajamarca');
    expect(reverseLabel({ address: { road: 'Av. Larco', town: 'Miraflores' } })).toBe('Av. Larco, Miraflores');
  });

  it('sin calle usa el nombre completo, y sin nada devuelve null', () => {
    expect(reverseLabel({ display_name: 'Plaza de Armas, Cajamarca, Perú', address: {} })).toBe('Plaza de Armas, Cajamarca, Perú');
    expect(reverseLabel({ address: {} })).toBeNull();
  });
});
