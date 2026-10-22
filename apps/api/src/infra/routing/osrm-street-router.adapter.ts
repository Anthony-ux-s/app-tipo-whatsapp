import { Inject, Injectable } from '@nestjs/common';
import type { GeoPoint } from '@parla/types';
import { APP_ENV, type AppEnv } from '../../config/env.validation';
import type { StreetMatrix, StreetRoute, StreetRouter } from './street-router.port';

const TIMEOUT_MS = 2_500;
const CACHE_SIZE = 500;
/** El servidor público de OSRM acepta hasta 100 puntos por tabla. */
const MAX_TABLE_POINTS = 100;
const coord = (p: GeoPoint) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`;

/**
 * Rutas por las calles con OSRM (OpenStreetMap). En producción conviene un OSRM propio
 * (ROUTING_URL); si no responde a tiempo, quien llama usa la línea recta con el factor de calles.
 */
@Injectable()
export class OsrmStreetRouter implements StreetRouter {
  private readonly cache = new Map<string, StreetRoute>();

  constructor(@Inject(APP_ENV) private readonly env: Pick<AppEnv, 'routingUrl'>) {}

  async route(points: GeoPoint[]): Promise<StreetRoute | null> {
    if (points.length < 2 || !this.env.routingUrl) return null;
    // ~10 m: dos cotizaciones desde casi el mismo punto comparten la ruta.
    const key = points.map((p) => `${p.lng.toFixed(4)},${p.lat.toFixed(4)}`).join(';');
    const cached = this.cache.get(key);
    if (cached) return cached;
    try {
      const res = await fetch(`${this.env.routingUrl}/route/v1/driving/${key}?overview=simplified&geometries=geojson`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) return null;
      const body = (await res.json()) as { routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[] };
      const r = body.routes?.[0];
      if (!r || !Number.isFinite(r.distance)) return null;
      const route = { distanceKm: r.distance / 1000, minutes: r.duration / 60, path: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })) };
      if (this.cache.size >= CACHE_SIZE) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, route);
      return route;
    } catch {
      return null;
    }
  }

  async matrix(sources: GeoPoint[], destinations: GeoPoint[]): Promise<StreetMatrix | null> {
    if (!sources.length || !destinations.length || !this.env.routingUrl) return null;
    if (sources.length + destinations.length > MAX_TABLE_POINTS) return null;
    const coords = [...sources, ...destinations].map(coord).join(';');
    const src = sources.map((_, i) => i).join(';');
    const dst = destinations.map((_, i) => sources.length + i).join(';');
    try {
      const res = await fetch(`${this.env.routingUrl}/table/v1/driving/${coords}?sources=${src}&destinations=${dst}&annotations=duration,distance`, {
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { code?: string; durations?: (number | null)[][]; distances?: (number | null)[][] };
      if (body.code !== 'Ok' || !body.durations || !body.distances) return null;
      return {
        km: body.distances.map((row) => row.map((m) => (m === null ? null : m / 1000))),
        minutes: body.durations.map((row) => row.map((s) => (s === null ? null : s / 60))),
      };
    } catch {
      return null;
    }
  }
}
