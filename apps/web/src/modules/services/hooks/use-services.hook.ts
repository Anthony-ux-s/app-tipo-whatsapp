import type { StoreCategoryInfo } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { sortOrders, useOrdersStore } from '@shared/stores/orders.store';
import { errorMessage, http } from '@shared/utils/http';

/** Pantalla de Servicios: cuántas tiendas hay en cada categoría y el último pedido. */
export function useServices() {
  const categories = useQuery({ queryKey: ['stores', 'categories'], queryFn: () => http.get<StoreCategoryInfo[]>('/stores/categories') });
  const orders = useOrdersStore((s) => s.orders);
  const loadOrders = useOrdersStore((s) => s.loadOrders);

  useEffect(() => {
    void loadOrders().catch(() => undefined);
  }, [loadOrders]);

  return {
    categories: categories.data ?? null,
    error: categories.data ? null : categories.error ? errorMessage(categories.error) : null,
    latestOrder: sortOrders(orders)[0] ?? null,
    retry: () => void categories.refetch(),
  };
}
