import type { ConversationSummary, PublicUser } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { keyFingerprint } from '@shared/utils/fingerprint';
import { errorMessage } from '@shared/utils/http';
import { counterpart } from '../utils/conversation-preview.utils';

/** Panel de información: miembros, huella de seguridad, agregar personas y salir del grupo. */
export function useConversationInfo(conversation: ConversationSummary, open: boolean) {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const detail = useWorkspaceStore((s) => s.details[conversation.workspaceId]);
  const loadDetail = useWorkspaceStore((s) => s.loadDetail);
  const { addParticipants, leave } = useChatStore.getState();
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [fingerprint, setFingerprint] = useState<string[] | null>(null);

  const other = counterpart(conversation, user.id);
  const isGroup = conversation.kind === 'group';
  const canAdd = isGroup && (detail?.role === 'admin' || conversation.createdById === user.id);

  useEffect(() => {
    if (!open) return;
    setAdding(false);
    setSelected([]);
    setConfirmLeave(false);
    void loadDetail(conversation.workspaceId).catch(() => undefined);
  }, [open, conversation.id, conversation.workspaceId, loadDetail]);

  const otherKey = other?.publicKey;
  useEffect(() => {
    let alive = true;
    setFingerprint(null);
    if (otherKey) void keyFingerprint(otherKey).then((f) => alive && setFingerprint(f));
    return () => {
      alive = false;
    };
  }, [otherKey]);

  const candidates = useMemo<PublicUser[]>(() => {
    const inGroup = new Set(conversation.participants.map((p) => p.user.id));
    return (detail?.members ?? []).map((m) => m.user).filter((u) => !inGroup.has(u.id));
  }, [detail, conversation.participants]);

  const members = useMemo(
    () =>
      [...conversation.participants].sort((a, b) =>
        a.user.id === user.id ? -1 : b.user.id === user.id ? 1 : a.user.displayName.localeCompare(b.user.displayName, 'es'),
      ),
    [conversation.participants, user.id],
  );

  return {
    user,
    isGroup,
    other,
    members,
    fingerprint,
    canAdd,
    adding,
    candidates,
    selected,
    busy,
    confirmLeave,
    startAdding: () => setAdding(true),
    cancelAdding: () => {
      setAdding(false);
      setSelected([]);
    },
    toggleCandidate: (id: string) =>
      setSelected((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id])),
    confirmAdd: async () => {
      if (selected.length === 0) return;
      setBusy(true);
      try {
        await addParticipants(conversation.id, user, candidates.filter((c) => selected.includes(c.id)));
        toast('Personas agregadas. Ya pueden leer los mensajes nuevos.', 'success');
        setAdding(false);
        setSelected([]);
      } catch (err) {
        toast(errorMessage(err), 'error');
      } finally {
        setBusy(false);
      }
    },
    askLeave: () => setConfirmLeave(true),
    cancelLeave: () => setConfirmLeave(false),
    leaveGroup: async () => {
      setBusy(true);
      try {
        await leave(conversation.id);
        toast(`Saliste de «${conversation.title}»`, 'info');
        navigate(`/app/w/${conversation.workspaceId}`, { replace: true });
      } catch (err) {
        toast(errorMessage(err), 'error');
        setBusy(false);
      }
    },
  };
}
