import type { GeoPoint, Order } from '@parla/types';
import { Clock, SignalLow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { LazyDeliveryMap } from '@shared/ui/LazyDeliveryMap';
import { formatTime } from '@shared/utils/date';
import { distanceKm, etaMinutes, formatDistance, isStale } from '@shared/utils/geo';
import { useRoute } from '../hooks/use-route.hook';

/**
 * Seguimiento en vivo del repartidor (como en Rappi o PedidosYa): el mapa con la tienda, el destino
 * y el repartidor, la distancia que falta y la hora estimada según dónde está ahora.
 */
export function LiveTracking({ order, audience }: { order: Pick<Order, 'status' | 'business' | 'address' | 'driverLocation' | 'delivery'>; audience: 'customer' | 'business' }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const tracking = order.status === 'driver_assigned' || order.status === 'on_the_way';
  const driver = order.driverLocation ?? null;
  const store = order.business?.location ?? null;
  const destination = order.address.location ?? null;
  const pickingUp = order.status === 'driver_assigned';

  // Tramos que faltan: hasta la tienda (si aún no recoge) y hasta el cliente.
  const legs: [GeoPoint, GeoPoint][] = [];
  if (driver && pickingUp && store) legs.push([driver, store]);
  if (destination && (pickingUp ? store : driver)) legs.push([(pickingUp ? store : driver)!, destination]);
  // Ruta por las calles (OSRM) por las paradas que faltan.
  const route = useRoute(legs.length ? [legs[0][0], ...legs.map(([, b]) => b)] : [], tracking);

  if (!tracking) return null;
  const remainingKm = route?.distanceKm ?? legs.reduce((sum, [a, b]) => sum + distanceKm(a, b), 0);
  const minutes = route?.minutes ?? (legs.length ? etaMinutes(...legs) : null);
  const eta = driver && minutes !== null ? new Date(now + minutes * 60_000).toISOString() : null;
  const toStoreKm = driver && pickingUp && store ? distanceKm(driver, store) : null;

  return (
    <section className="flex flex-col gap-2 rounded-2xl bg-surface p-3 shadow-float md:p-4" aria-label="Seguimiento en vivo" data-testid="live-tracking">
      <LazyDeliveryMap store={store} destination={destination} driver={driver} vehicle={order.delivery?.vehicle} route={route?.path} label="Mapa del delivery en vivo" />
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
        {!driver ? (
          <span className="text-ink-soft">Esperando la ubicación del repartidor…</span>
        ) : isStale(driver.at, now) ? (
          <span className="flex items-center gap-1.5 font-semibold text-amber-700 dark:text-amber-300" data-testid="driver-stale">
            <SignalLow className="size-4" /> Sin señal del repartidor desde las {formatTime(driver.at)}
          </span>
        ) : (
          <span className="text-ink-soft" data-testid="driver-distance">
            {audience === 'business' && toStoreKm !== null
              ? `El repartidor está a ${formatDistance(toStoreKm)} de tu tienda`
              : legs.length
                ? `Faltan ${formatDistance(remainingKm)}`
                : 'Ubicación en vivo del repartidor'}
          </span>
        )}
        {eta && audience === 'customer' && (
          <span className="flex items-center gap-1 font-semibold text-brand dark:text-teal-300" data-testid="eta">
            <Clock className="size-4" /> Llega aprox. a las {formatTime(eta)}
          </span>
        )}
      </div>
    </section>
  );
}
