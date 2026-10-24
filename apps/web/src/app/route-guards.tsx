import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { FullScreenLoader } from '@shared/ui/States';

/** Solo con sesión: si no hay, va a /entrar y vuelve aquí después. */
export function RequireAuth() {
  const status = useSessionStore((s) => s.status);
  const location = useLocation();
  if (status === 'booting') return <FullScreenLoader />;
  if (status === 'anonymous') return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

/** Pantallas de tienda y reparto: soporte no participa como usuario, así que lo devuelve a su inicio. */
export function UsersOnly() {
  const isSupport = useSessionStore((s) => !!s.user?.isAdmin);
  return isSupport ? <Navigate to="/app" replace /> : <Outlet />;
}

/** Solo sin sesión (entrar y registro). */
export function GuestOnly() {
  const status = useSessionStore((s) => s.status);
  const onboarding = useSessionStore((s) => s.onboarding);
  const location = useLocation();
  if (status === 'booting') return <FullScreenLoader />;
  if (status === 'ready') {
    const from = onboarding ? '/bienvenida' : ((location.state as { from?: string } | null)?.from ?? '/app');
    return <Navigate to={from} replace />;
  }
  return <Outlet />;
}
