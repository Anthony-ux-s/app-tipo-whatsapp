/**
 * Asignación óptima pedido → repartidor (algoritmo húngaro, Kuhn-Munkres, O(n³)): entre todas las
 * formas de repartir, la de menor costo total. «Darle cada pedido al más cercano» no siempre es lo
 * mejor: con A→X 2, B→X 3, A→Y 3, B→Y 9 minutos, el más cercano da 2 + 9 = 11 y el óptimo, 3 + 3 = 6.
 */

/** Costo de una pareja imposible (repartidor lleno, sin ubicación…). */
export const FORBIDDEN = Number.POSITIVE_INFINITY;

/**
 * Resuelve una matriz de costos (filas = pedidos, columnas = repartidores; puede ser rectangular).
 * Devuelve, para cada fila, la columna asignada o -1 si quedó sin asignar (más filas que columnas, o
 * solo parejas imposibles).
 */
export function hungarian(cost: number[][]): number[] {
  const rows = cost.length;
  const cols = rows ? cost[0].length : 0;
  if (!rows || !cols) return new Array<number>(rows).fill(-1);
  const n = Math.max(rows, cols);
  // Lo imposible se reemplaza por un costo enorme (finito, para que el algoritmo funcione) y después se descarta.
  const finite = cost.flat().filter(Number.isFinite);
  const big = (finite.length ? Math.max(...finite.map(Math.abs)) : 1) * (n + 1) * 10 + 1;
  const a = (i: number, j: number) => (i < rows && j < cols && Number.isFinite(cost[i][j]) ? cost[i][j] : big);

  // Versión con potenciales (índices desde 1): u filas, v columnas, p[j] = fila asignada a la columna j.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const p = new Array<number>(n + 1).fill(0);
  const way = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = a(i0 - 1, j - 1) - u[i0] - v[j];
        if (cur < minv[j]) [minv[j], way[j]] = [cur, j0];
        if (minv[j] < delta) [delta, j1] = [minv[j], j];
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }

  const result = new Array<number>(rows).fill(-1);
  for (let j = 1; j <= n; j++) {
    const i = p[j] - 1;
    if (i >= 0 && i < rows && j - 1 < cols && Number.isFinite(cost[i][j - 1])) result[i] = j - 1;
  }
  return result;
}

export interface AssignmentOrder {
  id: string;
  /** Minutos que lleva esperando repartidor: si no alcanzan los repartidores, van primero los que más esperan. */
  waitingMinutes: number;
}

export interface AssignmentDriver {
  id: string;
  /** Pedidos que ya lleva y cuántos más puede tomar. */
  load: number;
  capacity: number;
}

export interface AssignmentWeights {
  /** Minutos que «cuesta» cada pedido que el repartidor ya lleva (para repartir la carga). */
  perActiveOrder: number;
  /** Cuánto pesa cada minuto de espera del pedido al decidir cuáles se atienden primero. */
  waitingWeight: number;
}

export const DEFAULT_WEIGHTS: AssignmentWeights = { perActiveOrder: 4, waitingWeight: 2 };

/**
 * Elige qué repartidor lleva cada pedido. `minutes(o, d)` es lo que tarda el repartidor en llegar a
 * la tienda del pedido por las calles (null = no puede: sin ubicación, lejos…). Cada repartidor recibe
 * a lo sumo un pedido por ronda (la siguiente ronda reparte los demás con su carga actualizada).
 * Devuelve las parejas elegidas.
 */
export function assignOrders(
  orders: AssignmentOrder[],
  drivers: AssignmentDriver[],
  minutes: (order: AssignmentOrder, driver: AssignmentDriver) => number | null,
  weights: AssignmentWeights = DEFAULT_WEIGHTS,
): { orderId: string; driverId: string; minutes: number }[] {
  const free = drivers.filter((d) => d.load < d.capacity);
  if (!orders.length || !free.length) return [];
  const travel = orders.map((o) => free.map((d) => minutes(o, d)));
  // Con más pedidos que repartidores, columnas «sin repartidor»: quedarse sin asignar sale más caro
  // para el que más espera, así los repartidores van primero a esos.
  const extra = Math.max(0, orders.length - free.length);
  const worst = Math.max(1, ...travel.flat().filter((m): m is number => m !== null)) + weights.perActiveOrder * 10;
  const cost = orders.map((o, i) => [
    ...free.map((d, j) => (travel[i][j] === null ? FORBIDDEN : travel[i][j]! + d.load * weights.perActiveOrder)),
    ...new Array<number>(extra).fill(worst * 10 + o.waitingMinutes * weights.waitingWeight),
  ]);
  return hungarian(cost).flatMap((j, i) => (j >= 0 && j < free.length ? [{ orderId: orders[i].id, driverId: free[j].id, minutes: travel[i][j]! }] : []));
}
