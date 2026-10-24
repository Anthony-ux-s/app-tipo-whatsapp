import { LockKeyhole } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLockStore } from '@shared/stores/lock.store';
import { useSessionStore } from '@shared/stores/session.store';
import { Avatar } from '@shared/ui/Avatar';
import { Button } from '@shared/ui/Button';
import { CodeEntry } from '@shared/ui/CodeEntry';
import { Modal } from '@shared/ui/Modal';
import { disableLock, getLock, waitRemainingMs } from '@shared/utils/app-lock';

/**
 * El bloqueo de la app: pide el código al abrirla y, según lo elegido en Ajustes → Seguridad, al volver a ella
 * después de un rato. Si no hay bloqueo activado, no dibuja nada.
 */
export function LockGate() {
  const user = useSessionStore((s) => s.user);
  const status = useSessionStore((s) => s.status);
  const locked = useLockStore((s) => s.locked);
  const lockNow = useLockStore((s) => s.lockNow);
  const release = useLockStore((s) => s.release);
  const hiddenAt = useRef<number | null>(null);
  const checkedOnOpen = useRef(false);
  const userId = user?.id ?? null;

  // Al abrir la app (o recargarla) con el bloqueo activado, se pide el código antes de mostrar nada.
  useEffect(() => {
    if (status !== 'ready' || !userId) {
      if (status === 'anonymous') {
        checkedOnOpen.current = false;
        release();
      }
      return;
    }
    if (checkedOnOpen.current) return;
    checkedOnOpen.current = true;
    lockNow(userId);
  }, [status, userId, lockNow, release]);

  // Al salir de la app y volver: si pasó el tiempo elegido, se bloquea.
  useEffect(() => {
    if (!userId) return;
    const onVisibility = () => {
      const config = getLock(userId);
      if (!config) return;
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now();
        return;
      }
      const away = hiddenAt.current === null ? 0 : Date.now() - hiddenAt.current;
      hiddenAt.current = null;
      if (config.autoLockMs >= 0 && away >= config.autoLockMs && away > 0) lockNow(userId);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [userId, lockNow]);

  // Al abrir la app ya con sesión, el candado se dibuja en el mismo cuadro que la app (sin que se alcance a ver el contenido).
  const lockOnOpen = status === 'ready' && !!userId && !checkedOnOpen.current && !!getLock(userId);
  if ((!locked && !lockOnOpen) || !user) return null;
  return <LockScreen userId={user.id} name={user.displayName} color={user.avatarColor} photo={user.avatarUrl} />;
}

function LockScreen({ userId, name, color, photo }: { userId: string; name: string; color: string; photo: string | null }) {
  const config = getLock(userId);
  const unlock = useLockStore((s) => s.unlock);
  const release = useLockStore((s) => s.release);
  const logout = useSessionStore((s) => s.logout);
  const [errors, setErrors] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [waitMs, setWaitMs] = useState(() => waitRemainingMs(userId));
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  // Cuenta regresiva cuando hay que esperar tras demasiados errores.
  useEffect(() => {
    if (waitMs <= 0) return;
    const timer = setInterval(() => {
      const left = waitRemainingMs(userId);
      setWaitMs(left);
      if (left <= 0) setMessage(null);
    }, 500);
    return () => clearInterval(timer);
  }, [waitMs > 0, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si por algún motivo ya no hay bloqueo configurado, no se queda la pantalla puesta.
  useEffect(() => {
    if (!config) release();
  }, [config, release]);

  const submit = useCallback(
    async (code: string) => {
      setBusy(true);
      try {
        const result = await unlock(userId, code);
        if (!result.ok) {
          setErrors((n) => n + 1);
          if (result.waitMs > 0) {
            setWaitMs(result.waitMs);
            setMessage('Demasiados intentos.');
          } else {
            setMessage(config?.kind === 'pin' ? 'PIN incorrecto.' : 'Patrón incorrecto.');
          }
        }
      } finally {
        setBusy(false);
      }
    },
    [unlock, userId, config?.kind],
  );

  if (!config) return null;
  const waiting = waitMs > 0;
  const seconds = Math.ceil(waitMs / 1000);
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-y-auto bg-canvas p-6" role="dialog" aria-modal="true" aria-label="Parla está bloqueada" data-testid="lock-screen">
      <div className="flex flex-col items-center gap-2 text-center">
        <Avatar name={name} color={color} photo={photo} size="lg" />
        <p className="text-lg font-bold text-ink">{name}</p>
        <p className="flex items-center gap-1.5 text-sm text-ink-soft">
          <LockKeyhole className="size-4" /> {config.kind === 'pin' ? 'Pon tu PIN para entrar' : 'Dibuja tu patrón para entrar'}
        </p>
      </div>
      <CodeEntry kind={config.kind} length={config.length} onSubmit={(code) => void submit(code)} disabled={busy || waiting} errorKey={errors} />
      <div className="min-h-10 text-center" aria-live="polite">
        {message && <p className="text-sm font-semibold text-rose-600 dark:text-rose-400" data-testid="lock-error">{message}</p>}
        {waiting && <p className="text-sm text-ink-soft">Vuelve a intentar en {seconds} s.</p>}
      </div>
      <button type="button" onClick={() => setForgot(true)} className="text-sm font-semibold text-brand hover:underline dark:text-teal-300" data-testid="lock-forgot">
        {config.kind === 'pin' ? '¿Olvidaste tu PIN?' : '¿Olvidaste tu patrón?'}
      </button>
      <Modal
        open={forgot}
        onClose={() => setForgot(false)}
        size="sm"
        title="¿Olvidaste tu código?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setForgot(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                // Entrar de nuevo con la contraseña quita este candado; se pierde la clave guardada en este dispositivo.
                disableLock(userId);
                setForgot(false);
                logout();
              }}
            >
              Cerrar sesión
            </Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Para entrar de nuevo tendrás que cerrar sesión y volver a iniciarla con tu contraseña. El bloqueo se quita y puedes activarlo otra vez en Ajustes.</p>
      </Modal>
    </div>
  );
}
