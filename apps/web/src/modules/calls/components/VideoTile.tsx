import { MicOff } from 'lucide-react';
import { Avatar } from '@shared/ui/Avatar';
import { useMediaStream } from '../hooks/use-media-stream.hook';

interface VideoTileProps {
  stream: MediaStream | null;
  name: string;
  color: string;
  showVideo: boolean;
  muted?: boolean;
  /** Mi propia imagen: espejada y sin sonido (para no oírme). */
  self?: boolean;
  className?: string;
}

/** Recuadro de una persona en la llamada: su video, o su avatar si es solo voz o apagó la cámara. */
export function VideoTile({ stream, name, color, showVideo, muted = false, self = false, className = '' }: VideoTileProps) {
  const videoRef = useMediaStream<HTMLVideoElement>(stream);
  const audioRef = useMediaStream<HTMLAudioElement>(self ? null : stream);
  return (
    <div className={`relative flex items-center justify-center overflow-hidden rounded-2xl bg-teal-950/80 ${className}`} data-testid={self ? 'local-tile' : 'remote-tile'}>
      {showVideo ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`size-full object-cover ${self ? '-scale-x-100' : ''}`}
          data-testid={self ? 'local-video' : 'remote-video'}
        />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <span className="relative">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/20" />
            <Avatar name={name} color={color} size="xl" />
          </span>
        </div>
      )}
      {!self && <audio ref={audioRef} autoPlay data-testid="remote-audio" />}
      <span className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
        {muted && <MicOff className="size-3.5" />}
        {self ? 'Tú' : name}
      </span>
    </div>
  );
}
