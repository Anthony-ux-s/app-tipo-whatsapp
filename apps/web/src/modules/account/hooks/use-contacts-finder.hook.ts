import type { ContactMatch, PublicUser } from '@parla/types';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

interface PickedContact {
  name?: string[];
  tel?: string[];
}

interface ContactsManager {
  select(properties: ('name' | 'tel')[], options: { multiple: boolean }): Promise<PickedContact[]>;
}

/** Contact Picker API: Chrome en Android. El usuario elige qué contactos compartir (puede elegir todos). */
function contactsApi(): ContactsManager | null {
  const nav = navigator as Navigator & { contacts?: ContactsManager };
  return 'ContactsManager' in window && nav.contacts ? nav.contacts : null;
}

/** Un contacto de la libreta que todavía no está en Parla. */
export interface OtherContact {
  name: string | null;
  phone: string;
}

/** Los últimos 8 dígitos identifican el número aunque venga con o sin indicativo. */
const tail = (phone: string) => phone.replace(/D/g, '').slice(-8);

export interface FoundContact extends ContactMatch {
  /** Nombre con el que está guardado en la libreta (si lo hay). */
  contactName: string | null;
}

/**
 * «Jalar» los contactos del teléfono: se leen en el navegador, solo los números viajan al servidor
 * para saber quiénes ya usan Parla, y no se guardan.
 */
export function useContactsFinder(onOpenChat?: () => void) {
  const navigate = useNavigate();
  const me = useSessionStore((s) => s.user)!;
  const startDirect = useChatStore((s) => s.startDirect);
  const [found, setFound] = useState<FoundContact[] | null>(null);
  const [checked, setChecked] = useState(0);
  const [entries, setEntries] = useState<{ phone: string; name: string | null }[]>([]);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  const match = async (entries: { phone: string; name: string | null }[]) => {
    if (entries.length === 0) {
      toast('No elegiste ningún número', 'info');
      return;
    }
    setBusy(true);
    try {
      const names = new Map(entries.map((e) => [e.phone, e.name]));
      const matches = await http.post<ContactMatch[]>('/people/match', { phones: entries.map((e) => e.phone) });
      setChecked(entries.length);
      setEntries(entries);
      setFound(matches.map((m) => ({ ...m, contactName: names.get(m.phone) ?? null })));
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  // Todos los contactos que no están en Parla (sin repetir), para invitarlos.
  const others = useMemo<OtherContact[]>(() => {
    if (!found) return [];
    const inParla = new Set(found.map((f) => tail(f.phone)));
    const seen = new Set<string>();
    return entries
      .filter((e) => {
        const key = tail(e.phone);
        if (key.length < 6 || inParla.has(key) || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => (a.name ?? a.phone).localeCompare(b.name ?? b.phone, 'es'));
  }, [found, entries]);

  return {
    others,
    phoneBookSupported: contactsApi() !== null,
    found,
    checked,
    manual,
    busy,
    opening,
    onManualChange: (value: string) => setManual(value),
    fromPhoneBook: async () => {
      const api = contactsApi();
      if (!api) return;
      try {
        const picked = await api.select(['name', 'tel'], { multiple: true });
        await match(picked.flatMap((c) => (c.tel ?? []).map((phone) => ({ phone, name: c.name?.[0] ?? null }))));
      } catch {
        // La persona cerró el selector: no es un error.
      }
    },
    fromManual: () =>
      void match(
        manual
          .split(/[\n,;]+/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map((phone) => ({ phone, name: null })),
      ),
    openChat: async (user: PublicUser) => {
      setOpening(user.id);
      try {
        const conversation = await startDirect({ ...me, publicKey: me.publicKey }, user);
        onOpenChat?.();
        navigate(`/app/c/${conversation.id}`);
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setOpening(null);
      }
    },
    invite: async () => {
      const text = `Hablemos por Parla: chats cifrados y servicios en una sola app. ${location.origin}/registro`;
      try {
        if (navigator.share) await navigator.share({ title: 'Parla', text });
        else {
          await navigator.clipboard.writeText(text);
          toast('Invitación copiada: pégala en un mensaje', 'success');
        }
      } catch {
        // Compartir cancelado.
      }
    },
  };
}
