import type { ConfirmationResult, RecaptchaVerifier } from 'firebase/auth';

/**
 * Verificación del teléfono con Firebase Authentication: Google manda el SMS y comprueba el código; la app
 * recibe un «ID token» que el backend valida (/auth/phone/firebase). Se carga solo al registrarse y solo si
 * están las variables VITE_FIREBASE_*; si no, se usa el código de siempre (OneSignal).
 */
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
};

export const firebaseEnabled = Boolean(config.apiKey && config.projectId);

let confirmation: ConfirmationResult | null = null;
let recaptcha: RecaptchaVerifier | null = null;

async function auth() {
  const { getApp, getApps, initializeApp } = await import('firebase/app');
  const { getAuth } = await import('firebase/auth');
  const app = getApps().length ? getApp() : initializeApp({ apiKey: config.apiKey, projectId: config.projectId, appId: config.appId, authDomain: config.authDomain || `${config.projectId}.firebaseapp.com` });
  const instance = getAuth(app);
  instance.languageCode = 'es';
  return instance;
}

/** Pide a Firebase que mande el SMS al número (E.164). Necesita un elemento con `containerId` para el reCAPTCHA invisible. */
export async function sendFirebaseCode(phone: string, containerId: string): Promise<void> {
  const { RecaptchaVerifier, signInWithPhoneNumber } = await import('firebase/auth');
  const instance = await auth();
  recaptcha?.clear();
  recaptcha = new RecaptchaVerifier(instance, containerId, { size: 'invisible' });
  try {
    confirmation = await signInWithPhoneNumber(instance, phone, recaptcha);
  } catch (error) {
    recaptcha.clear();
    recaptcha = null;
    throw error;
  }
}

/** Confirma el código que llegó por SMS y devuelve el ID token para el backend. */
export async function confirmFirebaseCode(code: string): Promise<string> {
  if (!confirmation) throw new Error('Pide primero el código.');
  const credential = await confirmation.confirm(code);
  const token = await credential.user.getIdToken();
  // La sesión de Firebase no se usa (Parla tiene la suya): se cierra para no dejarla abierta.
  await (await auth()).signOut().catch(() => undefined);
  confirmation = null;
  return token;
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-phone-number': 'Ese número no es válido. Revísalo e inténtalo de nuevo.',
  'auth/missing-phone-number': 'Escribe tu número de celular.',
  'auth/too-many-requests': 'Pediste muchos códigos. Espera unos minutos e inténtalo de nuevo.',
  'auth/quota-exceeded': 'Hoy se agotaron los envíos de SMS. Inténtalo más tarde.',
  'auth/invalid-verification-code': 'Ese código no es correcto.',
  'auth/code-expired': 'El código venció. Pide uno nuevo.',
  'auth/captcha-check-failed': 'No pudimos comprobar que eres una persona. Recarga la página e inténtalo de nuevo.',
  'auth/operation-not-allowed': 'La verificación por SMS no está activada todavía.',
  'auth/unauthorized-domain': 'Este sitio todavía no está autorizado para enviar SMS.',
  'auth/network-request-failed': 'No hay conexión. Revisa tu internet.',
};

/** Mensaje claro para el error de Firebase (o null si no es de Firebase y se debe mostrar el original). */
export function firebaseErrorMessage(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (!code?.startsWith('auth/')) return null;
  return MESSAGES[code] ?? 'No pudimos enviar el SMS. Revisa el número e inténtalo de nuevo.';
}
