import { useEffect, useRef, useState, type MouseEvent } from 'react';

/** Reproductor de notas de voz: play/pausa, progreso y salto en la barra. */
export function useAudioPlayer(src: string | null, knownDurationMs?: number) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState((knownDurationMs ?? 0) / 1000);

  useEffect(() => {
    if (!src) return;
    const el = new Audio(src);
    audio.current = el;
    const onTime = () => {
      const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : (knownDurationMs ?? 0) / 1000;
      setCurrent(el.currentTime);
      setProgress(total ? el.currentTime / total : 0);
    };
    const onMeta = () => Number.isFinite(el.duration) && el.duration > 0 && setDuration(el.duration);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
      setCurrent(0);
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnd);
    return () => {
      el.pause();
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnd);
      audio.current = null;
    };
  }, [src, knownDurationMs]);

  return {
    playing,
    progress,
    currentMs: current * 1000,
    durationMs: duration * 1000,
    toggle: () => {
      const el = audio.current;
      if (!el) return;
      if (el.paused) {
        void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
      } else {
        el.pause();
        setPlaying(false);
      }
    },
    /** Salta al punto de la barra donde se hizo clic. */
    seekFromClick: (event: MouseEvent<HTMLElement>) => {
      const el = audio.current;
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
      const total = el && Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
      if (el && total) el.currentTime = ratio * total;
    },
  };
}
