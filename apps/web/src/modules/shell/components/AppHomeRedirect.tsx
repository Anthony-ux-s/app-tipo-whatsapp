import { Navigate } from 'react-router';
import { useWorkspaceStore } from '@shared/stores/workspace.store';

/** /app → último espacio usado, el primero disponible o la bienvenida si aún no hay ninguno. */
export function AppHomeRedirect() {
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  if (workspaces.length === 0) return <Navigate to="/app/bienvenida" replace />;
  const last = localStorage.getItem('parla.lastWorkspace');
  const target = workspaces.find((w) => w.id === last) ?? workspaces[0];
  return <Navigate to={`/app/w/${target.id}`} replace />;
}
