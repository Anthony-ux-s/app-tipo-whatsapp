import { ValidationError } from './domain-error';

/** Versión vigente de los términos y la política de privacidad (cambia si cambian los textos). */
export const TERMS_VERSION = '2026-10';

export function assertTermsAccepted(accepted: unknown): void {
  if (accepted !== true) {
    throw new ValidationError('Debes aceptar los términos y la política de privacidad para crear tu cuenta');
  }
}

/** Datos con los que queda una cuenta eliminada: sin nada que identifique a la persona. */
export const DELETED_ACCOUNT = {
  displayName: 'Cuenta eliminada',
  about: '',
  avatarColor: 'teal-dark',
} as const;

export const EXPORT_NOTE =
  'El contenido de tus mensajes y archivos está cifrado de extremo a extremo: el servidor no puede leerlo ' +
  'y por eso no se incluye aquí. Puedes leerlo en la app mientras conserves tu cuenta.';
