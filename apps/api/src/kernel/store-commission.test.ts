import { afterEach, describe, expect, it, vi } from 'vitest';
import { splitStoreSale, storeCommissionPercent } from './store-commission';

describe('comisión de Parla sobre las ventas de una tienda', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('por defecto es el 5 % de los productos', () => {
    expect(storeCommissionPercent('ferreteria')).toBe(5);
  });

  it('se cambia para todas con STORE_COMMISSION_PERCENT y por categoría con STORE_COMMISSION_<CATEGORÍA>', () => {
    vi.stubEnv('STORE_COMMISSION_PERCENT', '8');
    vi.stubEnv('STORE_COMMISSION_FERRETERIA', '3.5');
    expect(storeCommissionPercent('mercado')).toBe(8);
    expect(storeCommissionPercent('ferreteria')).toBe(3.5);
  });

  it('un valor que no sirve (texto, negativo o más del 50 %) no se usa', () => {
    vi.stubEnv('STORE_COMMISSION_PERCENT', 'mucho');
    vi.stubEnv('STORE_COMMISSION_SALUD', '-1');
    vi.stubEnv('STORE_COMMISSION_MERCADO', '90');
    expect(storeCommissionPercent('salud')).toBe(5);
    expect(storeCommissionPercent('mercado')).toBe(5);
  });

  it('reparte la venta sin perder ni inventar céntimos', () => {
    expect(splitStoreSale(100_000, 5)).toEqual({ commissionCents: 5_000, netCents: 95_000 });
    expect(splitStoreSale(1_380, 5)).toEqual({ commissionCents: 69, netCents: 1_311 });
    expect(splitStoreSale(999, 3.5)).toEqual({ commissionCents: 35, netCents: 964 });
    expect(splitStoreSale(0, 5)).toEqual({ commissionCents: 0, netCents: 0 });
    for (const sale of [1, 333, 12_345, 99_999]) {
      const { commissionCents, netCents } = splitStoreSale(sale, 4.2);
      expect(commissionCents + netCents).toBe(sale);
    }
  });
});
