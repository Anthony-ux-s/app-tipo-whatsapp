import type { StoreCategoryInfo } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { sortOrders, useOrdersStore } from '@shared/stores/orders.store';
import { errorMessage, http } from '@shared/utils/http';

export const CATEGORIES_KEY = ['stores', 'categories'] as const;
/** Cuántas tiendas hay por categoría casi no cambia: se reutiliza unos minutos en vez de pedirla en cada visita. */
export const CATEGORIES_STALE_MS = 3 * 60_000;
export const fetchCategories = () => http.get<StoreCategoryInfo[]>('/stores/categories');

/** Pantalla de Servicios: cuántas tiendas hay en cada categoría y el último pedido. */
export function useServices() {
  const categories = useQuery({ queryKey: CATEGORIES_KEY, queryFn: fetchCategories, staleTime: CATEGORIES_STALE_MS });
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
