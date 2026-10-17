import type { VerificationProof, VerificationStarted } from '@parla/types';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';
import { passwordStrength, validatePassword } from '@shared/utils/validators';

export type ForgotStep = 'email' | 'code' | 'password';

/** Restablecer la contraseña: correo verificado → código → contraseña nueva (y claves nuevas). */
export function useForgotPassword() {
  const navigate = useNavigate();
  const resetPassword = useSessionStore((s) => s.resetPassword);
  const [step, setStep] = useState<ForgotStep>('email');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<VerificationStarted | null>(null);
  const [code, setCode] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const verify = (value = code) =>
    value.length === 6 &&
    void run(async () => {
      try {
        const { verificationToken } = await http.post<VerificationProof>('/auth/password/verify', { email, code: value });
        setProof(verificationToken);
        setStep('password');
      } catch (err) {
        setCode('');
        throw err;
      }
    });

  return {
    step,
    email,
    sent,
    code,
    password,
    error,
    loading,
    strength: passwordStrength(password),
    onEmailChange: (value: string) => setEmail(value),
    onCodeChange: (value: string) => setCode(value),
    onPasswordChange: (value: string) => setPassword(value),
    sendCode: (event?: FormEvent) => {
      event?.preventDefault();
      void run(async () => {
        setSent(await http.post<VerificationStarted>('/auth/password/forgot', { email }));
        setCode('');
        setStep('code');
      });
    },
    verify,
    save: (event: FormEvent) => {
      event.preventDefault();
      const invalid = validatePassword(password);
      if (invalid) {
        setError(invalid);
        return;
      }
      void run(async () => {
        await resetPassword(proof!, password);
        toast('Listo: entraste con tu contraseña nueva', 'success');
        navigate('/app', { replace: true });
      });
    },
  };
}
