import type { RouletteCampaignInput, RoulettePrize } from '@parla/types';
import { describe, expect, it } from 'vitest';
import { belongsTo, segmentOf, type CustomerStats } from './customer-segments';
import { assertRoulette, expectedCostPercent, pickPrize, spinSlot } from './roulette';

const prize = (id: string, over: Partial<RoulettePrize> = {}): RoulettePrize => ({
  id,
  label: id,
  kind: 'percent',
  value: 10,
  maxDiscountCents: null,
  minSubtotalCents: 0,
  validDays: 7,
  weight: 10,
  ...over,
});
const none = (id: string, weight = 10) => prize(id, { kind: 'none', value: 0, weight });

const campaign = (prizes: RoulettePrize[]): RouletteCampaignInput => ({ kind: 'roulette', startsAt: null, endsAt: null, name: 'Bienvenida', title: '¡Gira y gana!', subtitle: '', segment: 'new', cooldownDays: 1, testMode: false, prizes });

describe('sorteo de la ruleta', () => {
  const prizes = [prize('a', { weight: 1 }), prize('b', { weight: 3 }), none('c', 6)];

  it('el número cae en el premio que le toca por su peso', () => {
    expect(pickPrize(prizes, 0).prize.id).toBe('a');
    expect(pickPrize(prizes, 1).prize.id).toBe('b');
    expect(pickPrize(prizes, 3).prize.id).toBe('b');
    expect(pickPrize(prizes, 4).prize.id).toBe('c');
    expect(pickPrize(prizes, 9).index).toBe(2);
  });

  it('con azar real respeta las probabilidades (≈ 60 % «sin premio»)', () => {
    const counts = { a: 0, b: 0, c: 0 } as Record<string, number>;
    for (let i = 0; i < 20_000; i++) counts[pickPrize(prizes).prize.id] += 1;
    expect(counts.c / 20_000).toBeGreaterThan(0.56);
    expect(counts.c / 20_000).toBeLessThan(0.64);
    expect(counts.a / 20_000).toBeLessThan(0.14);
  });

  it('estima el costo por giro sobre una compra de S/ 50', () => {
    // 10 % de S/ 50 = S/ 5; solo pesa el 40 % de los giros.
    expect(expectedCostPercent(prizes)).toBe(4);
    expect(expectedCostPercent([none('x'), none('y')])).toBe(0);
  });

  it('un período de espera no se repite dentro de los mismos días', () => {
    const d = (day: number) => new Date(Date.UTC(2026, 9, day, 15));
    expect(spinSlot(d(22), 1)).not.toBe(spinSlot(d(23), 1));
    expect(spinSlot(d(22), 7)).toBe(spinSlot(d(23), 7));
  });
});

describe('validación de la ruleta', () => {
  const four = [prize('a'), prize('b'), prize('c'), none('d')];

  it('acepta una rueda completa', () => {
    expect(() => assertRoulette(campaign(four))).not.toThrow();
  });

  it('pide entre 4 y 12 premios, distintos y con peso', () => {
    expect(() => assertRoulette(campaign(four.slice(0, 3)))).toThrow(/de 4 a 12/);
    expect(() => assertRoulette(campaign([...four.slice(0, 3), prize('a')]))).toThrow(/identificador/);
    expect(() => assertRoulette(campaign([...four.slice(0, 3), none('d', 0)]))).toThrow(/probabilidad/);
  });

  it('revisa el porcentaje y el texto de cada premio', () => {
    expect(() => assertRoulette(campaign([prize('a', { value: 150 }), ...four.slice(1)]))).toThrow(/porcentaje/);
    expect(() => assertRoulette(campaign([prize('a', { label: 'x'.repeat(30) }), ...four.slice(1)]))).toThrow(/24 letras/);
  });
});

describe('grupos de clientes', () => {
  const now = new Date('2026-10-22T12:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  const stats = (over: Partial<CustomerStats>): CustomerStats => ({ deliveredOrders: 0, paidOrders: 0, spentCents: 0, lastOrderAt: null, registeredAt: daysAgo(100), ...over });

  it('ubica a cada cliente en el grupo más específico', () => {
    expect(segmentOf(stats({ registeredAt: daysAgo(3) }), now)).toBe('new');
    expect(segmentOf(stats({}), now)).toBe('never_bought');
    expect(segmentOf(stats({ paidOrders: 2, deliveredOrders: 2, spentCents: 5000, lastOrderAt: daysAgo(60) }), now)).toBe('lapsed');
    expect(segmentOf(stats({ paidOrders: 3, deliveredOrders: 3, spentCents: 9000, lastOrderAt: daysAgo(5) }), now)).toBe('loyal');
    expect(segmentOf(stats({ paidOrders: 1, deliveredOrders: 1, spentCents: 3000, lastOrderAt: daysAgo(5) }), now)).toBe('all');
  });

  it('los mejores clientes lo son por pedidos o por gasto, aunque lleven tiempo sin comprar', () => {
    expect(segmentOf(stats({ paidOrders: 5, deliveredOrders: 5, spentCents: 8000, lastOrderAt: daysAgo(90) }), now)).toBe('vip');
    expect(segmentOf(stats({ paidOrders: 1, deliveredOrders: 1, spentCents: 45_000, lastOrderAt: daysAgo(2) }), now)).toBe('vip');
  });

  it('la ruleta «todos» solo sale si el grupo no tiene una propia', () => {
    const own = new Set(['vip']);
    expect(belongsTo('vip', 'vip', (s) => own.has(s))).toBe(true);
    expect(belongsTo('all', 'vip', (s) => own.has(s))).toBe(false);
    expect(belongsTo('all', 'new', (s) => own.has(s))).toBe(true);
    expect(belongsTo('new', 'vip', (s) => own.has(s))).toBe(false);
  });
});

describe('otras estrategias de campaña', () => {
  const two = [prize('a'), none('b')];
  const flash = (over: Partial<RouletteCampaignInput> = {}): RouletteCampaignInput => ({ ...campaign([prize('a')]), kind: 'flash', endsAt: '2026-11-01T12:00:00Z', ...over });

  it('rasca y gana y cofre sorpresa aceptan de 2 premios en adelante', () => {
    expect(() => assertRoulette({ ...campaign(two), kind: 'scratch' })).not.toThrow();
    expect(() => assertRoulette({ ...campaign(two), kind: 'box' })).not.toThrow();
    expect(() => assertRoulette({ ...campaign([prize('a')]), kind: 'box' })).toThrow(/2 a 12/);
  });

  it('la oferta relámpago lleva un solo premio con descuento y una fecha de fin', () => {
    expect(() => assertRoulette(flash())).not.toThrow();
    expect(() => assertRoulette(flash({ endsAt: null }))).toThrow(/fecha y hora de fin/);
    expect(() => assertRoulette(flash({ prizes: two }))).toThrow(/un solo premio/);
    expect(() => assertRoulette(flash({ prizes: [none('a')] }))).toThrow(/un solo premio/);
  });

  it('el fin tiene que ser después del inicio', () => {
    expect(() => assertRoulette(flash({ startsAt: '2026-11-02T00:00:00Z' }))).toThrow(/después/);
    expect(() => assertRoulette(flash({ endsAt: 'mañana' }))).toThrow(/fechas/);
  });
});
