import { decryptPrivateKey, encryptPrivateKey, generateIdentityKeyPair } from '@parla/crypto';
import type { AuthResponse, PublicUser, SessionUser, ThemePreference, UpdateProfileRequest } from '@parla/types';
import { create } from 'zustand';
import { lockVault, restoreVault, unlockVault } from '../utils/crypto-vault';
import { http, setUnauthorizedHandler, tokenStorage } from '../utils/http';
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

/** Aplica el tema al documento y lo recuerda para el próximo arranque (antes de pintar). */
export function applyTheme(theme: ThemePreference): void {
  localStorage.setItem(THEME_KEY, theme);
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export const useSessionStore = create<SessionState>((set, get) => {
  const startSession = async ({ token, user }: AuthResponse, password: string) => {
    // La clave privada se descifra en el navegador con la contraseña: el servidor nunca la ve.
    const privateKeyJwk = await decryptPrivateKey(user.keyBackup, password);
    await unlockVault(user.id, privateKeyJwk);
    tokenStorage.set(token);
    localStorage.setItem(LAST_USER_KEY, user.id);
    applyTheme(user.preferences.theme);
    set({ status: 'ready', user });
  };

  const logout = () => {
    lockVault(get().user?.id ?? localStorage.getItem(LAST_USER_KEY));
    tokenStorage.clear();
    localStorage.removeItem(LAST_USER_KEY);
    disconnectSocket();
    set({ status: 'anonymous', user: null, onboarding: false });
  };

  setUnauthorizedHandler(logout);

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
        set({ status: 'ready', user });
      } catch {
        logout();
      }
    },

    login: async (identifier, password) => {
      const response = await http.post<AuthResponse>('/auth/login', { identifier, password });
      await startSession(response, password);
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

    logout,

    deleteAccount: async (password) => {
      await http.delete('/auth/me', { password });
      logout();
    },

    updateProfile: async (changes) => {
      const user = await http.patch<SessionUser>('/auth/me', changes);
      if (changes.preferences?.theme) applyTheme(user.preferences.theme);
      set({ user });
    },
  };
});
