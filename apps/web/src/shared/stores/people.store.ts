import type { PresencePayload, PublicUser } from '@parla/types';
import { create } from 'zustand';
import { http } from '../utils/http';

interface PeopleState {
  /** Personas vistas en el directorio, por id (para recordar a quién se eligió). */
  known: Record<string, PublicUser>;
  search: (query: string) => Promise<PublicUser[]>;
  applyPresence: (payload: PresencePayload) => void;
  reset: () => void;
}

/** Directorio de Parla: como en WhatsApp, se le puede escribir a cualquier persona registrada. */
export const usePeopleStore = create<PeopleState>((set, get) => ({
  known: {},

  search: async (query) => {
    const people = await http.get<PublicUser[]>(`/people?q=${encodeURIComponent(query.trim())}`);
    set({ known: { ...get().known, ...Object.fromEntries(people.map((p) => [p.id, p])) } });
    return people;
  },

  applyPresence: ({ userId, presence, lastSeenAt }) => {
    const person = get().known[userId];
    if (!person) return;
    set({ known: { ...get().known, [userId]: { ...person, presence, lastSeenAt: lastSeenAt ?? person.lastSeenAt } } });
  },

  reset: () => set({ known: {} }),
}));
