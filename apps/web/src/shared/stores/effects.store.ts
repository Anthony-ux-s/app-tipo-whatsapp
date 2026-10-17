import { create } from 'zustand';
import type { ChatEffect } from '../const/stickers.const';
import { useSessionStore } from './session.store';

interface EffectsState {
  /** Efecto que se está mostrando; `key` cambia en cada disparo para reiniciar la animación. */
  current: { effect: ChatEffect; key: number } | null;
  play: (effect: ChatEffect | null) => void;
  clear: () => void;
}

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export const useEffectsStore = create<EffectsState>((set) => ({
  current: null,
  play: (effect) => {
    if (!effect || reducedMotion()) return;
    if (useSessionStore.getState().user?.preferences.chatEffects === false) return;
    set({ current: { effect, key: Date.now() } });
  },
  clear: () => set({ current: null }),
}));
