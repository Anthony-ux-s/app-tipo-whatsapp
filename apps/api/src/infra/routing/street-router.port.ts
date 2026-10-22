import type { GeoPoint } from '@parla/types';

export interface StreetRoute {
  distanceKm: number;
  /** Minutos que calcula el servicio (auto, sin tráfico). */
  minutes: number;
  path: GeoPoint[];
}

/** Tabla de distancias por las calles: [origen][destino] (null = sin camino entre esos dos). */
export interface StreetMatrix {
  km: (number | null)[][];
  minutes: (number | null)[][];
}

export interface StreetRouter {
  /** Ruta por las calles entre puntos, en orden. null si el servicio no responde a tiempo. */
  route(points: GeoPoint[]): Promise<StreetRoute | null>;
  /**
   * Caminos más cortos por las calles de cada origen a cada destino (el servidor de rutas los calcula
   * con Dijkstra sobre el mapa, acelerado con jerarquías de contracción). null si no responde.
   */
  matrix(sources: GeoPoint[], destinations: GeoPoint[]): Promise<StreetMatrix | null>;
}

export const STREET_ROUTER = Symbol('STREET_ROUTER');
