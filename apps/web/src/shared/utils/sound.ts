let context: AudioContext | null = null;

/** Sonido corto de mensaje nuevo, generado con WebAudio (sin archivos). */
export function playMessageSound(): void {
  try {
    context ??= new AudioContext();
    const now = context.currentTime;
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    for (const [freq, start] of [
      [880, 0],
      [1320, 0.09],
    ] as const) {
      const osc = context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(now + start);
      osc.stop(now + start + 0.25);
    }
  } catch {
    // Sin audio disponible: no pasa nada.
  }
}
