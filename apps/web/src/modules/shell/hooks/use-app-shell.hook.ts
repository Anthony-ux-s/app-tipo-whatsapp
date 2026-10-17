import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { useRealtime } from './use-realtime.hook';

/** Arranque de la app autenticada: la sesión y su conexión de tiempo real. */
export function useAppShell() {
  const user = useSessionStore((s) => s.user);
  const connection = useChatStore((s) => s.connection);

  useRealtime(user?.id);

  return { user, connection };
}
