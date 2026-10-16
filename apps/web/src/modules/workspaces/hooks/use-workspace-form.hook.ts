import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage } from '@shared/utils/http';
import type { WorkspaceFormTab } from '../types/workspaces.types';
import { parseInviteCode } from '../utils/invite-link.utils';

/** Crear un espacio (quedas como administrador) o unirte a uno con un enlace de invitación. */
export function useWorkspaceForm(onDone?: () => void) {
  const navigate = useNavigate();
  const createWorkspace = useWorkspaceStore((s) => s.createWorkspace);
  const [tab, setTab] = useState<WorkspaceFormTab>('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('teal');
  const [invite, setInvite] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    if (tab === 'join') {
      const code = parseInviteCode(invite);
      if (!code) {
        setError('Pega el enlace o el código que te enviaron');
        return;
      }
      onDone?.();
      navigate(`/invitacion/${code}`);
      return;
    }
    if (name.trim().length < 3) {
      setError('El nombre debe tener al menos 3 caracteres');
      return;
    }
    setLoading(true);
    try {
      const ws = await createWorkspace({ name: name.trim(), description: description.trim(), color });
      toast(`Espacio «${ws.name}» creado. Ahora invita a tu equipo.`, 'success');
      setName('');
      setDescription('');
      onDone?.();
      navigate(`/app/w/${ws.id}/equipo`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return {
    tab,
    name,
    description,
    color,
    invite,
    error,
    loading,
    selectTab: (value: WorkspaceFormTab) => {
      setTab(value);
      setError(null);
    },
    onNameChange: (value: string) => setName(value),
    onDescriptionChange: (value: string) => setDescription(value),
    selectColor: (value: string) => setColor(value),
    onInviteChange: (value: string) => setInvite(value),
    submit,
  };
}
