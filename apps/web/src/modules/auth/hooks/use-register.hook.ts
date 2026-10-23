import type { VerificationProof, VerificationStarted } from '@parla/types';
import { useEffect, useState, type FormEvent } from 'react';
import { COUNTRIES, defaultCountry, toE164, type Country } from '@shared/const/countries.const';
import { useSessionStore } from '@shared/stores/session.store';
import { confirmFirebaseCode, firebaseEnabled, firebaseErrorMessage, sendFirebaseCode } from '@shared/utils/firebase-phone';
import { errorMessage, http } from '@shared/utils/http';
import { passwordStrength, validatePassword, validateUsername } from '@shared/utils/validators';
import type { RegisterErrors, RegisterStep } from '../types/auth.types';
import { useAuthRedirect } from './use-auth-redirect.hook';
import { useSmsAutofill } from './use-sms-autofill.hook';

/**
 * Registro en tres pasos: número → código por SMS → tus datos. Después de crear la cuenta sigue la
 * bienvenida (foto, correo de recuperación y contactos), que es opcional.
 */
export function useRegister() {
  const register = useSessionStore((s) => s.register);
  const { from } = useAuthRedirect();
  const [step, setStep] = useState<RegisterStep>('phone');
  const [country, setCountry] = useState<Country>(() => defaultCountry());
  const [localNumber, setLocalNumber] = useState('');
  const [sent, setSent] = useState<VerificationStarted | null>(null);
  const [code, setCode] = useState('');
  const [proof, setProof] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [errors, setErrors] = useState<RegisterErrors>({});
  const [loading, setLoading] = useState(false);

  const phone = toE164(country, localNumber);

  // Cuenta regresiva para pedir otro código.
  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  const sendCode = async () => {
    setErrors({});
    if (localNumber.replace(/\D/g, '').length < 6) {
      setErrors({ phone: 'Escribe tu número de celular' });
      return;
    }
    setLoading(true);
    try {
      let started: VerificationStarted;
      if (firebaseEnabled) {
        // Firebase manda el SMS; el contenedor del reCAPTCHA invisible está en la pantalla de registro.
        await sendFirebaseCode(phone, 'recaptcha-container');
        started = { sentTo: `${phone.slice(0, 3)} *** *** ${phone.slice(-4)}`, expiresInSeconds: 600, resendInSeconds: 60 };
      } else {
        started = await http.post<VerificationStarted>('/auth/phone/start', { phone });
      }
      setSent(started);
      setResendIn(started.resendInSeconds);
      setCode('');
      setStep('code');
    } catch (err) {
      setErrors({ phone: firebaseErrorMessage(err) ?? errorMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6 || loading) return;
    setLoading(true);
    setErrors({});
    try {
      const { verificationToken } = firebaseEnabled
        ? await http.post<VerificationProof>('/auth/phone/firebase', { idToken: await confirmFirebaseCode(value) })
        : await http.post<VerificationProof>('/auth/phone/verify', { phone, code: value });
      setProof(verificationToken);
      setStep('details');
    } catch (err) {
      setErrors({ code: firebaseErrorMessage(err) ?? errorMessage(err) });
      setCode('');
    } finally {
      setLoading(false);
    }
  };

  // En Android con Chrome el código del SMS se completa solo.
  useSmsAutofill(step === 'code', (otp) => {
    setCode(otp);
    void verify(otp);
  });

  const createAccount = async (event: FormEvent) => {
    event.preventDefault();
    const found: RegisterErrors = {
      displayName: displayName.trim().length < 2 ? 'Escribe tu nombre' : null,
      username: username.trim() ? validateUsername(username) : null,
      password: validatePassword(password),
      form: acceptedTerms ? null : 'Acepta el tratamiento de datos para continuar',
    };
    setErrors(found);
    if (Object.values(found).some(Boolean) || !proof) return;
    setLoading(true);
    try {
      // Al quedar con sesión, la ruta de invitados lleva a la bienvenida (foto, correo, contactos).
      await register({ verificationToken: proof, displayName: displayName.trim(), username, password });
    } catch (err) {
      setErrors({ form: errorMessage(err) });
      setLoading(false);
    }
  };

  return {
    step,
    countries: COUNTRIES,
    country,
    localNumber,
    phone,
    sent,
    code,
    resendIn,
    displayName,
    username,
    password,
    acceptedTerms,
    errors,
    loading,
    strength: passwordStrength(password),
    loginState: { from },
    onCountryChange: (iso: string) => setCountry(COUNTRIES.find((c) => c.iso === iso) ?? country),
    onLocalNumberChange: (value: string) => setLocalNumber(value.replace(/[^\d\s]/g, '')),
    sendCode: (event?: FormEvent) => {
      event?.preventDefault();
      void sendCode();
    },
    onCodeChange: (value: string) => setCode(value),
    verify: (value?: string) => void verify(value),
    changeNumber: () => {
      setStep('phone');
      setErrors({});
    },
    onDisplayNameChange: (value: string) => setDisplayName(value),
    onUsernameChange: (value: string) => setUsername(value.toLowerCase().replace(/\s/g, '')),
    onPasswordChange: (value: string) => setPassword(value),
    onTermsChange: (value: boolean) => setAcceptedTerms(value),
    createAccount,
  };
}
