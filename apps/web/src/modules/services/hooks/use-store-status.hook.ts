import type { BusinessStatus } from '@parla/types';
import { useEffect, useState } from 'react';
import { http } from '@shared/utils/http';

/**
 * Si la tienda recibe pedidos ahora (horario y pausa del dueño). Solo informa: el
 * gateway igual rechaza cotizar o cobrar con la tienda cerrada.
 */
export function useStoreStatus(storeId: string) {
  const [status, setStatus] = useState<BusinessStatus | null>(null);

  useEffect(() => {
    let alive = true;
    if (!storeId) return;
    const load = () =>
      http
        .get<{ status: BusinessStatus | null }>(`/business/status/${encodeURIComponent(storeId)}`)
        .then((r) => alive && setStatus(r.status))
        .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [storeId]);

  return { status, closed: status ? !status.open : false };
}
