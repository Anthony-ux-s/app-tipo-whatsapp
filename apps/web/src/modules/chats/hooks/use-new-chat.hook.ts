import type { PublicUser } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage } from '@shared/utils/http';
import { matchesSearch } from '@shared/utils/text';
import type { NewChatMode } from '../types/chats.types';

/** Nuevo chat individual o grupo: elegir personas del espacio, nombrar el grupo y crear las claves. */
export function useNewChat(initialMode: NewChatMode | null, onClose: () => void) {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const detail = useWorkspaceStore((s) => s.details[workspaceId]);
  const loadDetail = useWorkspaceStore((s) => s.loadDetail);
  const startDirect = useChatStore((s) => s.startDirect);
  const createGroup = useChatStore((s) => s.createGroup);
  const [mode, setMode] = useState<NewChatMode>('direct');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialMode) return;
    setMode(initialMode);
    setSearch('');
    setSelected([]);
    setTitle('');
    setError(null);
    if (workspaceId) void loadDetail(workspaceId).catch((err) => setError(errorMessage(err)));
  }, [initialMode, workspaceId, loadDetail]);

  const me: PublicUser = useMemo(
    () => ({ ...user, publicKey: user.publicKey }),
    [user],
  );
  const people = useMemo(
    () =>
      (detail?.members ?? [])
        .map((m) => m.user)
        .filter((u) => u.id !== user.id && matchesSearch(`${u.displayName} ${u.username ?? ''}`, search)),
    [detail, user.id, search],
  );
  const canCreateGroups = detail ? detail.role === 'admin' || detail.allowMemberGroups : false;

  const finish = (conversationId: string) => {
    onClose();
    navigate(`/app/w/${workspaceId}/c/${conversationId}`);
  };

  const pickPerson = async (person: PublicUser) => {
    if (mode === 'group') {
      setSelected((current) => (current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]));
      return;
    }
    setBusy(true);
    try {
      finish((await startDirect(workspaceId, me, person)).id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitGroup = async () => {
    if (title.trim().length < 2) {
      setError('Ponle un nombre al grupo');
      return;
    }
    if (selected.length === 0) {
      setError('Elige al menos a una persona');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const members = (detail?.members ?? []).map((m) => m.user).filter((u) => selected.includes(u.id));
      const conversation = await createGroup(workspaceId, me, title.trim(), members);
      toast(`Grupo «${conversation.title}» creado con cifrado de extremo a extremo`, 'success');
      finish(conversation.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return {
    mode,
    people,
    loading: !detail,
    search,
    selected,
    selectedPeople: (detail?.members ?? []).map((m) => m.user).filter((u) => selected.includes(u.id)),
    title,
    busy,
    error,
    canCreateGroups,
    setMode: (value: NewChatMode) => {
      setMode(value);
      setError(null);
    },
    onSearchChange: (value: string) => setSearch(value),
    onTitleChange: (value: string) => setTitle(value),
    pickPerson,
    submitGroup,
  };
}
