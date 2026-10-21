import type { GeoPoint } from '@parla/types';
import { useEffect, useState } from 'react';
import { fetchRoute, type Route } from '@shared/utils/routing';

/**
 * Ruta por las calles entre las paradas (OSRM). Se vuelve a pedir solo cuando alguna se mueve unos
 * 100 m; mientras tanto (o si el servicio no responde) queda null y el mapa usa la línea recta.
 */
export function useRoute(stops: (GeoPoint | null | undefined)[], enabled = true): Route | null {
  const points = stops.filter((p): p is GeoPoint => !!p);
  const key = enabled ? points.map((p) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`).join(';') : '';
  const [route, setRoute] = useState<Route | null>(null);

  useEffect(() => {
    if (!key || points.length < 2) {
      setRoute(null);
      return;
    }
    let alive = true;
    void fetchRoute(points).then((r) => alive && setRoute(r));
    return () => {
      alive = false;
    };
  }, [key]); // los puntos se comparan por la clave redondeada

  return route;
}
