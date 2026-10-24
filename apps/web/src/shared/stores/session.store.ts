import { decryptPrivateKey, encryptPrivateKey, generateIdentityKeyPair } from '@parla/crypto';
import type { AuthResponse, GoogleSignInResponse, PublicUser, SessionUser, ThemePreference, UpdateProfileRequest, UserPreferences } from '@parla/types';
import { CHAT_FONT_FAMILIES, CHAT_FONT_SIZES } from '../const/chat-text.const';
import { create } from 'zustand';
import { deviceKeyMatches, lockVault, restoreVault, unlockVault } from '../utils/crypto-vault';
import { http, setUnauthorizedHandler, tokenStorage } from '../utils/http';
import { queryClient } from '../utils/query-client';
import { disconnectSocket } from '../utils/socket';

export type SessionStatus = 'booting' | 'anonymous' | 'ready';

export interface RegisterInput {
  /** Comprobante del teléfono verificado por SMS. */
  verificationToken: string;
  displayName: string;
  /** Opcional. */
  username: string;
  password: string;
}

interface SessionState {
  status: SessionStatus;
  user: SessionUser | null;
  /** Recién registrada: toca la bienvenida (foto, correo, contactos) antes de entrar. */
  onboarding: boolean;
  finishOnboarding: () => void;
  boot: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  /** «Continuar con Google»: con cuenta existente devuelve la sesión (falta la contraseña para abrir las claves); sin cuenta, el comprobante para registrarse. */
  googleSignIn: (idToken: string) => Promise<GoogleSignInResponse>;
  /** Abre las claves de cifrado con la contraseña y deja la sesión iniciada. */
  unlockSession: (response: AuthResponse, password: string) => Promise<void>;
  /** Abre la sesión con la clave que este dispositivo ya tiene (sin contraseña). `false` si no la tiene o ya no sirve. */
  unlockWithDevice: (response: AuthResponse) => Promise<boolean>;
  /** Contraseña nueva con el comprobante del correo: claves nuevas creadas en este dispositivo. */
  resetPassword: (verificationToken: string, password: string) => Promise<void>;
  /** La sesión cambió en el servidor (correo verificado, foto nueva…). */
  setUser: (user: SessionUser) => void;
  /** Llegó por tiempo real un cambio del propio perfil hecho desde otro dispositivo. */
  applyOwnProfile: (profile: PublicUser) => void;
  uploadAvatar: (photo: Blob) => Promise<void>;
  removeAvatar: () => Promise<void>;
  logout: () => void;
  updateProfile: (changes: UpdateProfileRequest) => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
}

const LAST_USER_KEY = 'parla.user';
const THEME_KEY = 'parla.theme';
/** Marca de «acaba de iniciar sesión»: se consume una vez para llevar a los dueños de tienda a su negocio. */
export const LANDING_KEY = 'parla.landing';

