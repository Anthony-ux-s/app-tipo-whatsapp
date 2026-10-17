import type { GeoPoint } from '@parla/types';
import { distanceKm } from './geo';

/**
 * Ofertas por cercanía (como Rappi o PedidosYa): un pedido listo se ofrece primero a los repartidores
 * a menos de radiiKm[0] km de la tienda; cada `waveMinutes` sin que nadie lo tome se amplía al
 * siguiente radio, y después del último, a todos los conectados.
 */
export interface DispatchConfig {
  radiiKm: number[];
  waveMinutes: number;
  /** Una ubicación más vieja que esto no cuenta para la cercanía (el repartidor entra en la última oleada). */
  locationMaxAgeMinutes: number;
}

export const DEFAULT_DISPATCH: DispatchConfig = { radiiKm: [3, 6, 12], waveMinutes: 2, locationMaxAgeMinutes: 15 };

/**
 *   DISPATCH_RADII_KM       3,6,12   radios de cada oleada (km, de menor a mayor; vacío = a todos)
 *   DISPATCH_WAVE_MINUTES   2        minutos antes de ampliar el radio
 */
export function parseDispatch(env: Record<string, string | undefined>): DispatchConfig {
  const radiiRaw = env.DISPATCH_RADII_KM;
  const radiiKm =
    radiiRaw === undefined
      ? DEFAULT_DISPATCH.radiiKm
      : radiiRaw
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
          .map(Number);
  if (radiiKm.some((r) => !Number.isFinite(r) || r <= 0) || radiiKm.some((r, i) => i > 0 && r <= radiiKm[i - 1])) {
    throw new Error('DISPATCH_RADII_KM debe ser una lista de km de menor a mayor, p. ej. 3,6,12');
  }
  const waveMinutes = Number(env.DISPATCH_WAVE_MINUTES ?? DEFAULT_DISPATCH.waveMinutes);
  if (!Number.isFinite(waveMinutes) || waveMinutes <= 0) throw new Error('DISPATCH_WAVE_MINUTES debe ser mayor que 0');
  return { radiiKm, waveMinutes, locationMaxAgeMinutes: DEFAULT_DISPATCH.locationMaxAgeMinutes };
}

/** Radio de la primera oleada (null = a todos: sin radios configurados). */
export function firstRadius(config: DispatchConfig): number | null {
  return config.radiiKm[0] ?? null;
}

/** El radio siguiente al actual (null = ya se ofrece a todos). */
export function nextRadius(config: DispatchConfig, current: number | null): number | null {
  if (current === null) return null;
  return config.radiiKm.find((r) => r > current) ?? null;
}

/**
 * ¿Puede este repartidor ver y tomar la oferta? Sí, si ya se ofrece a todos, si la tienda no tiene
 * ubicación, o si su última ubicación (reciente) está dentro del radio.
 */
export function canSeeOffer(
  config: DispatchConfig,
  radiusKm: number | null,
  store: GeoPoint | null,
  driver: (GeoPoint & { at: Date }) | null,
  now: Date,
): boolean {
  if (radiusKm === null || !store) return true;
  if (!driver || now.getTime() - driver.at.getTime() > config.locationMaxAgeMinutes * 60_000) return false;
  return distanceKm(driver, store) <= radiusKm;
}
