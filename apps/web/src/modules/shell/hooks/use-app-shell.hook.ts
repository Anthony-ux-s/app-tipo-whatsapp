import { useSyncExternalStore } from 'react';
import { useSessionStore } from '@shared/stores/session.store';
import { getConnectionState, subscribeConnection } from '@shared/utils/socket';
import { useRealtime } from './use-realtime.hook';

/** Arranque de la app autenticada: la sesión y su conexión de tiempo real. */
export function useAppShell() {
  const user = useSessionStore((s) => s.user);
  const connection = useSyncExternalStore(subscribeConnection, getConnectionState);

  useRealtime(user?.id);

  return { user, connection };
}
