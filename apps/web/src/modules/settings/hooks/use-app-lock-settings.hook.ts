import { useState } from 'react';
import { useLockStore } from '@shared/stores/lock.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { checkCode, disableLock, enableLock, getLock, setAutoLock, type AutoLockMs, type LockKind } from '@shared/utils/app-lock';

/** Los pasos de activar, cambiar o quitar el bloqueo. */
export type LockFlow =
  | { step: 'kind' }
  | { step: 'enter'; kind: LockKind; length: number }
  | { step: 'confirm'; kind: LockKind; length: number; first: string }
  | { step: 'verify'; then: 'change' | 'disable' };

const DEFAULT_AUTO_LOCK: AutoLockMs = 60_000;

/** Ajustes → Seguridad: bloqueo de la app con PIN o patrón, en este dispositivo. */
export function useAppLockSettings() {
  const userId = useSessionStore((s) => s.user)!.id;
  const release = useLockStore((s) => s.release);
  const [version, setVersion] = useState(0);
  const [flow, setFlow] = useState<LockFlow | null>(null);
  const [errorKey, setErrorKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // `version` fuerza a leer de nuevo la configuración guardada.
  const config = (void version, getLock(userId));

  const refresh = () => setVersion((v) => v + 1);
  const fail = (text: string) => {
    setMessage(text);
    setErrorKey((n) => n + 1);
  };
  const close = () => {
    setFlow(null);
    setMessage(null);
  };

  return {
    config,
    flow,
    errorKey,
    message,
    busy,
    close,
    /** El interruptor: activar pide elegir el tipo; desactivar pide el código actual. */
    toggle: (on: boolean) => {
      setMessage(null);
      setFlow(on ? { step: 'kind' } : { step: 'verify', then: 'disable' });
    },
    change: () => {
      setMessage(null);
      setFlow({ step: 'verify', then: 'change' });
    },
    chooseKind: (kind: LockKind, length: number) => setFlow({ step: 'enter', kind, length }),
    setAutoLock: (value: AutoLockMs) => {
      setAutoLock(userId, value);
      refresh();
    },
    /** Un código puesto en el paso actual. */
    submit: async (code: string) => {
      if (!flow) return;
      if (flow.step === 'enter') {
        setMessage(null);
        setFlow({ step: 'confirm', kind: flow.kind, length: flow.length, first: code });
      } else if (flow.step === 'confirm') {
        if (code !== flow.first) {
          fail('No coincide. Empieza de nuevo.');
          setFlow({ step: 'enter', kind: flow.kind, length: flow.length });
          return;
        }
        setBusy(true);
        try {
          await enableLock(userId, flow.kind, code, flow.length, config?.autoLockMs ?? DEFAULT_AUTO_LOCK);
          toast(flow.kind === 'pin' ? 'Bloqueo con PIN activado.' : 'Bloqueo con patrón activado.', 'success');
          close();
          refresh();
        } finally {
          setBusy(false);
        }
      } else if (flow.step === 'verify') {
        setBusy(true);
        try {
          const result = await checkCode(userId, code);
          if (!result.ok) {
            fail(result.waitMs > 0 ? `Demasiados intentos. Espera ${Math.ceil(result.waitMs / 1000)} s.` : 'Código incorrecto.');
            return;
          }
          if (flow.then === 'disable') {
            disableLock(userId);
            release();
            toast('Bloqueo desactivado.', 'success');
            close();
            refresh();
          } else {
            setMessage(null);
            setFlow({ step: 'kind' });
          }
        } finally {
          setBusy(false);
        }
      }
    },
  };
}
