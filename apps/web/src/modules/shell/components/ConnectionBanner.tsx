import { WifiOff } from 'lucide-react';
import type { ConnectionState } from '@shared/types/chat.types';
import { Spinner } from '@shared/ui/Spinner';

/** Aviso discreto cuando se pierde la conexión en tiempo real. */
export function ConnectionBanner({ connection }: { connection: ConnectionState }) {
  if (connection === 'online') return null;
  return (
    <div
      role="status"
      className="flex animate-fade-in items-center justify-center gap-2 bg-cyan-50 px-4 py-2 text-xs font-medium text-ink dark:bg-cyan-950/60 dark:text-ink"
    >
      {connection === 'connecting' ? <Spinner className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {connection === 'connecting' ? 'Conectando…' : 'Sin conexión. Tus mensajes se enviarán al reconectar.'}
    </div>
  );
}
