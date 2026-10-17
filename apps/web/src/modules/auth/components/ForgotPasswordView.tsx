import { FlaskConical, Info, KeyRound, Mail } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { CodeInput } from '@shared/ui/CodeInput';
import { Field, FieldError } from '@shared/ui/Field';
import { useForgotPassword } from '../hooks/use-forgot-password.hook';
import { AuthLayout } from './AuthLayout';

const TITLES = {
  email: { title: 'Restablecer contraseña', subtitle: 'Escribe el correo que verificaste en tu cuenta y te enviamos un código.' },
  code: { title: 'Revisa tu correo', subtitle: 'Escribe el código que te enviamos. Vence en 10 minutos.' },
  password: { title: 'Contraseña nueva', subtitle: 'Elige una contraseña que no hayas usado antes.' },
} as const;

export function ForgotPasswordView() {
  const f = useForgotPassword();
  const t = TITLES[f.step];
  return (
    <AuthLayout title={t.title} subtitle={t.subtitle}>
      {f.step === 'email' && (
        <form onSubmit={f.sendCode} className="flex flex-col gap-4" noValidate>
          <Field label="Correo" type="email" autoComplete="email" placeholder="nombre@correo.com" icon={<Mail className="size-5" />} value={f.email} onChange={(e) => f.onEmailChange(e.target.value)} />
          {f.error && <FieldError message={f.error} />}
          <Button type="submit" size="lg" fullWidth loading={f.loading} disabled={!f.email.trim()}>
            Enviarme el código
          </Button>
        </form>
      )}

      {f.step === 'code' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Si <span className="font-semibold text-ink">{f.sent?.sentTo}</span> está en una cuenta de Parla, ya te llegó el código.
          </p>
          {f.sent?.devCode && (
            <p className="flex items-start gap-2 rounded-[var(--radius-card)] bg-cyan-50 p-3 text-sm text-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-100" data-testid="dev-code">
              <FlaskConical className="mt-0.5 size-4 shrink-0" />
              <span>
                Modo de prueba: el código es <strong className="font-mono tracking-widest">{f.sent.devCode}</strong>
              </span>
            </p>
          )}
          <CodeInput value={f.code} onChange={f.onCodeChange} onComplete={f.verify} disabled={f.loading} label="Código del correo" />
          {f.error && <FieldError message={f.error} />}
          <Button size="lg" fullWidth loading={f.loading} disabled={f.code.length !== 6} onClick={() => f.verify()}>
            Verificar
          </Button>
        </div>
      )}

      {f.step === 'password' && (
        <form onSubmit={f.save} className="flex flex-col gap-4" noValidate>
          <p className="flex items-start gap-2 rounded-[var(--radius-card)] bg-teal-50 p-3 text-sm text-teal-900 dark:bg-teal-950/60 dark:text-teal-100">
            <Info className="mt-0.5 size-4 shrink-0" />
            Tus mensajes van cifrados con una clave que dependía de tu contraseña anterior. Se creará una clave nueva y tus contactos verán un aviso para volver a compartirte cada chat.
          </p>
          <Field label="Contraseña nueva" type="password" autoComplete="new-password" placeholder="Mínimo 8 caracteres, con letras y números" icon={<KeyRound className="size-5" />} value={f.password} onChange={(e) => f.onPasswordChange(e.target.value)} />
          {f.error && <FieldError message={f.error} />}
          <Button type="submit" size="lg" fullWidth loading={f.loading}>
            {f.loading ? 'Creando tus claves nuevas…' : 'Guardar y entrar'}
          </Button>
        </form>
      )}

      <p className="mt-5 text-center text-sm text-ink-soft">
        <Link to="/entrar" className="font-semibold text-brand hover:underline dark:text-teal-300">
          Volver a entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
