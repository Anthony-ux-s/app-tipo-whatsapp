import { ArrowLeft, ArrowRight, MessageCircle } from 'lucide-react';
import { Button } from '@shared/ui/Button';
import { Logo } from '@shared/ui/Logo';
import { firstName } from '@shared/utils/text';
import { useWelcome } from '../hooks/use-welcome.hook';
import { AvatarPicker } from './AvatarPicker';
import { ContactsFinder } from './ContactsFinder';
import { EmailVerificationForm } from './EmailVerificationForm';

/** Recién registrada: completa tu perfil y encuentra a tus contactos (se puede omitir todo). */
export function WelcomeView() {
  const w = useWelcome();
  return (
    <div className="flex min-h-dvh items-start justify-center overflow-y-auto bg-canvas px-4 py-8 sm:items-center sm:px-6">
      <div className="w-full max-w-md animate-rise">
        <div className="mb-6 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-2xl bg-surface p-5 shadow-float ring-1 ring-line sm:p-7">
          <div className="mb-5 flex items-center gap-1.5" aria-label={w.step === 'perfil' ? 'Paso 1 de 2' : 'Paso 2 de 2'}>
            <span className={`h-1.5 rounded-full transition-all duration-300 ${w.step === 'perfil' ? 'w-8 bg-brand' : 'w-4 bg-teal-300'}`} />
            <span className={`h-1.5 rounded-full transition-all duration-300 ${w.step === 'contactos' ? 'w-8 bg-brand' : 'w-4 bg-surface-3'}`} />
          </div>

          {w.step === 'perfil' ? (
            <>
              <h1 className="text-2xl font-extrabold text-ink">¡Hola, {firstName(w.user.displayName)}!</h1>
              <p className="mt-1 text-sm text-ink-soft">Pon tu foto para que tus contactos te reconozcan, y un correo por si algún día olvidas tu contraseña.</p>
              <div className="mt-6">
                <AvatarPicker />
              </div>
              <div className="mt-6 border-t border-line pt-5">
                <h2 className="mb-3 text-sm font-bold text-ink">Correo de recuperación</h2>
                <EmailVerificationForm />
              </div>
              <div className="mt-6 flex items-center justify-between gap-2">
                <button type="button" onClick={w.next} className="text-sm font-semibold text-ink-soft hover:text-ink">
                  Omitir
                </button>
                <Button icon={<ArrowRight className="size-4" />} onClick={w.next}>
                  Continuar
                </Button>
              </div>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold text-ink">Tus contactos</h1>
              <p className="mt-1 mb-5 text-sm text-ink-soft">Mira quiénes de tu teléfono ya están en Parla y escríbeles.</p>
              <ContactsFinder onOpenChat={w.onOpenChat} />
              <div className="mt-6 flex items-center justify-between gap-2">
                <button type="button" onClick={w.back} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
                  <ArrowLeft className="size-4" /> Atrás
                </button>
                <Button icon={<MessageCircle className="size-4" />} onClick={w.enter}>
                  Entrar a Parla
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
