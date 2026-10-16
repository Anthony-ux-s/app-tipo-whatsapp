import { useLocation, useNavigate } from 'react-router';

/** A dónde ir después de entrar: la página que pidió la sesión (p. ej. una invitación) o la app. */
export function useAuthRedirect() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  return {
    from,
    goNext: () => navigate(from, { replace: true }),
  };
}
