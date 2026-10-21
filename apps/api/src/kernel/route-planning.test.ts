import { describe, expect, it } from 'vitest';
import { DEFAULT_DELIVERY_PRICING, assertDeliveryPricing, fuelCostCents, priceDelivery, withPricingDefaults } from './delivery-pricing';
import { ValidationError } from './domain-error';
import { isFeasible, planRoute, routeKm, type PlanStop } from './route-planning';

/** Distancia «de cuadrícula» para que los resultados sean exactos en las pruebas. */
const line = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.abs(a.lat - b.lat) + Math.abs(a.lng - b.lng);
const p = (x: number) => ({ lat: x, lng: 0 });
const stop = (orderId: string, kind: 'pickup' | 'dropoff', x: number): PlanStop => ({ orderId, kind, point: p(x) });

/** Todas las permutaciones factibles (para comparar con el óptimo). */
function bruteForce(start: { lat: number; lng: number }, stops: PlanStop[]): number {
  let best = Infinity;
  const go = (left: PlanStop[], done: PlanStop[]) => {
    if (!left.length) {
      if (isFeasible(done)) best = Math.min(best, routeKm(start, done, line));
      return;
    }
    left.forEach((s, i) => go([...left.slice(0, i), ...left.slice(i + 1)], [...done, s]));
  };
  go(stops, []);
  return best;
}

describe('plan de paradas del repartidor', () => {
  it('nunca entrega un pedido antes de recogerlo', () => {
    // La entrega de A queda al lado del repartidor, pero la tienda está lejos.
    const plan = planRoute(p(0), [stop('A', 'dropoff', 1), stop('A', 'pickup', 10)], line);
    expect(plan.stops.map((s) => s.kind)).toEqual(['pickup', 'dropoff']);
    expect(plan.totalKm).toBe(19);
  });

  it('una entrega ya recogida (sin recojo en la lista) se puede hacer primero', () => {
    const plan = planRoute(p(0), [stop('B', 'pickup', 8), stop('B', 'dropoff', 9), stop('A', 'dropoff', 2)], line);
    expect(plan.stops.map((s) => `${s.orderId}-${s.kind}`)).toEqual(['A-dropoff', 'B-pickup', 'B-dropoff']);
    expect(plan.legsKm).toEqual([2, 6, 1]);
  });

  it('encuentra el óptimo con varias tiendas y clientes (búsqueda exacta)', () => {
    const stops = [stop('A', 'pickup', 5), stop('A', 'dropoff', -3), stop('B', 'pickup', 1), stop('B', 'dropoff', 7), stop('C', 'pickup', -1), stop('C', 'dropoff', 4)];
    const plan = planRoute(p(0), stops, line);
    expect(isFeasible(plan.stops)).toBe(true);
    expect(plan.totalKm).toBe(bruteForce(p(0), stops));
  });

  it('con muchas paradas usa la heurística y sigue siendo factible y mejor que el orden de llegada', () => {
    const stops = Array.from({ length: 6 }, (_, i) => [stop(`O${i}`, 'pickup', (i * 7) % 11), stop(`O${i}`, 'dropoff', (i * 5) % 13 - 4)]).flat();
    const plan = planRoute(p(0), stops, line);
    expect(plan.stops).toHaveLength(12);
    expect(isFeasible(plan.stops)).toBe(true);
    expect(plan.totalKm).toBeLessThanOrEqual(routeKm(p(0), stops, line));
  });
});

describe('tarifa del delivery', () => {
  it('suma base, km y combustible con margen, y redondea a 10 céntimos', () => {
    const q = priceDelivery(DEFAULT_DELIVERY_PRICING, { distanceKm: 5, method: 'streets' });
    // 300 + 5 × 60 + (5 / 110 gal × 1700 × 1.6 ≈ 124) = 724 → 720
    expect(q.distanceCents).toBe(300);
    expect(q.fuelCents).toBe(124);
    expect(q.feeCents).toBe(720);
    expect(q.etaMinutes).toBe(10 + Math.round((5 / 24) * 60));
  });

  it('respeta el mínimo y el máximo', () => {
    expect(priceDelivery(DEFAULT_DELIVERY_PRICING, { distanceKm: 0.2, method: 'streets' }).feeCents).toBe(400);
    expect(priceDelivery(DEFAULT_DELIVERY_PRICING, { distanceKm: 80, method: 'streets' }).feeCents).toBe(2500);
  });

  it('sin ubicaciones cobra la tarifa plana', () => {
    expect(priceDelivery(DEFAULT_DELIVERY_PRICING, { distanceKm: null, method: 'flat' })).toMatchObject({ feeCents: 650, method: 'flat' });
  });

  it('cotizar solo por combustible: precio por km en cero y el auto gasta más que la moto', () => {
    const pricing = { ...DEFAULT_DELIVERY_PRICING, perKmCents: 0, minFeeCents: 0, baseFeeCents: 0 };
    const moto = priceDelivery(pricing, { distanceKm: 10, method: 'streets', vehicle: 'Moto' });
    const auto = priceDelivery(pricing, { distanceKm: 10, method: 'streets', vehicle: 'Auto' });
    expect(moto.distanceCents).toBe(0);
    expect(auto.fuelCents).toBeGreaterThan(moto.fuelCents);
    expect(fuelCostCents(pricing, 'Bicicleta', 10)).toBe(0);
  });

  it('rechaza tarifas sin sentido y completa campos nuevos', () => {
    expect(() => assertDeliveryPricing({ ...DEFAULT_DELIVERY_PRICING, minFeeCents: 3000 })).toThrow(ValidationError);
    expect(() => assertDeliveryPricing({ ...DEFAULT_DELIVERY_PRICING, streetFactor: 0.5 })).toThrow(ValidationError);
    expect(withPricingDefaults({ perKmCents: 90, kmPerGallon: { Moto: 90 } as never }).kmPerGallon.Auto).toBe(40);
  });
});
