import { useSyncExternalStore } from 'react';

/** Si la ventana cumple una media query de CSS (y se actualiza al girar el celular o cambiar el tamaño). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
