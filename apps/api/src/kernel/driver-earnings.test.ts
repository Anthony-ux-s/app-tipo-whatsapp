import { describe, expect, it } from 'vitest';
import { ValidationError } from './domain-error';
import { normalizePayoutPhone, splitDelivery } from './driver-earnings';

describe('ganancias del repartidor', () => {
  it('se queda con el 95 % de la tarifa y la propina completa; Rapidito cobra el 5 %', () => {
    expect(splitDelivery(850, 0)).toEqual({ commissionCents: 43, driverFeeCents: 807, earningsCents: 807 });
    expect(splitDelivery(650, 300)).toEqual({ commissionCents: 33, driverFeeCents: 617, earningsCents: 917 });
    expect(splitDelivery(1000, 0)).toEqual({ commissionCents: 50, driverFeeCents: 950, earningsCents: 950 });
    expect(splitDelivery(0, 200)).toEqual({ commissionCents: 0, driverFeeCents: 0, earningsCents: 200 });
    expect(() => splitDelivery(-1, 0)).toThrow(ValidationError);
  });

  it('el número de PagaYa es un celular peruano de 9 dígitos', () => {
    expect(normalizePayoutPhone('987 654 321')).toBe('987654321');
    expect(normalizePayoutPhone('+51 987654321')).toBe('987654321');
    expect(() => normalizePayoutPhone('12345')).toThrow(ValidationError);
    expect(() => normalizePayoutPhone('887654321')).toThrow(ValidationError);
  });
});
