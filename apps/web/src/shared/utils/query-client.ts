import { QueryClient } from '@tanstack/react-query';
import { ApiError, http } from './http';

/**
 * Caché de lecturas del servidor: al volver a una pantalla se muestra al instante lo último que se vio
 * y se actualiza por detrás. Un error 4xx no se reintenta (no va a cambiar); una caída de red sí.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: false,
      retry: (count, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && count < 2,
    },
  },
});

/**
 * Lectura GET con la caché de Query para los stores de Zustand (que además reciben eventos en tiempo real):
 * las peticiones iguales que llegan a la vez se juntan en una sola. `staleTime` 0 = siempre pide lo último.
 */
export const fetchQ = <T>(queryKey: readonly unknown[], path: string, staleTime = 0) =>
  queryClient.fetchQuery({ queryKey, queryFn: () => http.get<T>(path), staleTime });
