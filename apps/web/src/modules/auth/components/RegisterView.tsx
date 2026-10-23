import { ArrowLeft, AtSign, ChevronDown, FlaskConical, KeyRound, Mail, MessageSquareText, Phone, UserRound } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@shared/ui/Button';
import { CodeInput } from '@shared/ui/CodeInput';
import { Field, FieldError } from '@shared/ui/Field';
import { useRegister } from '../hooks/use-register.hook';
import { firebaseEnabled } from '@shared/utils/firebase-phone';
import { AuthLayout } from './AuthLayout';
import { GoogleSignIn } from './GoogleSignIn';

const STRENGTH_LABELS = ['Muy débil', 'Débil', 'Buena', 'Fuerte'];
const STEP_TITLES = {
  phone: { title: 'Crea tu cuenta', subtitle: 'Empieza con tu número de celular. Te enviaremos un código por SMS.' },
  code: { title: 'Escribe el código', subtitle: 'Te lo enviamos por SMS. Vence en 10 minutos.' },
  details: { title: 'Tus datos', subtitle: 'Así te verán tus contactos. Tus claves de cifrado se crean en este dispositivo.' },
} as const;
const EMAIL_TITLES = {
  phone: { title: 'Crea tu cuenta', subtitle: 'Empieza con tu correo. Te enviaremos un código para confirmarlo.' },
  code: { title: 'Revisa tu correo', subtitle: 'Te enviamos un código de 6 dígitos. Vence en 10 minutos. Si no lo ves, mira en spam.' },
  details: STEP_TITLES.details,
} as const;

