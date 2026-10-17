import type { PresenceStatus, ThemePreference } from './enums.types';

/** Clave privada ECDH cifrada con la contraseña del usuario (el servidor nunca la ve en claro). */
export interface EncryptedKeyBackup {
  ciphertext: string;
  iv: string;
  salt: string;
  iterations: number;
}

export interface UserPreferences {
  theme: ThemePreference;
  enterToSend: boolean;
  notificationSound: boolean;
}

export interface UserProfile {
  id: string;
  username: string | null;
  phone: string | null;
  displayName: string;
  about: string;
  avatarColor: string;
  /** Foto de perfil; null = iniciales sobre el color. */
  avatarUrl: string | null;
  presence: PresenceStatus;
  lastSeenAt: string | null;
  createdAt: string;
}

export interface PublicUser {
  id: string;
  username: string | null;
  displayName: string;
  about: string;
  avatarColor: string;
  avatarUrl: string | null;
  presence: PresenceStatus;
  lastSeenAt: string | null;
  /** Clave pública ECDH en formato JWK serializado. */
  publicKey: string;
}

export interface SessionUser extends UserProfile {
  /** Correo verificado para restablecer la contraseña (null si no tiene). */
  email: string | null;
  preferences: UserPreferences;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
  /** Soporte de Parla (panel de administración). */
  isAdmin: boolean;
}

export interface RegisterRequest {
  /** Comprobante de que el teléfono se verificó con el código por SMS (de POST /auth/phone/verify). */
  verificationToken: string;
  /** Opcional: se puede elegir o cambiar después en Ajustes. */
  username?: string;
  displayName: string;
  password: string;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
  /** Aceptación explícita de términos y política de privacidad (Ley 1581 / LGPD). */
  acceptTerms: boolean;
}

export interface LoginRequest {
  /** Teléfono o nombre de usuario. */
  identifier: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: SessionUser;
}

export interface UpdateProfileRequest {
  displayName?: string;
  /** Nombre de usuario nuevo; cadena vacía lo quita. */
  username?: string;
  about?: string;
  avatarColor?: string;
  preferences?: Partial<UserPreferences>;
}

export interface DeleteAccountRequest {
  password: string;
}

/** Copia de los datos personales de la cuenta (derecho de acceso y portabilidad). */
export interface AccountExport {
  exportedAt: string;
  profile: Omit<UserProfile, 'presence'>;
  preferences: UserPreferences;
  termsVersion: string | null;
  termsAcceptedAt: string | null;
  conversations: { title: string; kind: string; joinedAt: string }[];
  activity: { messagesSent: number; ordersPlaced: number };
  note: string;
}

// ── Verificación por código (SMS al registrarse, correo para recuperar la cuenta) ────────────────

export interface StartPhoneVerificationRequest {
  /** Teléfono internacional, p. ej. +57 300 123 4567. */
  phone: string;
}

export interface VerificationStarted {
  /** A dónde se envió (teléfono o correo enmascarado: «+57 *** *** 4567»). */
  sentTo: string;
  expiresInSeconds: number;
  /** Cuánto esperar antes de pedir otro código. */
  resendInSeconds: number;
  /** Solo en desarrollo sin OneSignal configurado: el código, para poder probar. Nunca en producción. */
  devCode?: string;
}

export interface VerifyPhoneRequest {
  phone: string;
  code: string;
}

/** Comprobante de un solo uso: el teléfono (o correo) quedó verificado. */
export interface VerificationProof {
  verificationToken: string;
}

export interface StartEmailVerificationRequest {
  email: string;
}

export interface VerifyEmailRequest {
  code: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface VerifyResetCodeRequest {
  email: string;
  code: string;
}

/**
 * Contraseña nueva. Como la clave privada estaba cifrada con la anterior, el navegador crea claves
 * nuevas; los chats se vuelven a compartir con la cuenta cuando otro participante lo acepta.
 */
export interface ResetPasswordRequest {
  verificationToken: string;
  password: string;
  publicKey: string;
  keyBackup: EncryptedKeyBackup;
}

/** Números de la libreta del teléfono para saber quiénes ya están en Parla (no se guardan). */
export interface MatchContactsRequest {
  phones: string[];
}

export interface ContactMatch {
  /** El número tal como lo envió el navegador (para mostrar el nombre de la libreta). */
  phone: string;
  user: PublicUser;
}
