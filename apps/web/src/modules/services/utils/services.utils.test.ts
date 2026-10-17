import { describe, expect, it } from 'vitest';
import { formatSoles } from '@shared/utils/money';
import { discountPercent, isFinalStatus, minutesLeft, orderStepIndex, parseShoppingQuery } from './services.utils';

describe('servicios', () => {
  it('entiende un pedido escrito como se habla', () => {
    expect(parseShoppingQuery('un kilo de azúcar, arroz')).toEqual(['azúcar', 'arroz']);
    expect(parseShoppingQuery('2 latas de atún y leche evaporada')).toEqual(['atún', 'leche evaporada']);
    expect(parseShoppingQuery('Arroz, arroz ,  ')).toEqual(['arroz']);
    expect(parseShoppingQuery('de la')).toEqual([]);
  });

  it('ubica el pedido en la línea de tiempo y sabe cuándo terminó', () => {
    expect(orderStepIndex('pending_payment')).toBe(0);
    expect(orderStepIndex('paid')).toBe(1);
    expect(orderStepIndex('preparing')).toBe(1);
    expect(orderStepIndex('searching_driver')).toBe(2);
    expect(orderStepIndex('on_the_way')).toBe(3);
    expect(orderStepIndex('delivered')).toBe(4);
    expect(isFinalStatus('rejected')).toBe(true);
    expect(isFinalStatus('delivered')).toBe(true);
    expect(isFinalStatus('searching_driver')).toBe(false);
  });

  it('calcula el descuento de una oferta', () => {
    expect(discountPercent(1090, 1290)).toBe(16);
    expect(discountPercent(500, undefined)).toBe(0);
    expect(discountPercent(500, 400)).toBe(0);
  });

  it('montos en soles y minutos para pagar', () => {
    expect(formatSoles(2070)).toBe('S/ 20.70');
    expect(formatSoles(5)).toBe('S/ 0.05');
    const now = Date.now();
    expect(minutesLeft(new Date(now + 90_000).toISOString(), now)).toBe(2);
    expect(minutesLeft(new Date(now - 1).toISOString(), now)).toBe(0);
  });
});
