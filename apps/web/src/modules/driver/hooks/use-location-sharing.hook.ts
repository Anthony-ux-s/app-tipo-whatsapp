import type { GeoPoint } from '@parla/types';
import { useEffect } from 'react';
import { activeDelivery, useDriverStore } from '@shared/stores/driver.store';
import { http } from '@shared/utils/http';

/** Cada cuánto se manda la última ubicación (el core igual descarta las muy seguidas). */
const SEND_EVERY_MS = 5_000;
/** Conectado sin entrega basta con menos: sirve para ofrecerle los pedidos cercanos. */
const IDLE_EVERY_MS = 30_000;

/**
 * Mientras el repartidor está conectado, su celular manda la ubicación (como en Rappi): sin entrega,
 * cada 30 s y solo para ofrecerle los pedidos cercanos; con una entrega en curso, cada 5 s y la ven
 * el cliente y la tienda de ese pedido. Desconectado y sin entrega, no se pide ni se manda nada.
 * Se manda la primera enseguida y después la última que dio el GPS si cambió (así no se pierde un
 * movimiento que llegó justo después de un envío).
 */
export function useLocationSharing() {
  const driver = useDriverStore((s) => s.driver);
  const orderId = useDriverStore((s) => activeDelivery(s.orders)?.id ?? null);
  const setSharing = useDriverStore((s) => s.setSharing);
  const hasDriver = !!driver;
  const online = hasDriver && !!driver?.online && driver.status === 'approved';

  useEffect(() => {
    if (!hasDriver || (!orderId && !online)) {
      setSharing('off');
      return;
    }
    if (!('geolocation' in navigator)) {
      setSharing('unavailable');
      return;
    }
    let pending: GeoPoint | null = null;
    let sentOnce = false;
    const send = () => {
      if (!pending) return;
      const point = pending;
      pending = null;
      void http.post('/driver/location', point).catch(() => undefined);
    };
    const watch = navigator.geolocation.watchPosition(
      (pos) => {
        pending = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setSharing('sharing', pending);
        if (!sentOnce) {
          sentOnce = true;
          send();
        }
      },
      (err) => setSharing(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
    const timer = window.setInterval(send, orderId ? SEND_EVERY_MS : IDLE_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
    };
  }, [hasDriver, online, orderId, setSharing]);
}
