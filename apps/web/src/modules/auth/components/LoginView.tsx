import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Button, IconButton } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { useLogin } from '../hooks/use-login.hook';
import { AuthLayout } from './AuthLayout';
import { GoogleSignIn } from './GoogleSignIn';

export function LoginView() {
  const login = useLogin();
  return (
    <AuthLayout title="Hola de nuevo 👋" subtitle="Entra con tu usuario, tu correo o tu número de teléfono.">
      <GoogleSignIn />
      <form onSubmit={login.submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Usuario, correo o teléfono"
          placeholder="usuario, correo o +51 999 999 999"
          autoComplete="username"
          autoCapitalize="none"
          icon={<UserRound className="size-5" />}
          value={login.identifier}
          onChange={(e) => login.onIdentifierChange(e.target.value)}
        />
        <Field
          label="Contraseña"
          type={login.showPassword ? 'text' : 'password'}
          placeholder="Tu contraseña"
          autoComplete="current-password"
          icon={<LockKeyhole className="size-5" />}
          value={login.password}
          onChange={(e) => login.onPasswordChange(e.target.value)}
          trailing={
            <IconButton label={login.showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={login.togglePassword}>
              {login.showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
            </IconButton>
          }
        />
        {login.error && <FieldError message={login.error} />}
        <Button type="submit" size="lg" fullWidth loading={login.loading}>
          Entrar
        </Button>
        <Link to="/recuperar" className="-mt-1 text-center text-sm font-semibold text-brand hover:underline dark:text-teal-300">
          ¿Olvidaste tu contraseña?
        </Link>
      </form>

      <p className="mt-5 text-center text-sm text-ink-soft">
        ¿No tienes cuenta?{' '}
        <Link to="/registro" state={login.registerState} className="font-semibold text-brand hover:underline dark:text-teal-300">
          Créala gratis
        </Link>
      </p>
    </AuthLayout>
  );
}
