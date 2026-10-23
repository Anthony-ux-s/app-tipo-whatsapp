import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './http';

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
