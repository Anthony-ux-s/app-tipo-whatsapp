import { Outlet } from 'react-router';
import { CallOverlay } from '../../calls/components/CallOverlay';
import { RouletteGate } from '../../growth/components/RouletteGate';
import { EffectsLayer } from '../../stickers/components/EffectsLayer';
import { ChatListPanel } from '../../chats/components/ChatListPanel';
import { NewChatModal } from '../../chats/components/NewChatModal';
import { useLocationSharing } from '../../driver/hooks/use-location-sharing.hook';
import { useAppShell } from '../hooks/use-app-shell.hook';
import { useMainLayout } from '../hooks/use-main-layout.hook';
import { useMenuStore } from '@shared/stores/menu.store';
import { AppMenu } from './AppMenu';
import { ConnectionBanner } from './ConnectionBanner';
import { MobileNav } from './MobileNav';

/**
 * Armazón de la app: lista de chats y el panel abierto; todo lo demás está en el menú de las tres
 * líneas. En el celular se ve la lista o el panel, con la barra inferior en las pantallas principales.
 */
export function AppShellView() {
  const shell = useAppShell();
  const layout = useMainLayout();
  const menu = useMenuStore();
  useLocationSharing();
  if (!shell.user) return null;

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
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
      <AppMenu open={menu.menuOpen} onClose={menu.closeMenu} onNewGroup={() => menu.openNewChat('group')} />
      <NewChatModal mode={menu.newChat} onClose={menu.closeNewChat} />
      <CallOverlay />
      <EffectsLayer />
      <RouletteGate />
    </div>
  );
}
