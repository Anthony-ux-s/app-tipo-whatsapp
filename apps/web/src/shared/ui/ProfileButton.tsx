import { Link } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { Avatar } from './Avatar';

/**
 * Avatar del encabezado en el celular: abre el perfil y los ajustes, que no van en la barra
 * inferior. En escritorio ya están en la barra lateral.
 */
export function ProfileButton() {
  const user = useSessionStore((s) => s.user);
  if (!user) return null;
  return (
    <Link to="/app/ajustes" aria-label="Tu perfil y ajustes" title="Tu perfil y ajustes" className="shrink-0 rounded-full md:hidden">
      <Avatar name={user.displayName} color={user.avatarColor} photo={user.avatarUrl} size="sm" />
    </Link>
  );
}
