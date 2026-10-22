import type { ServiceId, StoreSummary } from '@parla/types';
import { useEffect, useState } from 'react';
import { errorMessage, http } from '@shared/utils/http';

/** Las tiendas aprobadas de una categoría (primero las que están abiertas). */
export function useStoreList(category: ServiceId) {
  const [stores, setStores] = useState<StoreSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    setStores(null);
    setError(null);
    http
      .get<StoreSummary[]>(`/stores?service=${category}`)
      .then((list) => alive && setStores([...list].sort((a, b) => Number(b.open) - Number(a.open))))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [category, attempt]);

  return { stores, error, retry: () => setAttempt((n) => n + 1) };
}

/** Una tienda por su id (nombre, dirección, horario) para los textos de su pantalla y del carrito. */
export function useStore(storeId: string) {
  const [store, setStore] = useState<StoreSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!storeId) return;
    setStore(null);
    setError(null);
    http
      .get<StoreSummary>(`/stores/${encodeURIComponent(storeId)}`)
      .then((found) => alive && setStore(found))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [storeId, attempt]);

  return { store, error, retry: () => setAttempt((n) => n + 1) };
}
