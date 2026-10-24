import { lazy, Suspense } from 'react';
import { AppShellView } from '../modules/shell/components/AppShellView';
import { useSessionStore } from '@shared/stores/session.store';
import { useMediaQuery } from '@shared/utils/use-media-query';

// El armazón del administrador solo lo descarga quien es administrador en pantalla grande.
const AdminShellView = lazy(() => import('../modules/admin/components/AdminShellView').then((m) => ({ default: m.AdminShellView })));

/**
 * Raíz de la app autenticada. En pantalla grande las cuentas de soporte tienen su propio panel de
 * administración con menú lateral; en el celular y la tableta (y para todos los demás) es la app de siempre,
 * con la lista de chats y la barra de abajo (Chats, Servicios, Ofertas, Delivery).
 */
export function AppRoot() {
  const isAdmin = useSessionStore((s) => !!s.user?.isAdmin);
  const large = useMediaQuery('(min-width: 1024px)');
  if (!isAdmin || !large) return <AppShellView />;
  return (
    <Suspense fallback={null}>
      <AdminShellView />
    </Suspense>
  );
}
