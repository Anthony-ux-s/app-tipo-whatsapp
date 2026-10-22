import { createBrowserRouter, Navigate } from 'react-router';
import { WelcomeView } from '../modules/account/components/WelcomeView';
import { AdminView } from '../modules/admin/components/AdminView';
import { DriverOrderDetailView } from '../modules/driver/components/DriverOrderDetailView';
import { DriverOrdersView } from '../modules/driver/components/DriverOrdersView';
import { DriverProfileView } from '../modules/driver/components/DriverProfileView';
import { DriverRegisterView } from '../modules/driver/components/DriverRegisterView';
import { DriverRoutesView } from '../modules/driver/components/DriverRoutesView';
import { ForgotPasswordView } from '../modules/auth/components/ForgotPasswordView';
import { LoginView } from '../modules/auth/components/LoginView';
import { RegisterView } from '../modules/auth/components/RegisterView';
import { BusinessCatalogView } from '../modules/business/components/BusinessCatalogView';
import { BusinessOrderDetailView } from '../modules/business/components/BusinessOrderDetailView';
import { BusinessOrdersView } from '../modules/business/components/BusinessOrdersView';
import { ConnectSystemView } from '../modules/business/components/ConnectSystemView';
import { OpenStoreView } from '../modules/business/components/OpenStoreView';
import { StoreEditView } from '../modules/business/components/StoreEditView';
import { ConversationView } from '../modules/chats/components/ConversationView';
import { NoChatSelected } from '../modules/chats/components/NoChatSelected';
import { LegalView } from '../modules/legal/components/LegalView';
import { CheckoutView } from '../modules/services/components/CheckoutView';
import { MarketView } from '../modules/services/components/MarketView';
import { OffersView } from '../modules/services/components/OffersView';
import { OrderDetailView } from '../modules/services/components/OrderDetailView';
import { OrdersView } from '../modules/services/components/OrdersView';
import { ServicesHomeView } from '../modules/services/components/ServicesHomeView';
import { StoresListView } from '../modules/services/components/StoresListView';
import { SettingsSectionView } from '../modules/settings/components/SettingsSectionView';
import { SettingsView } from '../modules/settings/components/SettingsView';
import { AppShellView } from '../modules/shell/components/AppShellView';
import { NotFoundView } from './NotFoundView';
import { GuestOnly, RequireAuth } from './route-guards';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/legal/terminos', element: <LegalView slug="terminos" /> },
  { path: '/legal/privacidad', element: <LegalView slug="privacidad" /> },
  {
    element: <GuestOnly />,
    children: [
      { path: '/entrar', element: <LoginView /> },
      { path: '/registro', element: <RegisterView /> },
      { path: '/recuperar', element: <ForgotPasswordView /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/bienvenida', element: <WelcomeView /> },
      {
        path: '/app',
        element: <AppShellView />,
        children: [
          { index: true, element: <NoChatSelected /> },
          { path: 'c/:conversationId', element: <ConversationView /> },
          { path: 'servicios', element: <ServicesHomeView /> },
          // «c/:category» va antes de «:storeId» para que «c» no se tome como el id de una tienda.
          { path: 'servicios/c/:category', element: <StoresListView /> },
          { path: 'servicios/:storeId', element: <MarketView /> },
          { path: 'servicios/:storeId/carrito', element: <CheckoutView /> },
          { path: 'ofertas', element: <OffersView /> },
          { path: 'pedidos', element: <OrdersView /> },
          { path: 'pedidos/:orderId', element: <OrderDetailView /> },
          { path: 'negocio', element: <BusinessOrdersView /> },
          { path: 'negocio/abrir', element: <OpenStoreView /> },
          { path: 'negocio/tienda', element: <StoreEditView /> },
          { path: 'negocio/catalogo', element: <BusinessCatalogView /> },
          { path: 'negocio/conectar', element: <ConnectSystemView /> },
          { path: 'negocio/pedidos/:orderId', element: <BusinessOrderDetailView /> },
          { path: 'rapidito', element: <DriverOrdersView /> },
          { path: 'rapidito/registro', element: <DriverRegisterView /> },
          { path: 'rapidito/perfil', element: <DriverProfileView /> },
          { path: 'rapidito/rutas', element: <DriverRoutesView /> },
          { path: 'rapidito/pedidos/:orderId', element: <DriverOrderDetailView /> },
          { path: 'admin', element: <AdminView /> },
          { path: 'ajustes', element: <SettingsView /> },
          { path: 'ajustes/:section', element: <SettingsSectionView /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundView /> },
]);
