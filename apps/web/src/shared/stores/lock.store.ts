import { create } from 'zustand';
import { checkCode, getLock, type CheckResult } from '../utils/app-lock';

interface LockState {
  /** La pantalla de bloqueo está puesta: hay que poner el código para ver la app. */
  locked: boolean;
  /** Bloquea ahora (si esta persona tiene un bloqueo activado). */
  lockNow: (userId: string) => void;
  /** Pone el código; si acierta, la pantalla se quita. */
  unlock: (userId: string, code: string) => Promise<CheckResult>;
  /** Quita la pantalla sin pedir código (al cerrar sesión o desactivar el bloqueo). */
  release: () => void;
}

export const useLockStore = create<LockState>((set) => ({
  locked: false,
  lockNow: (userId) => {
    if (getLock(userId)) set({ locked: true });
  },
  unlock: async (userId, code) => {
    const result = await checkCode(userId, code);
    if (result.ok) set({ locked: false });
    return result;
  },
  release: () => set({ locked: false }),
}));
