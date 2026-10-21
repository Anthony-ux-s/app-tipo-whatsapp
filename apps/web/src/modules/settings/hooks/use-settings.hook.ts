import type { ChatFont, ChatFontSize, ThemePreference, UserPreferences } from '@parla/types';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { AVATAR_COLOR_OPTIONS } from '@shared/const/avatar.const';
import { keyFingerprint } from '@shared/utils/fingerprint';
import { errorMessage } from '@shared/utils/http';
import { validateUsername } from '@shared/utils/validators';
import { isSettingsSection, SETTINGS_SECTIONS, THEME_OPTIONS, type SettingsSectionId } from '../const/settings.const';

/** Pantalla principal de Ajustes: resumen del perfil y cierre de sesión con confirmación. */
export function useSettingsHome() {
  const user = useSessionStore((s) => s.user)!;
  const logout = useSessionStore((s) => s.logout);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const themeLabel = THEME_OPTIONS.find((t) => t.id === user.preferences.theme)?.label ?? 'Sistema';

  return {
    user,
    handle: user.username ? `@${user.username}` : user.phone,
    summaries: { apariencia: `Tema: ${themeLabel}` } as Partial<Record<SettingsSectionId, string>>,
    confirmLogout,
    askLogout: () => setConfirmLogout(true),
    cancelLogout: () => setConfirmLogout(false),
    logout,
  };
}

/** La sección abierta según la URL (`ajustes/:section`); null si no existe. */
export function useSettingsSection() {
  const { section } = useParams();
  return isSettingsSection(section) ? SETTINGS_SECTIONS[section] : null;
}

/** Perfil: nombre, info. y color del avatar. */
export function useProfileSettings() {
  const user = useSessionStore((s) => s.user)!;
  const updateProfile = useSessionStore((s) => s.updateProfile);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [about, setAbout] = useState(user.about);
  const [username, setUsername] = useState(user.username ?? '');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const usernameChanged = username.trim() !== (user.username ?? '');
  const dirty = displayName.trim() !== user.displayName || about.trim() !== user.about || usernameChanged;

  return {
    user,
    displayName,
    about,
    username,
    usernameError,
    saving,
    dirty,
    valid: displayName.trim().length > 0,
    colors: AVATAR_COLOR_OPTIONS,
    memberSince: new Date(user.createdAt).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }),
    onDisplayNameChange: (value: string) => setDisplayName(value),
    onAboutChange: (value: string) => setAbout(value),
    onUsernameChange: (value: string) => {
      setUsername(value.toLowerCase().replace(/\s/g, ''));
      setUsernameError(null);
    },
    discard: () => {
      setDisplayName(user.displayName);
      setAbout(user.about);
      setUsername(user.username ?? '');
      setUsernameError(null);
    },
    save: async () => {
      // El usuario es opcional: vacío lo quita.
      const invalid = username.trim() ? validateUsername(username) : null;
      if (invalid) {
        setUsernameError(invalid);
        return;
      }
      setSaving(true);
      try {
        await updateProfile({ displayName: displayName.trim(), about: about.trim(), ...(usernameChanged ? { username: username.trim() } : {}) });
        toast('Perfil actualizado', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setSaving(false);
      }
    },
    pickColor: (avatarColor: string) => updateProfile({ avatarColor }).catch((err) => toast(errorMessage(err), 'error')),
  };
}

/** Preferencias de la interfaz: tema, Enter para enviar, sonido y letra de los chats. Se guardan en la cuenta. */
export function usePreferences() {
  const preferences = useSessionStore((s) => s.user)!.preferences;
  const updateProfile = useSessionStore((s) => s.updateProfile);

  const save = async (changes: Partial<UserPreferences>) => {
    try {
      await updateProfile({ preferences: changes });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return {
    preferences,
    setTheme: (theme: ThemePreference) => save({ theme }),
    setEnterToSend: (enterToSend: boolean) => save({ enterToSend }),
    setSound: (notificationSound: boolean) => save({ notificationSound }),
    setEffects: (chatEffects: boolean) => save({ chatEffects }),
    setChatFontSize: (chatFontSize: ChatFontSize) => save({ chatFontSize }),
    setChatFont: (chatFont: ChatFont) => save({ chatFont }),
  };
}

/** Huella de seguridad de la clave pública propia, para compararla en persona. */
export function useFingerprint() {
  const publicKey = useSessionStore((s) => s.user)!.publicKey;
  const [fingerprint, setFingerprint] = useState<string[] | null>(null);

  useEffect(() => {
    void keyFingerprint(publicKey).then(setFingerprint);
  }, [publicKey]);

  return fingerprint;
}
