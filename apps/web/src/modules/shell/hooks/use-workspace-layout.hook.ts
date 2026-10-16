import { useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router';
import { useChatStore } from '@shared/stores/chat.store';
import { toast } from '@shared/stores/toast.store';
import { useWorkspaceStore } from '@shared/stores/workspace.store';
import { errorMessage } from '@shared/utils/http';

/** Espacio activo: carga sus chats y su detalle, y decide qué panel se ve en el celular. */
export function useWorkspaceLayout() {
  const { workspaceId = '', conversationId } = useParams();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const loadDetail = useWorkspaceStore((s) => s.loadDetail);
  const loadConversations = useChatStore((s) => s.loadConversations);
  const totalUnread = useChatStore((s) => Object.values(s.conversations).reduce((sum, c) => sum + c.unreadCount, 0));
  const exists = workspaces.some((w) => w.id === workspaceId);

  useEffect(() => {
    if (!exists) {
      navigate('/app', { replace: true });
      return;
    }
    localStorage.setItem('parla.lastWorkspace', workspaceId);
    loadConversations(workspaceId).catch((err) => toast(errorMessage(err), 'error'));
    void loadDetail(workspaceId).catch(() => undefined);
  }, [exists, workspaceId, loadConversations, loadDetail, navigate]);

  const section = pathname.endsWith('/equipo')
    ? 'team'
    : pathname.endsWith('/ajustes')
      ? 'settings'
      : pathname.endsWith('/tareas')
        ? 'tasks'
        : conversationId
          ? 'conversation'
          : 'list';

  return {
    workspaceId,
    exists,
    totalUnread,
    /** En el celular: la lista ocupa la pantalla; al abrir algo, el panel ocupa el 100%. */
    showListOnMobile: section === 'list',
    showMobileNavInMain: section === 'team' || section === 'settings' || section === 'tasks',
  };
}
