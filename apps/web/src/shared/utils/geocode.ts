import type { GeoPoint } from '@parla/types';
import { DEFAULT_CENTER } from './geo';

export interface PlaceResult {
  /** Nombre completo del lugar, como lo escribe OpenStreetMap. */
  label: string;
  point: GeoPoint;
}

/** Zona donde se prefieren los resultados (alrededor de la ciudad por defecto): sesgo, no un límite. */
const BIAS = 0.35;

/**
 * Busca una dirección o lugar en OpenStreetMap (Nominatim, sin clave). Solo se llama cuando la persona
 * pulsa «Buscar» (su política no permite pedir resultados letra por letra).
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const viewbox = [DEFAULT_CENTER.lng - BIAS, DEFAULT_CENTER.lat + BIAS, DEFAULT_CENTER.lng + BIAS, DEFAULT_CENTER.lat - BIAS].join(',');
  const params = new URLSearchParams({ format: 'jsonv2', q, limit: '5', 'accept-language': 'es', viewbox, bounded: '0' });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal });
  if (!response.ok) throw new Error('No pudimos buscar ese lugar. Inténtalo de nuevo.');
  const rows = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  return rows
    .map((r) => ({ label: r.display_name, point: { lat: Number(r.lat), lng: Number(r.lon) } }))
    .filter((r) => Number.isFinite(r.point.lat) && Number.isFinite(r.point.lng));
}
