import { Lock, Mic, MicOff, Phone, PhoneOff, Video, VideoOff } from 'lucide-react';
import type { ReactNode } from 'react';
import { Avatar } from '@shared/ui/Avatar';
import { useCallOverlay } from '../hooks/use-call-overlay.hook';
import { VideoTile } from './VideoTile';

function RoundButton({ label, onClick, children, tone = 'glass', testId }: { label: string; onClick: () => void; children: ReactNode; tone?: 'glass' | 'on' | 'hang' | 'accept'; testId?: string }) {
  const tones = {
    glass: 'bg-white/15 text-white hover:bg-white/25',
    on: 'bg-white text-teal-900 hover:bg-teal-50',
    hang: 'bg-teal-950 text-white ring-2 ring-white/30 hover:bg-black',
    accept: 'bg-emerald-500 text-white hover:bg-emerald-600',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={`flex size-14 items-center justify-center rounded-full shadow-pop transition-all duration-200 active:scale-95 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

/** Capa global de llamadas: llamada entrante y pantalla de llamada (voz o video). */
export function CallOverlay() {
  const call = useCallOverlay();
  if (call.phase === 'idle' || !call.call) return null;

  if (call.phase === 'incoming') {
    return (
      <div className="fixed inset-x-0 top-0 z-[70] flex justify-center p-3 sm:p-4" role="alertdialog" aria-label="Llamada entrante">
        <div className="flex w-full max-w-md animate-rise items-center gap-4 rounded-3xl bg-gradient-to-br from-teal-800 to-cyan-900 p-4 text-white shadow-pop ring-1 ring-white/10">
          <span className="relative shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-300/40" />
            <Avatar name={call.call.title} color={call.call.avatarColor} photo={call.call.avatarUrl} group={call.call.isGroup} size="lg" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold" data-testid="incoming-title">
              {call.call.isGroup ? call.call.title : call.callerName}
            </p>
            <p className="truncate text-sm text-teal-100">
              {call.call.isGroup ? `${call.callerName} · ${call.status}` : call.status}
            </p>
          </div>
          <RoundButton label="Rechazar" onClick={call.decline} tone="hang" testId="decline-call">
            <PhoneOff className="size-6" />
          </RoundButton>
          <RoundButton label="Contestar" onClick={call.accept} tone="accept" testId="accept-call">
            {call.isVideo ? <Video className="size-6" /> : <Phone className="size-6" />}
          </RoundButton>
        </div>
      </div>
    );
  }

  const connected = call.phase === 'active' && call.tiles.length > 0;
  return (
    <div className="fixed inset-0 z-[70] flex animate-fade-in flex-col bg-gradient-to-br from-teal-950 via-teal-900 to-cyan-950 text-white" role="dialog" aria-label="Llamada en curso" data-testid="call-screen" data-phase={call.phase}>
      <header className="safe-bottom flex flex-col items-center gap-1 px-4 pt-6 pb-3 text-center">
        <p className="flex items-center gap-1.5 text-xs text-teal-200">
          <Lock className="size-3" /> Cifrada de extremo a extremo
        </p>
        <h2 className="font-display text-xl font-bold md:text-2xl">{call.call.title}</h2>
        <p className="text-sm text-teal-100 tabular-nums" data-testid="call-status">
          {call.status}
        </p>
      </header>

      <main className="relative flex min-h-0 flex-1 items-center justify-center p-3 md:p-6">
        {connected ? (
          <div className={`grid size-full max-w-6xl gap-3 ${call.gridClass}`}>
            {call.tiles.map((tile) => (
              <VideoTile key={tile.userId} stream={tile.stream} name={tile.name} color={tile.color} photo={tile.photo} showVideo={call.isVideo && tile.stream.getVideoTracks().length > 0} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-5">
            <span className="relative">
              {call.phase !== 'ended' && <span className="absolute -inset-4 animate-ping rounded-full bg-emerald-400/15" />}
              <Avatar name={call.call.title} color={call.call.avatarColor} photo={call.call.avatarUrl} group={call.call.isGroup} size="xl" />
            </span>
          </div>
        )}

        {call.isVideo && call.local && call.phase !== 'ended' && (
          <VideoTile
            self
            stream={call.local}
            name="Tú"
            color="teal"
            showVideo={!call.cameraOff}
            muted={call.muted}
            className={`absolute right-4 bottom-4 aspect-[3/4] w-28 shadow-pop ring-2 ring-white/20 sm:w-40 md:w-48 ${connected ? '' : 'sm:w-56'}`}
          />
        )}
      </main>

      {call.phase !== 'ended' && (
        <footer className="safe-bottom flex items-center justify-center gap-4 px-4 pt-3 pb-8">
          <RoundButton label={call.muted ? 'Activar micrófono' : 'Silenciar micrófono'} onClick={call.toggleMute} tone={call.muted ? 'on' : 'glass'} testId="toggle-mute">
            {call.muted ? <MicOff className="size-6" /> : <Mic className="size-6" />}
          </RoundButton>
          {call.isVideo && (
            <RoundButton label={call.cameraOff ? 'Encender cámara' : 'Apagar cámara'} onClick={call.toggleCamera} tone={call.cameraOff ? 'on' : 'glass'} testId="toggle-camera">
              {call.cameraOff ? <VideoOff className="size-6" /> : <Video className="size-6" />}
            </RoundButton>
          )}
          <RoundButton label="Colgar" onClick={call.hangUp} tone="hang" testId="hang-up">
            <PhoneOff className="size-6" />
          </RoundButton>
        </footer>
      )}
    </div>
  );
}
