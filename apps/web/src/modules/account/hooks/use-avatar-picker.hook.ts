import { useRef, useState } from 'react';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';
import { toAvatarJpeg } from '@shared/utils/image';

/** Elegir, recortar (cuadrada, sin datos de ubicación) y subir la foto de perfil. */
export function useAvatarPicker() {
  const user = useSessionStore((s) => s.user)!;
  const uploadAvatar = useSessionStore((s) => s.uploadAvatar);
  const removeAvatar = useSessionStore((s) => s.removeAvatar);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  return {
    user,
    busy,
    inputRef,
    choose: () => inputRef.current?.click(),
    onFile: async (file: File | undefined) => {
      if (inputRef.current) inputRef.current.value = '';
      if (!file) return;
      setBusy(true);
      try {
        await uploadAvatar(await toAvatarJpeg(file));
        toast('Foto de perfil actualizada', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
    remove: async () => {
      setBusy(true);
      try {
        await removeAvatar();
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
  };
}
