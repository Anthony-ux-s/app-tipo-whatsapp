import type { GeoPoint } from '@parla/types';

/** Distancia en línea recta entre dos puntos (km, fórmula del haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Velocidad media en la ciudad (km/h) y factor de calles frente a la línea recta. */
const CITY_KMH = 20;
const STREET_FACTOR = 1.35;

/** Minutos estimados para recorrer los tramos (repartidor → tienda → cliente), con 2 min de margen. */
export function etaMinutes(...legs: (readonly [GeoPoint, GeoPoint])[]): number {
  const km = legs.reduce((sum, [a, b]) => sum + distanceKm(a, b), 0) * STREET_FACTOR;
  return Math.max(2, Math.round((km / CITY_KMH) * 60) + 2);
}

export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 100) * 10} m` : `${km.toFixed(1)} km`;
}

/** Sin señal del repartidor si su última ubicación tiene más de 2 minutos. */
export function isStale(at: string, now = Date.now()): boolean {
  return now - new Date(at).getTime() > 2 * 60_000;
}

/** Centro por defecto del mapa (Cajamarca) cuando aún no hay puntos. */
export const DEFAULT_CENTER: GeoPoint = { lat: -7.1638, lng: -78.5003 };

/** La ciudad donde opera Parla: las búsquedas de direcciones la prefieren. */
export const DEFAULT_CITY = 'Cajamarca';
