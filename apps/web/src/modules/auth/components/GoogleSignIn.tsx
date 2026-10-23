import { KeyRound } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Field, FieldError } from '@shared/ui/Field';
import { useGoogleAuth } from '../hooks/use-google-auth.hook';

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-5" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.6a14.5 14.5 0 0 1 0-9.2l-7.9-6.2a24 24 0 0 0 0 21.6l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.8 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** «Continuar con Google». Con cuenta existente pide la contraseña de Parla. */
export function GoogleSignIn({ label = 'Continuar con Google' }: { label?: string }) {
  const google = useGoogleAuth();

  if (google.pendingName) {
    return (
      <form onSubmit={google.unlock} className="flex flex-col gap-3" noValidate>
        <p className="rounded-[var(--radius-card)] bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:bg-teal-950/60 dark:text-teal-100">
          Hola, <span className="font-semibold">{google.pendingName}</span>. Escribe tu contraseña de Parla para abrir tus chats cifrados.
        </p>
        <Field
          label="Contraseña de Parla"
          type="password"
          placeholder="Tu contraseña"
          autoComplete="current-password"
          icon={<KeyRound className="size-5" />}
          value={google.password}
          onChange={(e) => google.onPasswordChange(e.target.value)}
        />
        {google.error && <FieldError message={google.error} />}
        <Button type="submit" size="lg" fullWidth loading={google.loading}>
          Entrar
        </Button>
        <button type="button" onClick={google.cancel} className="text-center text-sm font-semibold text-brand hover:underline dark:text-teal-300">
          Usar otra cuenta
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button type="button" variant="secondary" size="lg" fullWidth loading={google.loading} icon={<GoogleMark />} onClick={google.start} data-testid="google-signin">
        {label}
      </Button>
      {google.error && <FieldError message={google.error} />}
      <div className="flex items-center gap-3 text-xs text-ink-faint" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />o<span className="h-px flex-1 bg-line" />
      </div>
    </div>
  );
}
