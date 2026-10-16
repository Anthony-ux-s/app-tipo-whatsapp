import { useEffect, useRef, useState } from 'react';
import type { RecorderState } from '../types/chats.types';

const MIME_CANDIDATES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];

/** Graba notas de voz con MediaRecorder. Al terminar entrega el audio para cifrarlo y enviarlo. */
export function useVoiceRecorder(onRecorded: (blob: Blob, mimeType: string, durationMs: number) => Promise<void>) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const timer = useRef<number | null>(null);

  const stopTracks = () => recorder.current?.stream.getTracks().forEach((t) => t.stop());
  const clearTimer = () => {
    if (timer.current) window.clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(
    () => () => {
      cancelled.current = true;
      clearTimer();
      if (recorder.current?.state === 'recording') recorder.current.stop();
      stopTracks();
    },
    [],
  );

  const start = async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Tu navegador no permite grabar audio');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MIME_CANDIDATES.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunks.current = [];
      cancelled.current = false;
      rec.ondataavailable = (event) => event.data.size > 0 && chunks.current.push(event.data);
      rec.onstop = async () => {
        stopTracks();
        clearTimer();
        const duration = Date.now() - startedAt.current;
        if (cancelled.current || duration < 500) {
          setState('idle');
          return;
        }
        setState('sending');
        const type = (rec.mimeType || 'audio/webm').split(';')[0];
        try {
          await onRecorded(new Blob(chunks.current, { type }), type, duration);
        } finally {
          setState('idle');
        }
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      setElapsed(0);
      rec.start(250);
      setState('recording');
      timer.current = window.setInterval(() => setElapsed(Date.now() - startedAt.current), 200);
    } catch {
      setError('Necesitamos permiso para usar el micrófono');
    }
  };

  return {
    state,
    elapsed,
    error,
    start,
    stop: () => recorder.current?.state === 'recording' && recorder.current.stop(),
    cancel: () => {
      cancelled.current = true;
      if (recorder.current?.state === 'recording') recorder.current.stop();
    },
    clearError: () => setError(null),
  };
}
