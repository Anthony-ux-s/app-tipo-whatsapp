import type { GeoPoint } from '@parla/types';

/** Servidor de rutas de OpenStreetMap (OSRM). En producción conviene uno propio o un proveedor con clave. */
export const ROUTING_URL = 'https://router.project-osrm.org';
const TIMEOUT_MS = 4_000;

export interface Route {
  /** El recorrido por las calles, para dibujarlo en el mapa. */
  path: GeoPoint[];
  distanceKm: number;
  minutes: number;
}

const cache = new Map<string, Promise<Route | null>>();
/** ~110 m: moverse menos que esto no pide otra ruta (el repartidor manda su ubicación cada 5 s). */
const key = (points: GeoPoint[]) => points.map((p) => `${p.lng.toFixed(3)},${p.lat.toFixed(3)}`).join(';');

/**
 * Ruta en moto/auto por las calles entre los puntos, en orden. Devuelve null si el servicio no
 * responde a tiempo: el mapa vuelve a la línea recta y la hora estimada a la distancia directa.
 */
export function fetchRoute(points: GeoPoint[]): Promise<Route | null> {
  if (points.length < 2) return Promise.resolve(null);
  const k = key(points);
  const cached = cache.get(k);
  if (cached) return cached;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  const request = fetch(`${ROUTING_URL}/route/v1/driving/${k}?overview=simplified&geometries=geojson`, { signal: controller.signal })
    .then((r) => (r.ok ? r.json() : null))
    .then((body: { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] } | null) => {
      const route = body?.routes?.[0];
      if (!route) return null;
      return {
        path: route.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        distanceKm: route.distance / 1000,
        // OSRM calcula para auto sin tráfico: en la ciudad, una moto con tráfico tarda algo más.
        minutes: Math.max(2, Math.round((route.duration / 60) * 1.3) + 2),
      };
    })
    .catch(() => null)
    .finally(() => window.clearTimeout(timer));
  cache.set(k, request);
  // Si falla, no se guarda: se vuelve a intentar con la próxima ubicación.
  void request.then((r) => r === null && cache.delete(k));
  return request;
}
