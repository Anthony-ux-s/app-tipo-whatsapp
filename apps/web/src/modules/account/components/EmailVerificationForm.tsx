import { CheckCircle2, FlaskConical, Mail } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { CodeInput } from '@shared/ui/CodeInput';
import { Field, FieldError } from '@shared/ui/Field';
import { useEmailVerification } from '../hooks/use-email-verification.hook';

/** Agregar o cambiar el correo para restablecer la contraseña (con código de verificación). */
export function EmailVerificationForm() {
  const e = useEmailVerification();

  if (!e.editing && e.current) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="flex min-w-0 items-center gap-2 text-[15px] text-ink">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate" data-testid="verified-email">
            {e.current}
          </span>
        </p>
        <Button variant="ghost" size="sm" onClick={e.startEditing}>
          Cambiar
        </Button>
      </div>
    );
  }

  if (e.sent) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-soft">
          Escribe el código que enviamos a <span className="font-semibold text-ink">{e.sent.sentTo}</span>.
        </p>
        {e.sent.devCode && (
          <p className="flex items-start gap-2 rounded-[var(--radius-card)] bg-cyan-50 p-3 text-sm text-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-100" data-testid="dev-code">
            <FlaskConical className="mt-0.5 size-4 shrink-0" />
            <span>
              Modo de prueba: el código es <strong className="font-mono tracking-widest">{e.sent.devCode}</strong>
            </span>
          </p>
        )}
        <CodeInput value={e.code} onChange={e.onCodeChange} onComplete={e.verify} disabled={e.busy} label="Código del correo" />
        {e.error && <FieldError message={e.error} />}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={e.cancel}>
            Cancelar
          </Button>
          <Button size="sm" loading={e.busy} disabled={e.code.length !== 6} onClick={() => e.verify()}>
            Verificar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={e.send} className="flex flex-col gap-3" noValidate>
      <Field
        label="Correo"
        type="email"
        autoComplete="email"
        placeholder="nombre@correo.com"
        icon={<Mail className="size-5" />}
        value={e.email}
        onChange={(ev) => e.onEmailChange(ev.target.value)}
        hint="Si olvidas tu contraseña, te enviamos ahí un código para restablecerla."
      />
      {e.error && <FieldError message={e.error} />}
      <div className="flex justify-end gap-2">
        {e.current && (
          <Button variant="ghost" size="sm" onClick={e.cancel}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="sm" loading={e.busy} disabled={!e.email.trim()}>
          Enviar código
        </Button>
      </div>
    </form>
  );
}
