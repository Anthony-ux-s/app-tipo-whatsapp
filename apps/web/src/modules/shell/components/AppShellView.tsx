import { Outlet } from 'react-router';
import { CallOverlay } from '../../calls/components/CallOverlay';
import { EffectsLayer } from '../../stickers/components/EffectsLayer';
import { ChatListPanel } from '../../chats/components/ChatListPanel';
import { useLocationSharing } from '../../driver/hooks/use-location-sharing.hook';
import { useAppShell } from '../hooks/use-app-shell.hook';
import { useMainLayout } from '../hooks/use-main-layout.hook';
import { AppRail } from './AppRail';
import { ConnectionBanner } from './ConnectionBanner';
import { MobileNav } from './MobileNav';

/**
 * Armazón de la app: barra de secciones (escritorio), lista de chats y el panel abierto.
 * En el celular se ve la lista o el panel, con la barra inferior en las pantallas principales.
 */
export function AppShellView() {
  const shell = useAppShell();
  const layout = useMainLayout();
  useLocationSharing();
  if (!shell.user) return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <AppRail user={shell.user} section={layout.section} unread={layout.totalUnread} activeOrders={layout.activeOrders} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ConnectionBanner connection={shell.connection} />
        <div className="flex min-h-0 min-w-0 flex-1">
          <aside
            className={`${layout.showListOnMobile ? 'flex' : 'hidden'} w-full shrink-0 flex-col border-r border-line md:flex md:w-[340px] lg:w-[380px]`}
          >
            <ChatListPanel />
            <MobileNav section={layout.section} unread={layout.totalUnread} activeOrders={layout.activeOrders} />
          </aside>
          <main className={`${layout.showListOnMobile ? 'hidden' : 'flex'} min-w-0 flex-1 flex-col md:flex`}>
            <div className="flex min-h-0 flex-1 animate-fade-in">
              <Outlet />
            </div>
            {layout.showMobileNavInMain && <MobileNav section={layout.section} unread={layout.totalUnread} activeOrders={layout.activeOrders} />}
          </main>
        </div>
      </div>
      <CallOverlay />
      <EffectsLayer />
    </div>
  );
}
