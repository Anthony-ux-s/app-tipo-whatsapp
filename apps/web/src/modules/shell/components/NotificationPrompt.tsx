import { Bell, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { enablePush, isPushSupported } from '@shared/utils/push';

const DISMISSED_KEY = 'parla.push.dismissedAt';
const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;

const recentlyDismissed = (): boolean => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISSED_KEY) ?? 0) < ASK_AGAIN_MS;
  } catch {
    return false;
  }
};

/**
 * Notificaciones como en WhatsApp: si la persona ya dio el permiso, el dispositivo se vuelve a registrar solo
 * (el aviso llega aunque la app esté cerrada); si todavía no, se le ofrece activarlas.
 */
export function NotificationPrompt() {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isPushSupported()) return;
    if (Notification.permission === 'granted') {
      // Idempotente: reutiliza la suscripción del navegador y la deja registrada en el servidor.
      void enablePush().catch(() => undefined);
    } else if (Notification.permission === 'default' && !recentlyDismissed()) {
      setAsk(true);
    }
  }, []);

  if (!ask) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Sin almacenamiento: se vuelve a ofrecer la próxima vez.
    }
    setAsk(false);
  };

  const activate = async () => {
    setBusy(true);
    try {
      const state = await enablePush();
      if (state === 'enabled') toast('Notificaciones activadas', 'success');
      else if (state === 'denied') toast('Bloqueaste las notificaciones: actívalas en los ajustes del navegador.', 'info');
      setAsk(false);
    } catch {
      toast('No pudimos activar las notificaciones. Inténtalo de nuevo.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 bg-teal-50 px-4 py-2.5 text-sm text-ink dark:bg-teal-950/60" role="region" aria-label="Notificaciones" data-testid="push-prompt">
      <Bell className="size-5 shrink-0 text-brand dark:text-teal-300" />
      <p className="min-w-0 flex-1">Activa las notificaciones para enterarte de tus mensajes y pedidos aunque la app esté cerrada.</p>
      <button type="button" onClick={() => void activate()} disabled={busy} className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-sm font-bold text-white disabled:opacity-60">
        Activar
      </button>
      <button type="button" onClick={dismiss} aria-label="Ahora no" className="shrink-0 rounded-lg p-1 text-ink-soft hover:bg-surface-2">
        <X className="size-4" />
      </button>
    </div>
  );
}
