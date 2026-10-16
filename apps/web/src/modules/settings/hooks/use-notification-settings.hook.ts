import { useEffect, useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { disablePush, enablePush, pushState, type PushState } from '@shared/utils/push';

const DESCRIPTIONS: Record<PushState | 'checking', string> = {
  checking: 'Comprobando…',
  unsupported: 'Este navegador no permite notificaciones push. Instala Parla como app o usa Chrome, Edge o Firefox.',
  denied: 'Bloqueaste las notificaciones. Actívalas desde la configuración del sitio en tu navegador.',
  enabled: 'Recibirás avisos aunque Parla esté cerrada. Por privacidad, no muestran el contenido de los mensajes.',
  disabled: 'Activa los avisos para enterarte de mensajes, menciones y tareas aunque Parla esté cerrada.',
};

/** Activar o desactivar las notificaciones push de este dispositivo. */
export function useNotificationSettings() {
  const [state, setState] = useState<PushState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void pushState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  return {
    state,
    enabled: state === 'enabled',
    available: state === 'enabled' || state === 'disabled',
    busy,
    description: DESCRIPTIONS[state],
    toggle: async (next: boolean) => {
      setBusy(true);
      try {
        const result = next ? await enablePush() : await disablePush();
        setState(result);
        if (next && result === 'enabled') toast('Notificaciones activadas en este dispositivo', 'success');
        if (next && result === 'denied') toast('El navegador bloqueó las notificaciones', 'error');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
  };
}
