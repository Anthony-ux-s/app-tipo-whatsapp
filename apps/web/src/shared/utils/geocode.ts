import type { GeoPoint } from '@parla/types';
import { DEFAULT_CENTER, DEFAULT_CITY } from './geo';

export interface PlaceResult {
  /** Nombre completo del lugar, como lo escribe OpenStreetMap. */
  label: string;
  point: GeoPoint;
}

/** Zona donde se prefieren los resultados (alrededor de la ciudad por defecto): sesgo, no un límite. */
const BIAS = 0.35;

const ABBREVIATIONS: [RegExp, string][] = [
  [/\bjr\.?(?=\s)/gi, 'Jirón'],
  [/\bav\.?(?=\s)/gi, 'Avenida'],
  [/\bpsje\.?(?=\s)/gi, 'Pasaje'],
  [/\bcal\.?(?=\s)/gi, 'Calle'],
  [/\burb\.?(?=\s)/gi, 'Urbanización'],
];

/** «jr leoncio prado 263» → las formas en que OpenStreetMap puede tenerla escrita, de la más a la menos exacta. */
export function addressVariants(raw: string): string[] {
  const q = raw.trim().replace(/\s+/g, ' ');
  let full = q;
  for (const [pattern, word] of ABBREVIATIONS) full = full.replace(pattern, word);
  const city = new RegExp(DEFAULT_CITY, 'i').test(q) ? '' : `, ${DEFAULT_CITY}`;
  const noNumber = full.replace(/\s+\d+[a-z]?\s*$/i, '');
  return [...new Set([`${full}${city}`, `${q}${city}`, `${noNumber}${city}`, full])];
}

async function nominatim(q: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const viewbox = [DEFAULT_CENTER.lng - BIAS, DEFAULT_CENTER.lat + BIAS, DEFAULT_CENTER.lng + BIAS, DEFAULT_CENTER.lat - BIAS].join(',');
  const params = new URLSearchParams({ format: 'jsonv2', q, limit: '6', 'accept-language': 'es', viewbox, bounded: '0', countrycodes: 'pe' });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, { signal });
  if (!response.ok) throw new Error('No pudimos buscar ese lugar. Inténtalo de nuevo.');
  const rows = (await response.json()) as { display_name: string; lat: string; lon: string }[];
  return rows
    .map((r) => ({ label: r.display_name, point: { lat: Number(r.lat), lng: Number(r.lon) } }))
    .filter((r) => Number.isFinite(r.point.lat) && Number.isFinite(r.point.lng));
}

/**
 * Busca una dirección o lugar en OpenStreetMap (Nominatim, sin clave), preferiendo Cajamarca. Prueba varias
 * formas de escribirla («jr» → «Jirón», con y sin número) y junta los resultados distintos, así hay más de una
 * opción para elegir. Solo se llama al pausar o pulsar «Buscar» (su política no permite pedir letra por letra).
 */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  if (query.trim().length < 3) return [];
  const found: PlaceResult[] = [];
  const seen = new Set<string>();
  for (const [i, variant] of addressVariants(query).entries()) {
    if (i > 0) {
      if (found.length >= 3) break;
      // Una consulta por segundo como máximo.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      if (signal?.aborted) throw new DOMException('Cancelado', 'AbortError');
    }
    for (const r of await nominatim(variant, signal)) {
      const key = `${r.point.lat.toFixed(4)},${r.point.lng.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push(r);
    }
  }
  return found.slice(0, 6);
}
