import { useEffect, useState } from 'react';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { disablePush, enablePush, pushState, type PushState } from '@shared/utils/push';

const DESCRIPTIONS: Record<PushState | 'checking', string> = {
  checking: 'Comprobando…',
  unsupported: 'Este navegador no permite notificaciones push. Instala Parla como app o usa Chrome, Edge o Firefox.',
  denied: 'Bloqueaste las notificaciones. Actívalas desde la configuración del sitio en tu navegador.',
  enabled: 'Recibirás avisos aunque Parla esté cerrada. Por privacidad, no muestran el contenido de los mensajes.',
  disabled: 'Activa los avisos para enterarte de mensajes y menciones aunque Parla esté cerrada.',
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
    test: async () => {
      setBusy(true);
      try {
        const r = await http.post<{ devices: number; sent: number; expired: number; failed: number }>('/push/test');
        if (r.devices === 0) toast('Este dispositivo no está registrado. Activa las notificaciones primero.', 'error');
        else if (r.sent > 0) toast('Aviso de prueba enviado: debería sonar en unos segundos. Cierra la app para verlo como llega.', 'success');
        else toast(r.expired > 0 ? 'La suscripción había caducado. Desactiva y vuelve a activar las notificaciones.' : 'El servicio de avisos del navegador rechazó el envío. Inténtalo de nuevo.', 'error');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
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
