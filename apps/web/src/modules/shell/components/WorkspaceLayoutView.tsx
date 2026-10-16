import { Outlet } from 'react-router';
import { ChatListPanel } from '../../chats/components/ChatListPanel';
import { useWorkspaceLayout } from '../hooks/use-workspace-layout.hook';
import { MobileNav } from './MobileNav';

/** Sidebar de chats + panel principal. En el celular se muestra uno u otro. */
export function WorkspaceLayoutView() {
  const layout = useWorkspaceLayout();
  if (!layout.exists) return null;
  return (
    <div className="flex min-w-0 flex-1">
      <aside
        className={`${layout.showListOnMobile ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-line md:flex md:w-[340px] lg:w-[380px]`}
      >
        <ChatListPanel />
        <MobileNav workspaceId={layout.workspaceId} unread={layout.totalUnread} />
      </aside>
      <main className={`${layout.showListOnMobile ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col md:flex`}>
        <div key={layout.workspaceId} className="flex min-h-0 flex-1 animate-fade-in">
          <Outlet />
        </div>
        {layout.showMobileNavInMain && <MobileNav workspaceId={layout.workspaceId} unread={layout.totalUnread} />}
      </main>
    </div>
  );
}
