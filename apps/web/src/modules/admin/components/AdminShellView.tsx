import { Navigate, Outlet, useLocation } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { DEFAULT_ADMIN_TAB } from '../const/admin-nav.const';
import { AdminSidebar } from './AdminSidebar';

/**
 * Armazón de las cuentas de soporte en pantalla grande: menú lateral fijo y el contenido a todo el ancho.
 * No hay chats ni servicios: ahí el administrador solo controla el sistema. En pantallas chicas no se usa
 * (ver `AppRoot`): se conserva la app de siempre con su barra de abajo.
 */
export function AdminShellView() {
  const user = useSessionStore((s) => s.user);
  const { pathname } = useLocation();
  if (!user) return null;
  // Soporte solo tiene su panel y sus ajustes: lo demás (chats, mercado, pedidos…) es para los usuarios.
  if (!pathname.startsWith('/app/admin') && !pathname.startsWith('/app/ajustes')) {
    return <Navigate to={`/app/admin/${DEFAULT_ADMIN_TAB}`} replace />;
  }

  return (
    <div className="flex h-[var(--vvh,100dvh)] overflow-hidden bg-canvas" data-testid="admin-shell">
      <div className="relative z-10 shrink-0">
        <AdminSidebar />
      </div>
      <main className="flex min-h-0 min-w-0 flex-1 animate-fade-in flex-col">
        <Outlet />
      </main>
    </div>
  );
}
