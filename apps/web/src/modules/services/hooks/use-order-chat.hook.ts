import type { OrderContactRole, PublicUser } from '@parla/types';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage, http } from '@shared/utils/http';

/**
 * Chat sobre un pedido, en los dos sentidos, con la otra parte que se elija: el cliente con la tienda
 * o con el repartidor, la tienda con el cliente o el repartidor, y el repartidor con ambos. Es el chat
 * cifrado de siempre (directo entre las dos personas); el core solo dice quién es la otra parte, y
 * solo a quienes participan en el pedido.
 */
export function useOrderChat(orderId: string | undefined) {
  const navigate = useNavigate();
  const me = useSessionStore((s) => s.user);
  const startDirect = useChatStore((s) => s.startDirect);
  const [opening, setOpening] = useState<OrderContactRole | null>(null);

  return {
    opening,
    open: async (withRole: OrderContactRole) => {
      if (!orderId || !me || opening) return;
      setOpening(withRole);
      try {
        const contact = await http.get<PublicUser>(`/orders/${encodeURIComponent(orderId)}/contact?with=${withRole}`);
        const conversation = await startDirect({ ...me, publicKey: me.publicKey }, contact);
        navigate(`/app/c/${conversation.id}`);
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setOpening(null);
      }
    },
  };
}
