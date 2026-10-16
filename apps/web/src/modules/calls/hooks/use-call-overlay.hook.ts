import { useEffect, useState } from 'react';
import { useCallStore } from '@shared/stores/call.store';
import { toast } from '@shared/stores/toast.store';
import { callStatusLabel, gridClass } from '../utils/call-format.utils';
import { useRingtone } from './use-ringtone.hook';

/** Estado de la llamada para la pantalla: participantes con su video, temporizador y controles. */
export function useCallOverlay() {
  const state = useCallStore();
  const [now, setNow] = useState(Date.now());
  useRingtone(state.phase);

  useEffect(() => {
    if (state.phase !== 'active') return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.phase]);

  useEffect(() => {
    if (!state.error) return;
    toast(state.error, 'error');
    state.dismissError();
  }, [state.error, state.dismissError]);

  const remoteIds = Object.keys(state.remotes);
  const tiles = remoteIds.map((userId) => ({
    userId,
    stream: state.remotes[userId],
    name: state.people[userId]?.name ?? 'Participante',
    color: state.people[userId]?.color ?? 'teal',
  }));
  const caller = state.call ? state.people[state.call.startedBy] : undefined;

  return {
    phase: state.phase,
    call: state.call,
    tiles,
    gridClass: gridClass(tiles.length),
    local: state.local,
    isVideo: state.call?.kind === 'video',
    muted: state.muted,
    cameraOff: state.cameraOff,
    callerName: caller?.name ?? state.call?.title ?? '',
    status: state.call
      ? callStatusLabel(state.phase, state.call.kind, state.startedAt ? now - state.startedAt : 0, state.endReason)
      : '',
    accept: state.accept,
    decline: state.decline,
    hangUp: state.hangUp,
    toggleMute: state.toggleMute,
    toggleCamera: state.toggleCamera,
  };
}
