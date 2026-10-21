import type { GeoPoint } from '@parla/types';

export interface StreetRoute {
  distanceKm: number;
  /** Minutos que calcula el servicio (auto, sin tráfico). */
  minutes: number;
  path: GeoPoint[];
}

/** Ruta por las calles entre puntos, en orden. null si el servicio no responde a tiempo. */
export interface StreetRouter {
  route(points: GeoPoint[]): Promise<StreetRoute | null>;
}

export const STREET_ROUTER = Symbol('STREET_ROUTER');
