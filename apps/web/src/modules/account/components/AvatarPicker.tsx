import { Camera, Trash2 } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { Spinner } from '@shared/ui/Spinner';
import { useAvatarPicker } from '../hooks/use-avatar-picker.hook';

/** Foto de perfil grande con botón de cámara para cambiarla. */
export function AvatarPicker({ name }: { name?: string }) {
  const a = useAvatarPicker();
  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        onClick={a.choose}
        disabled={a.busy}
        aria-label={a.user.avatarUrl ? 'Cambiar foto de perfil' : 'Poner foto de perfil'}
        className="group relative rounded-full focus-visible:ring-2 focus-visible:ring-teal-500"
      >
        <Avatar name={name || a.user.displayName} color={a.user.avatarColor} photo={a.user.avatarUrl} size="xl" />
        <span className="absolute right-0 bottom-0 flex size-9 items-center justify-center rounded-full bg-brand text-white shadow-pop ring-4 ring-surface transition-transform duration-200 group-hover:scale-105">
          {a.busy ? <Spinner className="size-4" /> : <Camera className="size-4" />}
        </span>
      </button>
      <input
        ref={a.inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        data-testid="avatar-input"
        onChange={(e) => void a.onFile(e.target.files?.[0])}
      />
      {a.user.avatarUrl && (
        <button type="button" onClick={() => void a.remove()} disabled={a.busy} className="inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-ink">
          <Trash2 className="size-3.5" /> Quitar foto
        </button>
      )}
    </div>
  );
}
