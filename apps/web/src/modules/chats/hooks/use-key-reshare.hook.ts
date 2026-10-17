import type { ConversationSummary } from '@parla/types';
import { useState } from 'react';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { errorMessage } from '@shared/utils/http';

/**
 * Alguien del chat restableció su cuenta y tiene claves nuevas: decides si le vuelves a compartir el
 * chat (puede volver a leer el historial). Si fuiste tú, esperas a que alguien lo haga.
 */
export function useKeyReshare(conversation: ConversationSummary) {
  const me = useSessionStore((s) => s.user)!;
  const reshareKey = useChatStore((s) => s.reshareKey);
  const [busy, setBusy] = useState(false);

  const pending = conversation.participants.filter((p) => p.keyPending && p.user.id !== me.id).map((p) => p.user);
  const waitingForMe = !conversation.myKey;

  return {
    pending,
    waitingForMe,
    canShare: pending.length > 0 && !waitingForMe,
    busy,
    share: async () => {
      setBusy(true);
      try {
        await reshareKey(conversation.id, { ...me, publicKey: me.publicKey });
        toast('Listo: el chat se compartió de nuevo', 'success');
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
  };
}
