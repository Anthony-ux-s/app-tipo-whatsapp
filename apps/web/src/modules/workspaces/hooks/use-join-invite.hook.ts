import type { InvitePreview } from '@parla/types';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage } from '@shared/utils/http';

/** Página del enlace de invitación: muestra el espacio y permite unirse. */
export function useJoinInvite() {
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const previewInvite = useWorkspaceStore((s) => s.previewInvite);
  const joinInvite = useWorkspaceStore((s) => s.joinInvite);
  const loadWorkspaces = useWorkspaceStore((s) => s.loadWorkspaces);
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let alive = true;
    setError(null);
    previewInvite(code)
      .then((p) => alive && setPreview(p))
      .catch((err) => alive && setError(errorMessage(err)));
    return () => {
      alive = false;
    };
  }, [code, previewInvite]);

  return {
    preview,
    error,
    joining,
    join: async () => {
      if (!preview) return;
      if (preview.alreadyMember) {
        navigate(`/app/w/${preview.workspaceId}`);
        return;
      }
      setJoining(true);
      try {
        const ws = await joinInvite(code);
        await loadWorkspaces();
        toast(`¡Te uniste a ${ws.name}!`, 'success');
        navigate(`/app/w/${ws.id}`, { replace: true });
      } catch (err) {
        setError(errorMessage(err));
        setJoining(false);
      }
    },
    goHome: () => navigate('/app'),
  };
}
