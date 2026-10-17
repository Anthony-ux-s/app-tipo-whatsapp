import { lazy, Suspense } from 'react';
import type { DeliveryMapProps } from './DeliveryMap';

const DeliveryMap = lazy(() => import('./DeliveryMap').then((m) => ({ default: m.DeliveryMap })));

/** El mapa (Leaflet) se descarga solo cuando hace falta, no con el resto de la app. */
export function LazyDeliveryMap(props: DeliveryMapProps) {
  return (
    <Suspense fallback={<div className="h-56 w-full animate-pulse rounded-2xl bg-surface-3 md:h-64" />}>
      <DeliveryMap {...props} />
    </Suspense>
  );
}
