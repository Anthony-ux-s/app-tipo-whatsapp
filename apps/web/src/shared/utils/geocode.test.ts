import { describe, expect, it } from 'vitest';
import { addressVariants } from './geocode';

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
