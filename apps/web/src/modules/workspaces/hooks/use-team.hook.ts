import type { PublicUser, WorkspaceRole } from '@parla/types';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage } from '@shared/utils/http';
import { matchesSearch } from '@shared/utils/text';
import { inviteLink } from '../utils/invite-link.utils';

/** Equipo del espacio: directorio para todos; roles, invitaciones y ajustes para administradores. */
export function useTeam() {
  const { workspaceId = '' } = useParams();
  const navigate = useNavigate();
  const user = useSessionStore((s) => s.user)!;
  const detail = useWorkspaceStore((s) => s.details[workspaceId]);
  const store = useWorkspaceStore.getState();
  const startDirect = useChatStore((s) => s.startDirect);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const load = () => {
    setError(null);
    store.loadDetail(workspaceId).catch((err) => setError(errorMessage(err)));
  };
  useEffect(load, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isAdmin = detail?.role === 'admin';
  const members = useMemo(
    () => (detail?.members ?? []).filter((m) => matchesSearch(`${m.user.displayName} ${m.user.username ?? ''}`, search)),
    [detail, search],
  );
  const onlineCount = (detail?.members ?? []).filter((m) => m.user.presence === 'online').length;
  const link = detail?.inviteCode ? inviteLink(detail.inviteCode) : null;

  const run = async (key: string, action: () => Promise<void>, success?: string) => {
    setPending(key);
    try {
      await action();
      if (success) toast(success, 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setPending(null);
    }
  };

  return {
    user,
    detail,
    isAdmin,
    members,
    onlineCount,
    link,
    search,
    error,
    pending,
    removing,
    editing,
    name,
    description,
    reload: load,
    onSearchChange: (value: string) => setSearch(value),
    copyLink: async () => {
      if (!link) return;
      try {
        await navigator.clipboard.writeText(link);
        toast('Enlace de invitación copiado', 'success');
      } catch {
        toast(link, 'info');
      }
    },
    shareLink: async () => {
      if (!link || !detail) return;
      if (navigator.share) {
        await navigator.share({ title: `Únete a ${detail.name} en Parla`, url: link }).catch(() => undefined);
      } else {
        await navigator.clipboard.writeText(link).catch(() => undefined);
        toast('Enlace de invitación copiado', 'success');
      }
    },
    regenerate: () =>
      run('invite', () => store.regenerateInvite(workspaceId), 'Nuevo enlace creado. El anterior ya no funciona.'),
    changeRole: (userId: string, role: WorkspaceRole) =>
      run(`role-${userId}`, () => store.changeRole(workspaceId, userId, role), 'Rol actualizado'),
    askRemove: (userId: string) => setRemoving(userId),
    cancelRemove: () => setRemoving(null),
    confirmRemove: (userId: string) =>
      run(`remove-${userId}`, async () => {
        await store.removeMember(workspaceId, userId);
        setRemoving(null);
      }, 'La persona salió del espacio'),
    toggleMemberGroups: (value: boolean) =>
      run('groups', () => store.updateWorkspace(workspaceId, { allowMemberGroups: value }), 'Ajuste guardado'),
    startEditing: () => {
      setName(detail?.name ?? '');
      setDescription(detail?.description ?? '');
      setEditing(true);
    },
    cancelEditing: () => setEditing(false),
    onNameChange: (value: string) => setName(value),
    onDescriptionChange: (value: string) => setDescription(value),
    saveDetails: () =>
      run('details', async () => {
        await store.updateWorkspace(workspaceId, { name, description });
        setEditing(false);
      }, 'Espacio actualizado'),
    message: (person: PublicUser) =>
      run(`chat-${person.id}`, async () => {
        const conversation = await startDirect(workspaceId, user, person);
        navigate(`/app/w/${workspaceId}/c/${conversation.id}`);
      }),
  };
}
