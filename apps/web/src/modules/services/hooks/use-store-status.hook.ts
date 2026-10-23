import type { BusinessStatus } from '@parla/types';
import { useQuery } from '@tanstack/react-query';
import { http } from '@shared/utils/http';

/**
 * Si la tienda recibe pedidos ahora (horario y pausa del dueño). Solo informa: el
 * gateway igual rechaza cotizar o cobrar con la tienda cerrada.
 */
export function useStoreStatus(storeId: string) {
  const { data } = useQuery({
    queryKey: ['business-status', storeId],
    queryFn: () => http.get<{ status: BusinessStatus | null }>(`/business/status/${encodeURIComponent(storeId)}`),
    enabled: Boolean(storeId),
    refetchInterval: 60_000,
    retry: false,
  });
  const status = data?.status ?? null;
  return { status, closed: status ? !status.open : false };
}