/** Aplica el tema al documento y lo recuerda para el próximo arranque (antes de pintar). */
export function applyTheme(theme: ThemePreference): void {
  localStorage.setItem(THEME_KEY, theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Tamaño y tipo de letra de los mensajes (variables CSS que usa `.chat-text`). */
export function applyChatText({ chatFontSize, chatFont }: Pick<UserPreferences, 'chatFontSize' | 'chatFont'>): void {
  const root = document.documentElement.style;
  root.setProperty('--chat-font-size', CHAT_FONT_SIZES[chatFontSize] ?? CHAT_FONT_SIZES.medium);
  root.setProperty('--chat-font', CHAT_FONT_FAMILIES[chatFont] ?? CHAT_FONT_FAMILIES.inter);
}

export const useSessionStore = create<SessionState>((set, get) => {
  const openSession = ({ token, user }: AuthResponse) => {
    tokenStorage.set(token);
    // Quien tiene tienda aterriza en «Mi negocio» al entrar (lo resuelve el layout principal cuando carga su negocio).
    sessionStorage.setItem(LANDING_KEY, '1');
    localStorage.setItem(LAST_USER_KEY, user.id);
    applyTheme(user.preferences.theme);
    applyChatText(user.preferences);
    set({ status: 'ready', user });
  };

  const startSession = async (auth: AuthResponse, password: string) => {
    // La clave privada se descifra en el navegador con la contraseña: el servidor nunca la ve.
    const privateKeyJwk = await decryptPrivateKey(auth.user.keyBackup, password);
    await unlockVault(auth.user.id, privateKeyJwk);
    openSession(auth);
  };

  /** Cierra la sesión. La clave de cifrado queda guardada en este dispositivo (salvo `forget`) para volver a entrar con Google sin contraseña. */
  const logout = (forget = false) => {
    lockVault(get().user?.id ?? localStorage.getItem(LAST_USER_KEY), forget);
    tokenStorage.clear();
    localStorage.removeItem(LAST_USER_KEY);
    disconnectSocket();
    // Nada de lo que vio esta persona queda en la caché para quien entre después.
    queryClient.clear();
    set({ status: 'anonymous', user: null, onboarding: false });
  };

  setUnauthorizedHandler(() => logout());

  return {
    status: 'booting',
    user: null,
    onboarding: false,
    finishOnboarding: () => set({ onboarding: false }),

    boot: async () => {
      const token = tokenStorage.get();
      const lastUser = localStorage.getItem(LAST_USER_KEY);
      if (!token || !lastUser || !(await restoreVault(lastUser))) {
        logout();
        return;
      }
      try {
        const user = await http.get<SessionUser>('/auth/me');
        applyTheme(user.preferences.theme);
        applyChatText(user.preferences);
        set({ status: 'ready', user });
      } catch {
        logout();
      }
    },

    login: async (identifier, password) => {
      const response = await http.post<AuthResponse>('/auth/login', { identifier, password });
      await startSession(response, password);
    },

    googleSignIn: (idToken) => http.post<GoogleSignInResponse>('/auth/google', { idToken }),

    unlockSession: startSession,

    unlockWithDevice: async (auth) => {
      if (!deviceKeyMatches(auth.user.id, auth.user.publicKey) || !(await restoreVault(auth.user.id))) return false;
      openSession(auth);
      return true;
    },

    register: async (input) => {
      const pair = await generateIdentityKeyPair();
      const keyBackup = await encryptPrivateKey(pair.privateKeyJwk, input.password);
      const response = await http.post<AuthResponse>('/auth/register', {
        verificationToken: input.verificationToken,
        username: input.username.trim() || undefined,
        displayName: input.displayName,
        password: input.password,
        publicKey: pair.publicKeyJwk,
        keyBackup,
        acceptTerms: true,
      });
      set({ onboarding: true });
      await startSession(response, input.password);
    },

    resetPassword: async (verificationToken, password) => {
      // La clave privada anterior estaba cifrada con la contraseña olvidada: se crean claves nuevas.
      const pair = await generateIdentityKeyPair();
      const keyBackup = await encryptPrivateKey(pair.privateKeyJwk, password);
      const response = await http.post<AuthResponse>('/auth/password/reset', {
        verificationToken,
        password,
        publicKey: pair.publicKeyJwk,
        keyBackup,
      });
      await startSession(response, password);
    },

    setUser: (user) => set({ user }),

    applyOwnProfile: (profile) => {
      const user = get().user;
      if (!user || user.id !== profile.id) return;
      set({ user: { ...user, displayName: profile.displayName, username: profile.username, about: profile.about, avatarColor: profile.avatarColor, avatarUrl: profile.avatarUrl } });
    },

    uploadAvatar: async (photo) => {
      const form = new FormData();
      form.append('file', photo, 'foto.jpg');
      set({ user: await http.upload<SessionUser>('/auth/me/avatar', form) });
    },

    removeAvatar: async () => {
      set({ user: await http.delete<SessionUser>('/auth/me/avatar') });
    },

    logout: () => logout(),

    deleteAccount: async (password) => {
      await http.delete('/auth/me', { password });
      logout(true);
    },

    updateProfile: async (changes) => {
      const user = await http.patch<SessionUser>('/auth/me', changes);
      if (changes.preferences?.theme) applyTheme(user.preferences.theme);
      applyChatText(user.preferences);
      set({ user });
    },
  };
});
