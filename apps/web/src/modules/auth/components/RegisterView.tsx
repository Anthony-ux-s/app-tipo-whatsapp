import { AtSign, KeyRound, Phone, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { useRegister } from '../hooks/use-register.hook';
import { AuthLayout } from './AuthLayout';

const STRENGTH_LABELS = ['Muy débil', 'Débil', 'Buena', 'Fuerte'];

export function RegisterView() {
  const form = useRegister();
  return (
    <AuthLayout title="Crea tu cuenta" subtitle="Usa tu teléfono o un nombre de usuario. Tus claves de cifrado se crean en este dispositivo.">
      <form onSubmit={form.submit} className="flex flex-col gap-4" noValidate>
        <div className="grid grid-cols-2 gap-1 rounded-[var(--radius-card)] bg-surface-3 p-1" role="tablist" aria-label="Cómo quieres registrarte">
          {(['username', 'phone'] as const).map((method) => (
            <button
              key={method}
              type="button"
              role="tab"
              aria-selected={form.method === method}
              onClick={() => form.selectMethod(method)}
              className={`flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-semibold transition-all duration-200 ${form.method === method ? 'bg-surface text-ink shadow-float' : 'text-ink-soft hover:text-ink'}`}
            >
              {method === 'username' ? <AtSign className="size-4" /> : <Phone className="size-4" />}
              {method === 'username' ? 'Usuario' : 'Teléfono'}
            </button>
          ))}
        </div>

        <Field
          label="Tu nombre"
          placeholder="Como te verán en tus chats"
          autoComplete="name"
          icon={<UserRound className="size-5" />}
          value={form.displayName}
          error={form.errors.displayName}
          onChange={(e) => form.onDisplayNameChange(e.target.value)}
        />
        {form.method === 'username' ? (
          <Field
            label="Nombre de usuario"
            placeholder="ej. maria.lopez"
            autoCapitalize="none"
            autoComplete="username"
            icon={<AtSign className="size-5" />}
            value={form.username}
            error={form.errors.username}
            hint="Así te encuentran sin conocer tu número."
            onChange={(e) => form.onUsernameChange(e.target.value)}
          />
        ) : (
          <Field
            label="Teléfono"
            type="tel"
            placeholder="+57 300 123 4567"
            autoComplete="tel"
            icon={<Phone className="size-5" />}
            value={form.phone}
            error={form.errors.phone}
            hint="Con el indicativo del país."
            onChange={(e) => form.onPhoneChange(e.target.value)}
          />
        )}
        <div className="flex flex-col gap-2">
          <Field
            label="Contraseña"
            type="password"
            placeholder="Mínimo 8 caracteres, con letras y números"
            autoComplete="new-password"
            icon={<KeyRound className="size-5" />}
            value={form.password}
            error={form.errors.password}
            onChange={(e) => form.onPasswordChange(e.target.value)}
          />
          {form.password && (
            <div className="flex items-center gap-2" aria-live="polite">
              <div className="flex flex-1 gap-1">
                {[1, 2, 3].map((level) => (
                  <span
                    key={level}
                    className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${form.strength >= level ? (form.strength === 3 ? 'bg-emerald-500' : 'bg-teal-500') : 'bg-surface-3'}`}
                  />
                ))}
              </div>
              <span className="w-20 text-right text-xs text-ink-soft">{STRENGTH_LABELS[form.strength]}</span>
            </div>
          )}
        </div>

        <label className="flex items-start gap-3 text-sm text-ink-soft">
          <input
            type="checkbox"
            checked={form.acceptedTerms}
            onChange={(e) => form.onTermsChange(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-teal-700"
          />
          <span>
            Autorizo el tratamiento de mis datos personales según la{' '}
            <Link to="/legal/privacidad" target="_blank" className="font-semibold text-brand underline dark:text-teal-300">
              política de privacidad
            </Link>{' '}
            (Ley 1581 de 2012 y normas equivalentes) y acepto los{' '}
            <Link to="/legal/terminos" target="_blank" className="font-semibold text-brand underline dark:text-teal-300">
              términos del servicio
            </Link>
            .
          </span>
        </label>

        {form.errors.form && <FieldError message={form.errors.form} />}
        <Button type="submit" size="lg" fullWidth loading={form.loading}>
          {form.loading ? 'Creando tus claves…' : 'Crear cuenta'}
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-soft">
        ¿Ya tienes cuenta?{' '}
        <Link to="/entrar" state={form.loginState} className="font-semibold text-brand hover:underline dark:text-teal-300">
          Entra aquí
        </Link>
      </p>
    </AuthLayout>
  );
}
