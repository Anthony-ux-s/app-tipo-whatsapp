import type { PublicUser } from '@parla/types';
import { useEffect, useState } from 'react';
import { usePeopleStore } from '@shared/stores/people.store';
import { errorMessage } from '@shared/utils/http';

const DEBOUNCE_MS = 250;

/** Busca en el directorio de Parla mientras se escribe (con una pequeña espera entre teclas). */
export function usePeopleSearch(query: string, enabled: boolean) {
  const search = usePeopleStore((s) => s.search);
  const [people, setPeople] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      search(query)
        .then((found) => {
          if (!alive) return;
          setPeople(found);
          setError(null);
        })
        .catch((err) => alive && setError(errorMessage(err)))
        .finally(() => alive && setLoading(false));
    }, query ? DEBOUNCE_MS : 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [query, enabled, search]);

  return { people, loading, error };
}
