import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';

export type WelcomeStep = 'perfil' | 'contactos';

/** Bienvenida después de registrarse: foto y correo de recuperación, luego contactos. Todo opcional. */
export function useWelcome() {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const finishOnboarding = useSessionStore((s) => s.finishOnboarding);
  const [step, setStep] = useState<WelcomeStep>('perfil');

  const enter = () => {
    finishOnboarding();
    navigate('/app', { replace: true });
  };

  return {
    user,
    step,
    next: () => setStep('contactos'),
    back: () => setStep('perfil'),
    enter,
    /** Al abrir un chat desde los contactos, la bienvenida termina. */
    onOpenChat: finishOnboarding,
  };
}
