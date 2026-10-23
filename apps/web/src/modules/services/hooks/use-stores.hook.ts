import type { ServiceId, StoreSummary } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { errorMessage, http } from '@shared/utils/http';

/** Las tiendas aprobadas de una categoría (primero las que están abiertas). */
export function useStoreList(category: ServiceId) {
  const query = useQuery({ queryKey: ['stores', 'list', category], queryFn: () => http.get<StoreSummary[]>(`/stores?service=${category}`) });
  const stores = useMemo(() => (query.data ? [...query.data].sort((a, b) => Number(b.open) - Number(a.open)) : null), [query.data]);
  return { stores, error: stores ? null : query.error ? errorMessage(query.error) : null, retry: () => void query.refetch() };
}

/** Una tienda por su id (nombre, dirección, horario) para los textos de su pantalla y del carrito. */
export function useStore(storeId: string) {
  const query = useQuery({
    queryKey: ['stores', 'one', storeId],
    queryFn: () => http.get<StoreSummary>(`/stores/${encodeURIComponent(storeId)}`),
    enabled: Boolean(storeId),
  });
  return { store: query.data ?? null, error: query.data ? null : query.error ? errorMessage(query.error) : null, retry: () => void query.refetch() };
}
