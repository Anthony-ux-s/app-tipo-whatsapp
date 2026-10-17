import type { GeoPoint } from '@parla/types';
import { useEffect } from 'react';
import { activeDelivery, useDriverStore } from '@shared/stores/driver.store';
import { http } from '@shared/utils/http';

/** Cada cuánto se manda la última ubicación (el core igual descarta las muy seguidas). */
const SEND_EVERY_MS = 5_000;

/**
 * Mientras el repartidor tiene una entrega en curso, su celular comparte la ubicación (como en Rappi):
 * la ven solo el cliente y la tienda de ese pedido. Sin entrega, no se pide ni se manda nada.
 * Se manda la primera enseguida y después, cada 5 s, la última que dio el GPS si cambió (así no se
 * pierde un movimiento que llegó justo después de un envío).
 */
export function useLocationSharing() {
  const driver = useDriverStore((s) => s.driver);
  const orderId = useDriverStore((s) => activeDelivery(s.orders)?.id ?? null);
  const setSharing = useDriverStore((s) => s.setSharing);

  useEffect(() => {
    if (!driver || !orderId) {
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
    const timer = window.setInterval(send, SEND_EVERY_MS);
    return () => {
      navigator.geolocation.clearWatch(watch);
      window.clearInterval(timer);
    };
  }, [driver, orderId, setSharing]);
}
