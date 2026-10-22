import { describe, expect, it } from 'vitest';
import { FORBIDDEN, assignOrders, hungarian } from './assignment';

/** Costo total de una asignación (para comparar con todas las posibles). */
const total = (cost: number[][], assignment: number[]) => assignment.reduce((s, j, i) => s + (j >= 0 ? cost[i][j] : 0), 0);

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, k) => [...p.slice(0, k), n - 1, ...p.slice(k)]));
}

describe('algoritmo húngaro', () => {
  it('encuentra el reparto óptimo donde «el más cercano primero» falla', () => {
    // Filas: pedidos A y B. Columnas: repartidores X e Y (minutos hasta la tienda).
    const cost = [
      [2, 3],
      [3, 9],
    ];
    const result = hungarian(cost);
    expect(result).toEqual([1, 0]); // A → Y, B → X
    expect(total(cost, result)).toBe(6); // el más cercano primero daría 2 + 9 = 11
  });

  it('coincide con probar todas las combinaciones (matrices al azar)', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 30;
    for (let round = 0; round < 25; round++) {
      const n = 2 + (round % 5);
      const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.round(rand())));
      const best = Math.min(...permutations(n).map((p) => total(cost, p)));
      expect(total(cost, hungarian(cost))).toBe(best);
    }
  });

  it('respeta las parejas imposibles y las matrices rectangulares', () => {
    expect(hungarian([[FORBIDDEN, 4], [1, FORBIDDEN]])).toEqual([1, 0]);
    // Tres pedidos y un repartidor: solo uno queda asignado.
    expect(hungarian([[5], [1], [3]]).filter((j) => j >= 0)).toHaveLength(1);
    expect(hungarian([[FORBIDDEN]])).toEqual([-1]);
  });
});

describe('asignación de pedidos a repartidores', () => {
  const minutes = (table: Record<string, number | null>) => (o: { id: string }, d: { id: string }) => table[`${o.id}-${d.id}`] ?? null;

  it('minimiza el total de minutos hasta las tiendas', () => {
    const pairs = assignOrders(
      [{ id: 'A', waitingMinutes: 0 }, { id: 'B', waitingMinutes: 0 }],
      [{ id: 'X', load: 0, capacity: 3 }, { id: 'Y', load: 0, capacity: 3 }],
      minutes({ 'A-X': 2, 'B-X': 3, 'A-Y': 3, 'B-Y': 9 }),
    );
    expect(pairs).toEqual([{ orderId: 'A', driverId: 'Y', minutes: 3 }, { orderId: 'B', driverId: 'X', minutes: 3 }]);
  });

  it('no le da pedidos a un repartidor lleno y reparte la carga', () => {
    const pairs = assignOrders(
      [{ id: 'A', waitingMinutes: 0 }],
      [{ id: 'X', load: 3, capacity: 3 }, { id: 'Y', load: 1, capacity: 3 }, { id: 'Z', load: 0, capacity: 3 }],
      // Y y Z están a la misma distancia: Z va vacío, así que gana.
      minutes({ 'A-X': 1, 'A-Y': 5, 'A-Z': 5 }),
    );
    expect(pairs).toEqual([{ orderId: 'A', driverId: 'Z', minutes: 5 }]);
  });

  it('con menos repartidores que pedidos, atiende primero al que más espera', () => {
    const pairs = assignOrders(
      [{ id: 'nuevo', waitingMinutes: 0 }, { id: 'viejo', waitingMinutes: 12 }],
      [{ id: 'X', load: 0, capacity: 3 }],
      minutes({ 'nuevo-X': 2, 'viejo-X': 3 }),
    );
    expect(pairs).toEqual([{ orderId: 'viejo', driverId: 'X', minutes: 3 }]);
  });

  it('sin parejas posibles no asigna nada', () => {
    expect(assignOrders([{ id: 'A', waitingMinutes: 0 }], [{ id: 'X', load: 0, capacity: 2 }], () => null)).toEqual([]);
  });
});
