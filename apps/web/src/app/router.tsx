import { createBrowserRouter, Navigate } from 'react-router';
import { WelcomeView } from '../modules/account/components/WelcomeView';
import { DriverOrderDetailView } from '../modules/driver/components/DriverOrderDetailView';
import { DriverOrdersView } from '../modules/driver/components/DriverOrdersView';
import { ForgotPasswordView } from '../modules/auth/components/ForgotPasswordView';
import { LoginView } from '../modules/auth/components/LoginView';
import { RegisterView } from '../modules/auth/components/RegisterView';
import { BusinessOrderDetailView } from '../modules/business/components/BusinessOrderDetailView';
import { BusinessOrdersView } from '../modules/business/components/BusinessOrdersView';
import { ConversationView } from '../modules/chats/components/ConversationView';
import { NoChatSelected } from '../modules/chats/components/NoChatSelected';
import { LegalView } from '../modules/legal/components/LegalView';
import { CheckoutView } from '../modules/services/components/CheckoutView';
import { MarketView } from '../modules/services/components/MarketView';
import { OffersView } from '../modules/services/components/OffersView';
import { OrderDetailView } from '../modules/services/components/OrderDetailView';
import { OrdersView } from '../modules/services/components/OrdersView';
import { ServicesHomeView } from '../modules/services/components/ServicesHomeView';
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
          { path: 'servicios/mercado', element: <MarketView /> },
          { path: 'servicios/mercado/carrito', element: <CheckoutView /> },
          { path: 'ofertas', element: <OffersView /> },
          { path: 'pedidos', element: <OrdersView /> },
          { path: 'pedidos/:orderId', element: <OrderDetailView /> },
          { path: 'negocio', element: <BusinessOrdersView /> },
          { path: 'negocio/pedidos/:orderId', element: <BusinessOrderDetailView /> },
          { path: 'rapidito', element: <DriverOrdersView /> },
          { path: 'rapidito/pedidos/:orderId', element: <DriverOrderDetailView /> },
          { path: 'ajustes', element: <SettingsView /> },
          { path: 'ajustes/:section', element: <SettingsSectionView /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundView /> },
]);
