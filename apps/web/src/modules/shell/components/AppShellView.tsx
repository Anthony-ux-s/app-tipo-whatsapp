import { Outlet } from 'react-router';
import { ErrorState, FullScreenLoader } from '@shared/ui/States';
import { CallOverlay } from '../../calls/components/CallOverlay';
import { CreateWorkspaceModal } from '../../workspaces/components/CreateWorkspaceModal';
import { useAppShell } from '../hooks/use-app-shell.hook';
import { ConnectionBanner } from './ConnectionBanner';
import { WorkspaceRail } from './WorkspaceRail';

export function AppShellView() {
  const shell = useAppShell();
  if (!shell.user) return null;
  if (shell.status === 'loading' || shell.status === 'idle') return <FullScreenLoader label="Abriendo tus espacios…" />;
  if (shell.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <ErrorState message={shell.error ?? 'Revisa tu conexión.'} onRetry={shell.reload} compact={false} />
      </div>
    );
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <WorkspaceRail
        user={shell.user}
        workspaces={shell.workspaces}
        activeWorkspaceId={shell.activeWorkspaceId}
        onCreate={shell.openCreate}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner connection={shell.connection} />
        <div className="flex min-h-0 flex-1">
          <Outlet context={{ openCreateWorkspace: shell.openCreate }} />
        </div>
      </div>
      <CreateWorkspaceModal open={shell.createOpen} onClose={shell.closeCreate} />
      <CallOverlay />
    </div>
  );
}
