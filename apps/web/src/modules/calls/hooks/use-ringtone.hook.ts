import { useEffect } from 'react';
import type { CallPhase } from '@shared/stores/call.store';

/** Timbre generado con WebAudio: llamada entrante (dos notas) o tono de espera al llamar. */
export function useRingtone(phase: CallPhase) {
  useEffect(() => {
    if (phase !== 'incoming' && phase !== 'outgoing') return;
    let context: AudioContext | null = null;
    try {
      context = new AudioContext();
    } catch {
      return;
    }
    const ctx = context;
    const notes = phase === 'incoming' ? [660, 880] : [440];
    const ring = () => {
      const now = ctx.currentTime;
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(phase === 'incoming' ? 0.12 : 0.05, now + i * 0.22 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + (phase === 'incoming' ? 0.35 : 1.2));
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + i * 0.22);
        osc.stop(now + i * 0.22 + 1.3);
      });
    };
    ring();
    const timer = window.setInterval(ring, phase === 'incoming' ? 1600 : 3000);
    return () => {
      window.clearInterval(timer);
      void ctx.close().catch(() => undefined);
    };
  }, [phase]);
}
