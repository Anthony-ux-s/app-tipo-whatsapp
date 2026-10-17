import { Camera, ImageOff, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorMessage, http } from '../utils/http';
import { uploadPhoto } from '../utils/photos';
import { Spinner } from './Spinner';

/**
 * Una foto privada de la API (documento, entrega o reclamo): se pide con la sesión y se muestra con
 * un blob URL, porque un <img src> no manda el token.
 */
export function PrivatePhoto({ path, alt, className = '' }: { path: string; alt: string; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    http
      .binary(path)
      .then((data) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([data], { type: 'image/jpeg' }));
        setUrl(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (failed) {
    return (
      <span className={`flex items-center justify-center gap-2 rounded-2xl bg-surface-3 p-6 text-sm text-ink-soft ${className}`}>
        <ImageOff className="size-4" /> No pudimos cargar la foto
      </span>
    );
  }
  if (!url) {
    return (
      <span className={`flex items-center justify-center rounded-2xl bg-surface-3 p-6 ${className}`}>
        <Spinner />
      </span>
    );
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className={`block overflow-hidden rounded-2xl bg-surface-3 ${className}`}>
      <img src={url} alt={alt} className="max-h-80 w-full object-contain" data-testid="private-photo" />
    </a>
  );
}

/**
 * Tomar o elegir una foto y subirla enseguida. Avisa el id cuando terminó de subir (null si se quita).
 */
export function PhotoPicker({
  label,
  hint,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  onChange: (photoId: string | null) => void;
  testId?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setUploading(true);
    onChange(null);
    try {
      const photoId = await uploadPhoto(file);
      setPreview(URL.createObjectURL(file));
      onChange(photoId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUploading(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={label}
        data-testid={testId}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {preview ? (
        <div className="relative overflow-hidden rounded-2xl bg-surface-3">
          <img src={preview} alt="Foto elegida" className="max-h-56 w-full object-contain" />
          <div className="absolute right-2 top-2 flex gap-1.5">
            <button type="button" onClick={() => input.current?.click()} aria-label="Cambiar foto" className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70">
              <RefreshCw className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                onChange(null);
              }}
              aria-label="Quitar foto"
              className="flex size-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={uploading}
          className="flex h-24 items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line text-sm font-semibold text-ink-soft transition-colors duration-200 hover:border-teal-500 hover:text-ink disabled:opacity-60"
        >
          {uploading ? <Spinner /> : <Camera className="size-5" />}
          {uploading ? 'Subiendo…' : 'Tomar o elegir foto'}
        </button>
      )}
      {error ? <p role="alert" className="text-sm font-semibold text-rose-700 dark:text-rose-400">{error}</p> : hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
    </div>
  );
}
