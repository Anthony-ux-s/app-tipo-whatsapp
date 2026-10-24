import type { AuthResponse } from '@parla/types';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { firebaseEnabled, firebaseErrorMessage, isGoogleCancelled, signInWithGoogle } from '@shared/utils/firebase-phone';
import { errorMessage } from '@shared/utils/http';
import { useAuthRedirect } from './use-auth-redirect.hook';

/** Datos que «Continuar con Google» deja listos para terminar el registro (correo ya verificado por Google). */
export interface GoogleSignup {
  verificationToken: string;
  email: string;
  displayName: string;
}

/**
 * «Continuar con Google»: si el correo ya tiene cuenta entra directo cuando este dispositivo ya tiene sus claves
 * de cifrado; en un dispositivo nuevo pide la contraseña de Parla una vez (abre las claves de los chats). Si no hay cuenta, lleva al último paso del registro con el correo ya verificado.
 */
export function useGoogleAuth() {
  const navigate = useNavigate();
  const { from, goNext } = useAuthRedirect();
  const googleSignIn = useSessionStore((s) => s.googleSignIn);
  const unlockSession = useSessionStore((s) => s.unlockSession);
  const unlockWithDevice = useSessionStore((s) => s.unlockWithDevice);
  const [pending, setPending] = useState<AuthResponse | null>(null);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const start = async () => {
    if (!firebaseEnabled) {
      setError('Entrar con Google todavía no está configurado (faltan las variables VITE_FIREBASE_* de Firebase).');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const result = await googleSignIn(await signInWithGoogle());
      if (result.kind === 'login') {
        // Si este dispositivo ya tiene la clave de la cuenta, Google basta: entra directo a sus chats.
        if (await unlockWithDevice(result.auth)) {
          goNext();
          return;
        }
        setPending(result.auth);
        setPassword('');
      } else {
        const google: GoogleSignup = { verificationToken: result.verificationToken, email: result.email, displayName: result.displayName };
        navigate('/registro', { replace: true, state: { from, google } });
      }
    } catch (err) {
      if (!isGoogleCancelled(err)) setError(firebaseErrorMessage(err) ?? errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const unlock = async (event: FormEvent) => {
    event.preventDefault();
    if (!pending || !password) {
      setError('Escribe tu contraseña de Parla');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await unlockSession(pending, password);
      goNext();
    } catch {
      // La contraseña no abre las claves de cifrado de esta cuenta.
      setError('Esa no es la contraseña de tu cuenta de Parla. Inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return {
    pendingName: pending?.user.displayName ?? null,
    password,
    error,
    loading,
    onPasswordChange: setPassword,
    start: () => void start(),
    unlock,
    cancel: () => {
      setPending(null);
      setError(null);
    },
  };
}
