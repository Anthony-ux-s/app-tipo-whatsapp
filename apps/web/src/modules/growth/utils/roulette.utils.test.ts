import type { MyInterests, Product } from '@parla/types';
import { describe, expect, it } from 'vitest';
import { landingRotation, rankForYou, sliceAngles } from './roulette.utils';

describe('rueda', () => {
  it('el gajo elegido queda bajo la flecha', () => {
    for (const index of [0, 3, 7]) {
      const rotation = landingRotation(0, index, 8, 5);
      const slice = 360 / 8;
      // El centro del gajo, ya girado, debe quedar en 0° (arriba).
      const center = (((index + 0.5) * slice + rotation) % 360 + 360) % 360;
      expect(Math.round(center) % 360).toBe(0);
    }
  });

  it('siempre gira hacia adelante, también en el segundo giro', () => {
    const first = landingRotation(0, 2, 6);
    expect(landingRotation(first, 5, 6)).toBeGreaterThan(first + 360);
  });

  it('reparte 360° entre los gajos', () => {
    const angles = sliceAngles(6);
    expect(angles[5].end).toBe(360);
    expect(angles[1].mid).toBe(90);
  });
});

const product = (id: string, category: string, priceCents: number, listPriceCents?: number): Product => ({
  id,
  name: `Producto ${id}`,
  unit: '1 u',
  priceCents,
  currency: 'PEN',
  stock: 10,
  category,
  imageUrl: null,
  listPriceCents,
});

describe('ofertas para ti', () => {
  const catalog = [product('r1', 'ropa', 5000, 8000), product('r2', 'ropa', 3000, 3500), product('b1', 'bebidas', 300, 600), product('l1', 'lacteos', 500)];
  const now = new Date('2026-10-22T12:00:00Z').getTime();
  const interests = (over: Partial<MyInterests>): MyInterests => ({ purchases: [], searches: [], ...over });

  it('sin historial no recomienda nada', () => {
    expect(rankForYou(catalog, interests({}), 8, now).products).toEqual([]);
    expect(rankForYou(catalog, null, 8, now).products).toEqual([]);
  });

  it('quien compra ropa ve primero las ofertas de ropa', () => {
    const found = rankForYou(catalog, interests({ purchases: [{ productId: 'r2', quantity: 4, lastAt: '2026-10-20T00:00:00Z' }] }), 8, now);
    expect(found.categories[0]).toBe('ropa');
    expect(found.products[0].id).toBe('r1');
    expect(found.products.map((p) => p.category)).not.toContain('bebidas');
  });

  it('lo que busca también cuenta, aunque no haya comprado', () => {
    const found = rankForYou(catalog, interests({ searches: [{ term: 'bebidas', count: 3 }] }), 8, now);
    expect(found.products.map((p) => p.id)).toEqual(['b1']);
  });
});
