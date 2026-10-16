import type { ThemePreference, UserPreferences } from '@parla/types';
import { useEffect, useState } from 'react';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { keyFingerprint } from '@shared/utils/fingerprint';
import { errorMessage } from '@shared/utils/http';
import { AVATAR_COLOR_OPTIONS } from '@shared/const/avatar.const';

/** Perfil, preferencias de la interfaz y seguridad de la cuenta. */
export function useSettings() {
  const user = useSessionStore((s) => s.user)!;
  const updateProfile = useSessionStore((s) => s.updateProfile);
  const logout = useSessionStore((s) => s.logout);
  const [displayName, setDisplayName] = useState(user.displayName);
  const [about, setAbout] = useState(user.about);
  const [saving, setSaving] = useState(false);
  const [fingerprint, setFingerprint] = useState<string[] | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  useEffect(() => {
    void keyFingerprint(user.publicKey).then(setFingerprint);
  }, [user.publicKey]);

  const dirty = displayName.trim() !== user.displayName || about.trim() !== user.about;

  const savePreference = async (changes: Partial<UserPreferences>) => {
    try {
      await updateProfile({ preferences: changes });
    } catch (err) {
      toast(errorMessage(err), 'error');
    }
  };

  return {
    user,
    displayName,
    about,
    saving,
    dirty,
    fingerprint,
    confirmLogout,
    colors: AVATAR_COLOR_OPTIONS,
    onDisplayNameChange: (value: string) => setDisplayName(value),
    onAboutChange: (value: string) => setAbout(value),
    saveProfile: async () => {
      setSaving(true);
      try {
        await updateProfile({ displayName: displayName.trim(), about: about.trim() });
        toast('Perfil actualizado', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setSaving(false);
      }
    },
    pickColor: (avatarColor: string) => updateProfile({ avatarColor }).catch((err) => toast(errorMessage(err), 'error')),
    setTheme: (theme: ThemePreference) => savePreference({ theme }),
    setEnterToSend: (enterToSend: boolean) => savePreference({ enterToSend }),
    setSound: (notificationSound: boolean) => savePreference({ notificationSound }),
    askLogout: () => setConfirmLogout(true),
    cancelLogout: () => setConfirmLogout(false),
    logout,
  };
}
