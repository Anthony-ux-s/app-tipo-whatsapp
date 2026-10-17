import type { PublicUser } from '@parla/types';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

/**
 * Chat sobre un pedido, en los dos sentidos: el cliente le escribe al negocio y el dueño al cliente.
 * Es el chat cifrado de siempre (directo entre las dos personas); el core solo dice quién es la otra
 * parte del pedido, y solo a quienes participan en él.
 */
export function useOrderChat(orderId: string | undefined) {
  const navigate = useNavigate();
  const me = useSessionStore((s) => s.user);
  const startDirect = useChatStore((s) => s.startDirect);
  const [opening, setOpening] = useState(false);

  return {
    opening,
    open: async () => {
      if (!orderId || !me || opening) return;
      setOpening(true);
      try {
        const contact = await http.get<PublicUser>(`/orders/${encodeURIComponent(orderId)}/contact`);
        const conversation = await startDirect({ ...me, publicKey: me.publicKey }, contact);
        navigate(`/app/c/${conversation.id}`);
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setOpening(false);
      }
    },
  };
}
