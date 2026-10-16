import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { useSessionStore } from '@shared/stores/session.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage } from '@shared/utils/http';
import { useRealtime } from './use-realtime.hook';

/** Arranque de la app autenticada: socket, espacios de trabajo y el espacio activo. */
export function useAppShell() {
  const user = useSessionStore((s) => s.user);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const status = useWorkspaceStore((s) => s.status);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const connection = useChatStore((s) => s.connection);
  const { workspaceId } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  useRealtime(user?.id);

  const reload = () => {
    setError(null);
    loadWorkspaces().catch((err) => setError(errorMessage(err)));
  };

  useEffect(reload, [loadWorkspaces]);

  return {
    user,
    workspaces,
    status,
    error,
    connection,
    activeWorkspaceId: workspaceId ?? null,
    createOpen,
    reload,
    openCreate: () => setCreateOpen(true),
    closeCreate: () => setCreateOpen(false),
    goToWorkspace: (id: string) => navigate(`/app/w/${id}`),
  };
}
