import type { GeoPoint } from '@parla/types';
import { distanceKm } from './geo';

/**
 * Plan de paradas del repartidor (problema de recojo y entrega, PDP): visitar todas las paradas con el
 * menor recorrido, sin entregar un pedido antes de recogerlo.
 *
 *  - Hasta EXACT_LIMIT paradas: búsqueda exhaustiva con poda (ramificación y acotamiento): óptimo.
 *  - Más paradas: vecino más cercano factible y luego mejora local (reubicar cada parada y 2-opt)
 *    mientras acorte el recorrido y respete el orden recojo → entrega.
 */
export interface PlanStop {
  orderId: string;
  kind: 'pickup' | 'dropoff';
  point: GeoPoint;
}

export interface Plan<S extends PlanStop> {
  stops: S[];
  /** Km de cada tramo (el primero, desde el inicio si hay). */
  legsKm: number[];
  totalKm: number;
}

export type DistanceFn = (a: GeoPoint, b: GeoPoint) => number;

const EXACT_LIMIT = 9;

/** Km totales de recorrer las paradas en orden (desde `start`, si se conoce). */
export function routeKm(start: GeoPoint | null, stops: PlanStop[], distance: DistanceFn = distanceKm): number {
  let total = 0;
  let at = start;
  for (const s of stops) {
    if (at) total += distance(at, s.point);
    at = s.point;
  }
  return total;
}

/** ¿Respeta el orden? Cada entrega va después de su recojo (si el recojo está en la lista). */
export function isFeasible(stops: PlanStop[]): boolean {
  const picked = new Set<string>();
  const pending = new Set(stops.filter((s) => s.kind === 'pickup').map((s) => s.orderId));
  for (const s of stops) {
    if (s.kind === 'pickup') picked.add(s.orderId);
    else if (pending.has(s.orderId) && !picked.has(s.orderId)) return false;
  }
  return true;
}

function legs(start: GeoPoint | null, stops: PlanStop[], distance: DistanceFn): number[] {
  return stops.map((s, i) => {
    const from = i === 0 ? start : stops[i - 1].point;
    return from ? distance(from, s.point) : 0;
  });
}

function exact<S extends PlanStop>(start: GeoPoint | null, stops: S[], distance: DistanceFn): S[] {
  const n = stops.length;
  const d = stops.map((a) => stops.map((b) => distance(a.point, b.point)));
  const fromStart = stops.map((s) => (start ? distance(start, s.point) : 0));
  const pickupIndex = new Map(stops.flatMap((s, i) => (s.kind === 'pickup' ? [[s.orderId, i] as const] : [])));
  let best = Infinity;
  let bestOrder: number[] = stops.map((_, i) => i);
  const used = new Array<boolean>(n).fill(false);
  const order: number[] = [];

  const visit = (km: number) => {
    if (km >= best) return;
    if (order.length === n) {
      best = km;
      bestOrder = [...order];
      return;
    }
    const last = order[order.length - 1];
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const s = stops[i];
      const pickup = s.kind === 'dropoff' ? pickupIndex.get(s.orderId) : undefined;
      if (pickup !== undefined && !used[pickup]) continue;
      used[i] = true;
      order.push(i);
      visit(km + (last === undefined ? fromStart[i] : d[last][i]));
      order.pop();
      used[i] = false;
    }
  };
  visit(0);
  return bestOrder.map((i) => stops[i]);
}

function nearestNeighbor<S extends PlanStop>(start: GeoPoint | null, stops: S[], distance: DistanceFn): S[] {
  const left = [...stops];
  const out: S[] = [];
  const picked = new Set<string>();
  const needsPickup = new Set(stops.filter((s) => s.kind === 'pickup').map((s) => s.orderId));
  let at = start ?? left[0]?.point ?? null;
  while (left.length) {
    let bestIdx = -1;
    let bestKm = Infinity;
    left.forEach((s, i) => {
      if (s.kind === 'dropoff' && needsPickup.has(s.orderId) && !picked.has(s.orderId)) return;
      const km = at ? distance(at, s.point) : 0;
      if (km < bestKm) [bestKm, bestIdx] = [km, i];
    });
    const [next] = left.splice(bestIdx, 1);
    if (next.kind === 'pickup') picked.add(next.orderId);
    out.push(next);
    at = next.point;
  }
  return out;
}

/** Mejora local: reubicar una parada o invertir un tramo (2-opt) mientras acorte y sea factible. */
function improve<S extends PlanStop>(start: GeoPoint | null, initial: S[], distance: DistanceFn): S[] {
  let current = initial;
  let currentKm = routeKm(start, current, distance);
  const consider = (candidate: S[]) => {
    if (!isFeasible(candidate)) return false;
    const km = routeKm(start, candidate, distance);
    if (km + 1e-9 >= currentKm) return false;
    [current, currentKm] = [candidate, km];
    return true;
  };
  for (let round = 0, improved = true; improved && round < 50; round++) {
    improved = false;
    const n = current.length;
    for (let i = 0; i < n && !improved; i++) {
      for (let j = 0; j < n && !improved; j++) {
        if (i === j) continue;
        const moved = [...current];
        const [s] = moved.splice(i, 1);
        moved.splice(j, 0, s);
        improved = consider(moved);
      }
    }
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n && !improved; j++) {
        improved = consider([...current.slice(0, i), ...current.slice(i, j + 1).reverse(), ...current.slice(j + 1)]);
      }
    }
  }
  return current;
}

/** El mejor orden para recorrer las paradas desde `start` (la ubicación del repartidor, si se conoce). */
export function planRoute<S extends PlanStop>(start: GeoPoint | null, stops: S[], distance: DistanceFn = distanceKm): Plan<S> {
  const ordered = stops.length <= 1 ? stops : stops.length <= EXACT_LIMIT ? exact(start, stops, distance) : improve(start, nearestNeighbor(start, stops, distance), distance);
  const legsKm = legs(start, ordered, distance);
  return { stops: ordered, legsKm, totalKm: legsKm.reduce((a, b) => a + b, 0) };
}
