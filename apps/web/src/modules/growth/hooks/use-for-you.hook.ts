import type { MyInterests, Product } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { http } from '@shared/utils/http';
import { rankForYou, type ForYou } from '../utils/roulette.utils';

const EMPTY: ForYou = { products: [], categories: [] };

/**
 * Ofertas «para ti»: con lo que la persona compró y buscó, sube primero las ofertas de las categorías
 * que más le interesan. Sin historial (o sin conexión) no muestra nada.
 */
export function useForYou(catalog: Product[] | null, limit = 8): ForYou {
  const [interests, setInterests] = useState<MyInterests | null>(null);

  useEffect(() => {
    let alive = true;
    http
      .get<MyInterests>('/interests')
      .then((found) => alive && setInterests(found))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => (catalog && interests ? rankForYou(catalog, interests, limit) : EMPTY), [catalog, interests, limit]);
}
