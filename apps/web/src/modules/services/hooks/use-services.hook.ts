import type { ServiceInfo } from '@parla/types';
import { useEffect, useState } from 'react';
import { sortOrders, useOrdersStore } from '@shared/stores/orders.store';
import { errorMessage, http } from '@shared/utils/http';

/** Pantalla de Servicios: el catálogo (lo da el gateway) y el último pedido. */
export function useServices() {
  const [services, setServices] = useState<ServiceInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const orders = useOrdersStore((s) => s.orders);
  const loadOrders = useOrdersStore((s) => s.loadOrders);

  useEffect(() => {
    let alive = true;
    setError(null);
    http
      .get<ServiceInfo[]>('/services')
      .then((list) => alive && setServices(list))
      .catch((err) => alive && setError(errorMessage(err)));
    void loadOrders().catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [attempt, loadOrders]);

  return {
    services,
    error,
    latestOrder: sortOrders(orders)[0] ?? null,
    retry: () => setAttempt((n) => n + 1),
  };
}
