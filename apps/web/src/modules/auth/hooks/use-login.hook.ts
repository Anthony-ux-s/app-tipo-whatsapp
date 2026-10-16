import { useState, type FormEvent } from 'react';
import { useSessionStore } from '@shared/stores/session.store';
import { errorMessage } from '@shared/utils/http';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../const/auth.const';
import { useAuthRedirect } from './use-auth-redirect.hook';

export function useLogin() {
  const login = useSessionStore((s) => s.login);
  const { from, goNext } = useAuthRedirect();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError('Escribe tu usuario o teléfono y tu contraseña');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await login(identifier.trim(), password);
      goNext();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return {
    identifier,
    password,
    showPassword,
    error,
    loading,
    demoAccounts: DEMO_ACCOUNTS,
    registerState: { from },
    onIdentifierChange: (value: string) => setIdentifier(value),
    onPasswordChange: (value: string) => setPassword(value),
    togglePassword: () => setShowPassword((v) => !v),
    fillDemo: (value: string) => {
      setIdentifier(value);
      setPassword(DEMO_PASSWORD);
      setError(null);
    },
    submit,
  };
}
