import type { ConversationSummary, MediaAttachment } from '@parla/types';
import { ImageOff, Pause, Play, RefreshCw } from 'lucide-react';
import { Spinner } from '@shared/ui/Spinner';
import { formatDuration } from '@shared/utils/date';
import { useAudioPlayer } from '../hooks/use-audio-player.hook';
import { useDecryptedMedia } from '../hooks/use-decrypted-media.hook';

interface MediaContentProps {
  conversation: Pick<ConversationSummary, 'id' | 'myKey'>;
  kind: 'image' | 'audio' | 'video';
  media: MediaAttachment;
  localPreviewUrl?: string;
  outgoing: boolean;
  onOpenImage: (url: string) => void;
}

export function MediaContent({ conversation, kind, media, localPreviewUrl, outgoing, onOpenImage }: MediaContentProps) {
  const file = useDecryptedMedia(conversation, media, localPreviewUrl);
  if (kind === 'audio') return <VoiceNote url={file.url} durationMs={media.durationMs} outgoing={outgoing} failed={file.status === 'error'} onRetry={file.retry} />;

  if (file.status === 'error') {
    return (
      <button type="button" onClick={file.retry} className="flex h-40 w-64 max-w-full flex-col items-center justify-center gap-2 rounded-xl bg-black/5 text-sm text-ink-soft dark:bg-white/5">
        <ImageOff className="size-6" />
        No se pudo descifrar el archivo
        <span className="flex items-center gap-1 font-semibold text-brand dark:text-teal-300">
          <RefreshCw className="size-3.5" /> Reintentar
        </span>
      </button>
    );
  }
  if (file.status === 'loading' || !file.url) {
    return (
      <div className="flex h-48 w-64 max-w-full items-center justify-center rounded-xl skeleton" aria-label="Descifrando archivo">
        <Spinner className="size-6 text-brand" />
      </div>
    );
  }
  const url = file.url;
  if (kind === 'video') {
    return <video src={url} controls playsInline preload="metadata" className="max-h-80 w-72 max-w-full rounded-xl bg-black" />;
  }
  return (
    <button type="button" onClick={() => onOpenImage(url)} className="block overflow-hidden rounded-xl" aria-label="Ver imagen">
      <img src={url} alt="Imagen enviada" className="max-h-80 w-72 max-w-full object-cover transition-transform duration-200 hover:scale-[1.02]" />
    </button>
  );
}

interface VoiceNoteProps {
  url: string | null;
  durationMs?: number;
  outgoing: boolean;
  failed: boolean;
  onRetry: () => void;
}

const BARS = [6, 10, 14, 9, 16, 12, 7, 13, 18, 11, 8, 15, 10, 6, 12, 17, 9, 13, 7, 11, 15, 8, 12, 6, 10, 14, 9, 7];

function VoiceNote({ url, durationMs, outgoing, failed, onRetry }: VoiceNoteProps) {
  const player = useAudioPlayer(url, durationMs);
  const played = Math.round(player.progress * BARS.length);
  return (
    <div className="flex w-64 max-w-full items-center gap-3 py-1" data-testid="voice-note">
      <button
        type="button"
        onClick={failed ? onRetry : player.toggle}
        disabled={!url && !failed}
        aria-label={player.playing ? 'Pausar nota de voz' : 'Reproducir nota de voz'}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full text-white transition-transform duration-200 active:scale-95 ${outgoing ? 'bg-emerald-600' : 'bg-brand'}`}
      >
        {failed ? <RefreshCw className="size-4" /> : !url ? <Spinner className="size-4" /> : player.playing ? <Pause className="size-4" fill="currentColor" /> : <Play className="ml-0.5 size-4" fill="currentColor" />}
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <button
          type="button"
          className="flex h-6 items-center gap-[3px]"
          aria-label="Avanzar en la nota de voz"
          onClick={player.seekFromClick}
        >
          {BARS.map((h, i) => (
            <span
              key={i}
              style={{ height: `${h}px` }}
              className={`w-[3px] shrink-0 rounded-full transition-colors duration-150 ${i < played ? (outgoing ? 'bg-emerald-700 dark:bg-emerald-300' : 'bg-teal-600 dark:bg-teal-300') : 'bg-ink-faint/40'}`}
            />
          ))}
        </button>
        <span className="text-[11px] text-ink-soft">
          {failed ? 'No se pudo descifrar' : formatDuration(player.playing || player.currentMs > 0 ? player.currentMs : player.durationMs || (durationMs ?? 0))}
        </span>
      </div>
    </div>
  );
}
