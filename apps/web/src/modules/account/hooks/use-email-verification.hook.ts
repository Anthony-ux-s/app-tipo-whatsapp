import type { SessionUser, VerificationStarted } from '@parla/types';
import { useState, type FormEvent } from 'react';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

/** Correo de recuperación: se escribe, llega un código y con el código queda verificado. */
export function useEmailVerification() {
  const user = useSessionStore((s) => s.user)!;
  const setUser = useSessionStore((s) => s.setUser);
  const [editing, setEditing] = useState(!user.email);
  const [email, setEmail] = useState(user.email ?? '');
  const [sent, setSent] = useState<VerificationStarted | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const verify = async (value = code) => {
    if (value.length !== 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      setUser(await http.post<SessionUser>('/auth/me/email/verify', { code: value }));
      setSent(null);
      setEditing(false);
      toast('Correo verificado: ya puedes recuperar tu cuenta con él', 'success');
    } catch (err) {
      setError(errorMessage(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return {
    current: user.email,
    editing,
    email,
    sent,
    code,
    error,
    busy,
    startEditing: () => {
      setEditing(true);
      setSent(null);
      setError(null);
    },
    cancel: () => {
      setEditing(!user.email);
      setSent(null);
      setEmail(user.email ?? '');
      setError(null);
    },
    onEmailChange: (value: string) => setEmail(value),
    onCodeChange: (value: string) => setCode(value),
    send: async (event?: FormEvent) => {
      event?.preventDefault();
      setBusy(true);
      setError(null);
      try {
        setSent(await http.post<VerificationStarted>('/auth/me/email', { email }));
        setCode('');
      } catch (err) {
        setError(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    verify: (value?: string) => void verify(value),
  };
}
