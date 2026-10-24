import { afterEach, describe, expect, it, vi } from 'vitest';
import { bigOrderEscalation, bigOrderRulesOf, isBigOrder, orderUnits, whatsappDigits } from './big-order';

const own = (over: Partial<Parameters<typeof bigOrderRulesOf>[0]> = {}) => ({ bigOrderCents: null, bigOrderUnits: null, adminWhatsapp: '', ...over });
const order = (totalCents: number, ...quantities: number[]) => ({ totalCents, lines: quantities.map((quantity) => ({ quantity })) });

describe('pedido grande', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('sin umbrales propios valen S/ 600 y 25 unidades', () => {
    expect(bigOrderRulesOf(own())).toEqual({ totalCents: 60_000, units: 25, whatsapp: null });
  });

  it('los umbrales generales se cambian con BIG_ORDER_*, y los de la tienda mandan sobre ellos', () => {
    vi.stubEnv('BIG_ORDER_TOTAL_CENTS', '100000');
    vi.stubEnv('BIG_ORDER_UNITS', '10');
    expect(bigOrderRulesOf(own())).toMatchObject({ totalCents: 100_000, units: 10 });
    expect(bigOrderRulesOf(own({ bigOrderCents: 30_000, bigOrderUnits: 5 }))).toMatchObject({ totalCents: 30_000, units: 5 });
    // Un valor que no sirve no apaga la regla: vuelve a los de siempre.
    vi.stubEnv('BIG_ORDER_TOTAL_CENTS', 'mucho');
    expect(bigOrderRulesOf(own()).totalCents).toBe(60_000);
  });

  it('es grande si el total llega al umbral O si lleva suficientes unidades', () => {
    const rules = bigOrderRulesOf(own());
    expect(isBigOrder(order(2_070, 2, 1), rules)).toBe(false);
    expect(isBigOrder(order(59_999, 1), rules)).toBe(false);
    expect(isBigOrder(order(60_000, 1), rules)).toBe(true);
    expect(isBigOrder(order(3_000, 24), rules)).toBe(false);
    expect(isBigOrder(order(3_000, 20, 5), rules)).toBe(true);
    expect(orderUnits([{ quantity: 2 }, { quantity: 3 }])).toBe(5);
  });

  it('el WhatsApp queda solo con dígitos (para wa.me) o en null', () => {
    expect(whatsappDigits('+51 987-654-321')).toBe('51987654321');
    expect(bigOrderRulesOf(own({ adminWhatsapp: '+51 987 654 321' })).whatsapp).toBe('51987654321');
    expect(bigOrderRulesOf(own({ adminWhatsapp: '  ' })).whatsapp).toBeNull();
  });

  it('el escalamiento es a los 10 y a los 20 minutos, y se configura sin que el segundo pase al primero', () => {
    expect(bigOrderEscalation()).toEqual({ firstMinutes: 10, secondMinutes: 20 });
    vi.stubEnv('BIG_ORDER_REMIND_MINUTES', '30');
    vi.stubEnv('BIG_ORDER_SUPPORT_MINUTES', '5');
    expect(bigOrderEscalation()).toEqual({ firstMinutes: 30, secondMinutes: 31 });
  });
});
