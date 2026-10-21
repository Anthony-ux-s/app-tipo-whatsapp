import { create } from 'zustand';

export type NewChatMode = 'direct' | 'group' | 'contacts';

interface MenuState {
  /** Menú lateral de las tres líneas. */
  menuOpen: boolean;
  /** Ventana de «Nuevo chat» abierta (y en qué pestaña); se abre desde el botón flotante o el menú. */
  newChat: NewChatMode | null;
  openMenu: () => void;
  closeMenu: () => void;
  openNewChat: (mode?: NewChatMode) => void;
  closeNewChat: () => void;
}

export const useMenuStore = create<MenuState>((set) => ({
  menuOpen: false,
  newChat: null,
  openMenu: () => set({ menuOpen: true }),
  closeMenu: () => set({ menuOpen: false }),
  openNewChat: (mode = 'direct') => set({ newChat: mode, menuOpen: false }),
  closeNewChat: () => set({ newChat: null }),
}));
