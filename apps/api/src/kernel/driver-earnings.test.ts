import { describe, expect, it } from 'vitest';
import { ValidationError } from './domain-error';
import { DEFAULT_DRIVER_PAY, normalizePayoutPhone, parseDriverPay, splitDelivery } from './driver-earnings';

describe('ganancias del repartidor', () => {
  it('se queda con el 90 % de la tarifa y la propina completa; Parla cobra el 10 %', () => {
    expect(splitDelivery(850, 0)).toEqual({ commissionCents: 85, driverFeeCents: 765, earningsCents: 765 });
    expect(splitDelivery(650, 300)).toEqual({ commissionCents: 65, driverFeeCents: 585, earningsCents: 885 });
    expect(splitDelivery(1000, 0)).toEqual({ commissionCents: 100, driverFeeCents: 900, earningsCents: 900 });
    expect(splitDelivery(0, 200)).toEqual({ commissionCents: 0, driverFeeCents: 0, earningsCents: 200 });
    expect(() => splitDelivery(-1, 0)).toThrow(ValidationError);
  });

  it('el número de PagaYa es un celular peruano de 9 dígitos', () => {
    expect(normalizePayoutPhone('987 654 321')).toBe('987654321');
    expect(normalizePayoutPhone('+51 987654321')).toBe('987654321');
    expect(() => normalizePayoutPhone('12345')).toThrow(ValidationError);
    expect(() => normalizePayoutPhone('887654321')).toThrow(ValidationError);
  });

  it('con otro porcentaje, la comisión es el resto hasta 100 %', () => {
    expect(splitDelivery(850, 100, 90)).toEqual({ commissionCents: 85, driverFeeCents: 765, earningsCents: 865 });
    expect(splitDelivery(850, 0, 100)).toEqual({ commissionCents: 0, driverFeeCents: 850, earningsCents: 850 });
    expect(splitDelivery(850, 0, 92.5)).toEqual({ commissionCents: 64, driverFeeCents: 786, earningsCents: 786 });
  });

  it('las variables de entorno se leen en soles y se validan al arrancar', () => {
    expect(parseDriverPay({})).toEqual(DEFAULT_DRIVER_PAY);
    expect(parseDriverPay({ DRIVER_SHARE_PERCENT: '92,5', DRIVER_MIN_AUTO_PAYOUT_SOLES: '10', DRIVER_MIN_MANUAL_PAYOUT_SOLES: '2.50' })).toEqual({
      sharePercent: 92.5,
      minAutoPayoutCents: 1000,
      minManualPayoutCents: 250,
      maxDebtCents: 3000,
    });
    expect(parseDriverPay({ DRIVER_MAX_DEBT_SOLES: '50' }).maxDebtCents).toBe(5000);
    expect(() => parseDriverPay({ DRIVER_MAX_DEBT_SOLES: '-1' })).toThrow('negativo');
    expect(() => parseDriverPay({ DRIVER_SHARE_PERCENT: '120' })).toThrow('entre 50 y 100');
    expect(() => parseDriverPay({ DRIVER_SHARE_PERCENT: 'noventa' })).toThrow('debe ser un número');
    expect(() => parseDriverPay({ DRIVER_MIN_AUTO_PAYOUT_SOLES: '0.5' })).toThrow('al menos 1');
  });
});