function StepDots({ current }: { current: number }) {
  return (
    <div className="mb-5 flex items-center gap-1.5" aria-label={`Paso ${current + 1} de 3`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === current ? 'w-8 bg-brand' : i < current ? 'w-4 bg-teal-300' : 'w-4 bg-surface-3'}`} />
      ))}
    </div>
  );
}

export function RegisterView() {
  const form = useRegister();
  const titles = (form.byEmail ? EMAIL_TITLES : STEP_TITLES)[form.step];
  return (
    <AuthLayout title={titles.title} subtitle={titles.subtitle}>
      <StepDots current={form.step === 'phone' ? 0 : form.step === 'code' ? 1 : 2} />

      {form.step === 'phone' && <GoogleSignIn label="Registrarme con Google" />}

      {form.step === 'phone' && (
        <form onSubmit={form.sendCode} className="flex flex-col gap-4" noValidate>
          {form.byEmail ? (
            <Field
              label="Correo electrónico"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              placeholder="nombre@correo.com"
              icon={<Mail className="size-5" />}
              value={form.email}
              onChange={(e) => form.onEmailChange(e.target.value)}
              hint="Solo lo usamos para confirmar que eres tú y para ayudarte a recuperar tu cuenta."
              data-testid="signup-email"
            />
          ) : (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="phone-local" className="text-sm font-medium text-ink">
                Número de celular
              </label>
              <div className="flex gap-2">
                {/* Se ve compacto («+57 ▾»); al tocarlo se abre la lista nativa con los nombres de los países. */}
                <label className="relative flex h-12 w-24 shrink-0 items-center justify-between gap-1 rounded-[var(--radius-card)] border border-line bg-surface px-3 text-[15px] font-semibold text-ink focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/30">
                  <span title={form.country.name}>+{form.country.code}</span>
                  <ChevronDown className="size-4 text-ink-faint" />
                  <select aria-label="País" value={form.country.iso} onChange={(e) => form.onCountryChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0">
                    {form.countries.map((c) => (
                      <option key={c.iso} value={c.iso}>
                        {c.name} (+{c.code})
                      </option>
                    ))}
                  </select>
                </label>
                <div className="relative flex-1">
                  <Phone className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-faint" />
                  <input
                    id="phone-local"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder={form.country.example}
                    value={form.localNumber}
                    onChange={(e) => form.onLocalNumberChange(e.target.value)}
                    className="h-12 w-full rounded-[var(--radius-card)] border border-line bg-surface pr-3 pl-10 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-teal-500 focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>
              </div>
              <p className="text-xs text-ink-soft">Solo lo usamos para verificar que eres tú y para que tus contactos te encuentren.</p>
            </div>
          )}
          {form.errors.phone && <FieldError message={form.errors.phone} />}
          <Button type="submit" size="lg" fullWidth loading={form.loading} icon={form.byEmail ? <Mail className="size-5" /> : <MessageSquareText className="size-5" />}>
            {form.byEmail ? 'Enviarme el código al correo' : 'Enviarme el código'}
          </Button>
          <p className="text-center text-xs text-ink-faint">
            Al crear tu cuenta aceptas los{' '}
            <Link to="/legal/terminos" target="_blank" className="font-semibold underline">
              términos del servicio
            </Link>{' '}
            y la{' '}
            <Link to="/legal/privacidad" target="_blank" className="font-semibold underline">
              política de privacidad
            </Link>
            .
          </p>
        </form>
      )}

      {form.step === 'code' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Enviado a <span className="font-semibold text-ink">{form.sent?.sentTo}</span>.{' '}
            <button type="button" onClick={form.changeNumber} className="inline-flex items-center gap-1 font-semibold text-brand hover:underline dark:text-teal-300">
              <ArrowLeft className="size-3.5" /> {form.byEmail ? 'Cambiar correo' : 'Cambiar número'}
            </button>
          </p>
          {form.sent?.devCode && (
            <p className="flex items-start gap-2 rounded-[var(--radius-card)] bg-cyan-50 p-3 text-sm text-cyan-900 dark:bg-cyan-950/50 dark:text-cyan-100" data-testid="dev-code">
              <FlaskConical className="mt-0.5 size-4 shrink-0" />
              <span>
                Modo de prueba ({form.byEmail ? 'Brevo' : 'OneSignal'} sin configurar): tu código es <strong className="font-mono tracking-widest">{form.sent.devCode}</strong>
              </span>
            </p>
          )}
          <CodeInput value={form.code} onChange={form.onCodeChange} onComplete={form.verify} disabled={form.loading} />
          {form.errors.code && <FieldError message={form.errors.code} />}
          <Button size="lg" fullWidth loading={form.loading} disabled={form.code.length !== 6} onClick={() => form.verify()}>
            Verificar
          </Button>
          <button
            type="button"
            onClick={() => form.sendCode()}
            disabled={form.resendIn > 0 || form.loading}
            className="text-center text-sm font-semibold text-brand hover:underline disabled:cursor-not-allowed disabled:text-ink-faint disabled:no-underline dark:text-teal-300"
          >
            {form.resendIn > 0 ? `Reenviar código en ${form.resendIn} s` : 'Reenviar código'}
          </button>
        </div>
      )}

      {form.step === 'details' && (
        <form onSubmit={form.createAccount} className="flex flex-col gap-4" noValidate>
          <p className="rounded-[var(--radius-card)] bg-teal-50 px-3 py-2 text-sm text-teal-900 dark:bg-teal-950/60 dark:text-teal-100">
            ✓ {form.byEmail ? 'Correo' : 'Número'} verificado: <span className="font-semibold">{form.contact}</span>
          </p>
          <Field
            label="Tu nombre"
            placeholder="Como te verán en tus chats"
            autoComplete="name"
            icon={<UserRound className="size-5" />}
            value={form.displayName}
            error={form.errors.displayName}
            onChange={(e) => form.onDisplayNameChange(e.target.value)}
          />
          <Field
            label="Nombre de usuario (opcional)"
            placeholder="ej. maria.lopez"
            autoCapitalize="none"
            autoComplete="username"
            icon={<AtSign className="size-5" />}
            value={form.username}
            error={form.errors.username}
            hint="Para que te encuentren sin tu número. Puedes ponerlo o cambiarlo luego en Ajustes."
            onChange={(e) => form.onUsernameChange(e.target.value)}
          />
          <div className="flex flex-col gap-2">
            <Field
              label="Contraseña"
              type="password"
              placeholder="Mínimo 8 caracteres, con letras y números"
              autoComplete="new-password"
              icon={<KeyRound className="size-5" />}
              value={form.password}
              error={form.errors.password}
              hint="Protege tus claves de cifrado y te deja entrar desde otro dispositivo."
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
            <input type="checkbox" checked={form.acceptedTerms} onChange={(e) => form.onTermsChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-teal-700" />
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
      )}

      <p className="mt-5 text-center text-sm text-ink-soft">
        ¿Ya tienes cuenta?{' '}
        <Link to="/entrar" state={form.loginState} className="font-semibold text-brand hover:underline dark:text-teal-300">
          Entra aquí
        </Link>
      </p>
      {/* Lugar del reCAPTCHA invisible de Firebase (no se ve) y el aviso que Google pide al ocultar su logo. */}
      <div id="recaptcha-container" />
      {firebaseEnabled && !form.byEmail && (
        <p className="mt-4 text-center text-[11px] leading-snug text-ink-faint">
          Este sitio está protegido por reCAPTCHA y se aplican la{' '}
          <a href="https://policies.google.com/privacy" target="_blank" rel="noreferrer" className="underline">
            Política de privacidad
          </a>{' '}
          y las{' '}
          <a href="https://policies.google.com/terms" target="_blank" rel="noreferrer" className="underline">
            Condiciones del servicio
          </a>{' '}
          de Google.
        </p>
      )}
    </AuthLayout>
  );
}
