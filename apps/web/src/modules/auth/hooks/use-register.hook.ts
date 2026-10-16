import { useState, type FormEvent } from 'react';
import { useSessionStore } from '@shared/stores/session.store';
import { errorMessage } from '@shared/utils/http';
import { passwordStrength, validatePassword, validatePhone, validateUsername } from '@shared/utils/validators';
import type { RegisterErrors, RegisterMethod } from '../types/auth.types';
import { useAuthRedirect } from './use-auth-redirect.hook';

export function useRegister() {
  const register = useSessionStore((s) => s.register);
  const { from, goNext } = useAuthRedirect();
  const [method, setMethod] = useState<RegisterMethod>('username');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('+57 ');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [loading, setLoading] = useState(false);

  const validate = (): RegisterErrors => ({
    displayName: displayName.trim().length < 2 ? 'Escribe tu nombre' : null,
    phone: method === 'phone' ? validatePhone(phone) : null,
    username: method === 'username' ? validateUsername(username) : null,
    password: validatePassword(password),
    form: acceptedTerms ? null : 'Acepta el tratamiento de datos para continuar',
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.values(found).some(Boolean)) return;
    setLoading(true);
    try {
      await register({ method, phone, username, displayName: displayName.trim(), password });
      goNext();
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return {
    method,
    displayName,
    phone,
    username,
    password,
    acceptedTerms,
    errors,
    loading,
    strength: passwordStrength(password),
    loginState: { from },
    selectMethod: (value: RegisterMethod) => {
      setMethod(value);
      setErrors({});
    },
    onDisplayNameChange: (value: string) => setDisplayName(value),
    onPhoneChange: (value: string) => setPhone(value),
    onUsernameChange: (value: string) => setUsername(value.toLowerCase().replace(/\s/g, '')),
    onPasswordChange: (value: string) => setPassword(value),
    onTermsChange: (value: boolean) => setAcceptedTerms(value),
    submit,
  };
}
