import { lazy, Suspense } from 'react';
import type { DeliveryMapProps } from './DeliveryMap';
import type { RouteMapProps } from './RouteMap';

const DeliveryMap = lazy(() => import('./DeliveryMap').then((m) => ({ default: m.DeliveryMap })));

/** El mapa (Leaflet) se descarga solo cuando hace falta, no con el resto de la app. */
export function LazyDeliveryMap(props: DeliveryMapProps) {
  return (
    <Suspense fallback={<div className="h-56 w-full animate-pulse rounded-2xl bg-surface-3 md:h-64" />}>
      <DeliveryMap {...props} />
    </Suspense>
  );
}

const RouteMap = lazy(() => import('./RouteMap').then((m) => ({ default: m.RouteMap })));

/** Mapa de un recorrido con varias paradas (repartidor y simulador de tarifas), también diferido. */
export function LazyRouteMap(props: RouteMapProps) {
  return (
    <Suspense fallback={<div className="h-64 w-full animate-pulse rounded-2xl bg-surface-3 md:h-80" />}>
      <RouteMap {...props} />
    </Suspense>
  );
}
