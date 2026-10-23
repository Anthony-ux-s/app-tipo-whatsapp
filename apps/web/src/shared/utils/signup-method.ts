import { firebaseEnabled } from './firebase-phone';

/**
 * Cómo se verifica a quien se registra: con el correo (código por correo, Brevo) o con el teléfono (SMS).
 * Se elige con VITE_SIGNUP_METHOD=email|phone; sin esa variable, es el teléfono si Firebase está configurado y
 * si no, el correo.
 */
export const signupMethod: 'email' | 'phone' = import.meta.env.VITE_SIGNUP_METHOD === 'phone' ? 'phone' : import.meta.env.VITE_SIGNUP_METHOD === 'email' ? 'email' : firebaseEnabled ? 'phone' : 'email';
