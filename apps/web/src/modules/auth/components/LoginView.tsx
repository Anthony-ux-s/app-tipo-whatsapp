import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar } from '@shared/ui/Avatar';
import { Button, IconButton } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { useLogin } from '../hooks/use-login.hook';
import { AuthLayout } from './AuthLayout';

export function LoginView() {
  const login = useLogin();
  return (
    <AuthLayout title="Hola de nuevo 👋" subtitle="Entra con tu nombre de usuario o tu número de teléfono.">
      <form onSubmit={login.submit} className="flex flex-col gap-4" noValidate>
        <Field
          label="Usuario o teléfono"
          placeholder="laura o +57 300 123 4567"
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
      </form>

      <p className="mt-5 text-center text-sm text-ink-soft">
        ¿No tienes cuenta?{' '}
        <Link to="/registro" state={login.registerState} className="font-semibold text-brand hover:underline dark:text-teal-300">
          Créala gratis
        </Link>
      </p>

      <div className="mt-6 border-t border-line pt-5">
        <p className="mb-3 text-xs font-semibold tracking-wide text-ink-faint uppercase">Cuentas de prueba</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {login.demoAccounts.map((account) => (
            <button
              key={account.identifier}
              type="button"
              onClick={() => login.fillDemo(account.identifier)}
              className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-line px-3 py-2 text-left transition-colors duration-200 hover:border-teal-300 hover:bg-teal-50 sm:flex-col sm:items-center sm:text-center dark:hover:bg-teal-950/40"
            >
              <Avatar name={account.name} color={account.color} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{account.name.split(' ')[0]}</span>
                <span className="block truncate text-[11px] text-ink-soft">{account.role}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  );
}
