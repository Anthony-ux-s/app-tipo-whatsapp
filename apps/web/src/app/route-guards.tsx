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

/** Solo sin sesión (entrar y registro). */
export function GuestOnly() {
  const status = useSessionStore((s) => s.status);
  const location = useLocation();
  if (status === 'booting') return <FullScreenLoader />;
  if (status === 'ready') {
    const from = (location.state as { from?: string } | null)?.from ?? '/app';
    return <Navigate to={from} replace />;
  }
  return <Outlet />;
}
