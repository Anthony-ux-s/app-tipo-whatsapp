import type { BusinessStatus, ServiceId } from '@parla/types';
import { useEffect, useState } from 'react';
import { http } from '@shared/utils/http';

/**
 * Si la tienda del servicio recibe pedidos ahora (horario y pausa del dueño). Solo informa: el
 * gateway igual rechaza cotizar o cobrar con la tienda cerrada.
 */
export function useStoreStatus(service: ServiceId) {
  const [status, setStatus] = useState<BusinessStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      http
        .get<{ status: BusinessStatus | null }>(`/business/status/${service}`)
        .then((r) => alive && setStatus(r.status))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [service]);

  return { status, closed: status ? !status.open : false };
}
