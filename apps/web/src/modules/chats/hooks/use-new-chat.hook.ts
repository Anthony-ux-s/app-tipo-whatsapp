import type { PublicUser } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { usePeopleStore } from '@shared/stores/people.store';
import { errorMessage } from '@shared/utils/http';
import type { NewChatMode } from '../types/chats.types';
import { usePeopleSearch } from './use-people-search.hook';

/** Nuevo chat individual o grupo: elegir personas de Parla, nombrar el grupo y crear las claves. */
export function useNewChat(initialMode: NewChatMode | null, onClose: () => void) {
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const known = usePeopleStore((s) => s.known);
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
  }, [initialMode]);

  const directory = usePeopleSearch(search, initialMode !== null);

  const me: PublicUser = useMemo(
    () => ({ ...user, publicKey: user.publicKey }),
    [user],
  );
  const people = directory.people.filter((u) => u.id !== user.id);
  const selectedPeople = selected.map((id) => known[id]).filter((u): u is PublicUser => Boolean(u));

  const finish = (conversationId: string) => {
    onClose();
    navigate(`/app/c/${conversationId}`);
  };

  const pickPerson = async (person: PublicUser) => {
    if (mode === 'group') {
      setSelected((current) => (current.includes(person.id) ? current.filter((id) => id !== person.id) : [...current, person.id]));
      return;
    }
    setBusy(true);
    try {
      finish((await startDirect(me, person)).id);
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
      const conversation = await createGroup(me, title.trim(), selectedPeople);
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
    loading: directory.loading && people.length === 0,
    directoryError: directory.error,
    search,
    selected,
    selectedPeople,
    title,
    busy,
    error,
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
