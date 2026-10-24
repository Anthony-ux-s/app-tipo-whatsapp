import { createBrowserRouter, Navigate } from 'react-router';
import { LoginView } from '../modules/auth/components/LoginView';
import { ConversationView } from '../modules/chats/components/ConversationView';
import { NoChatSelected } from '../modules/chats/components/NoChatSelected';
import { AppRoot } from './AppRoot';
import { NotFoundView } from './NotFoundView';
import { GuestOnly, RequireAuth, UsersOnly } from './route-guards';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/legal/terminos', lazy: () => import('../modules/legal/components/LegalView').then((m) => ({ Component: () => <m.LegalView slug="terminos" /> })) },
  { path: '/legal/privacidad', lazy: () => import('../modules/legal/components/LegalView').then((m) => ({ Component: () => <m.LegalView slug="privacidad" /> })) },
  {
    element: <GuestOnly />,
    children: [
      { path: '/entrar', element: <LoginView /> },
      { path: '/registro', lazy: () => import('../modules/auth/components/RegisterView').then((m) => ({ Component: m.RegisterView })) },
      { path: '/recuperar', lazy: () => import('../modules/auth/components/ForgotPasswordView').then((m) => ({ Component: m.ForgotPasswordView })) },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/bienvenida', lazy: () => import('../modules/account/components/WelcomeView').then((m) => ({ Component: m.WelcomeView })) },
      {
        path: '/app',
        element: <AppRoot />,
        children: [
          { index: true, element: <NoChatSelected /> },
          { path: 'c/:conversationId', element: <ConversationView /> },
          { path: 'servicios', lazy: () => import('../modules/services/components/ServicesHomeView').then((m) => ({ Component: m.ServicesHomeView })) },
          // «c/:category» va antes de «:storeId» para que «c» no se tome como el id de una tienda.
          { path: 'servicios/c/:category', lazy: () => import('../modules/services/components/StoresListView').then((m) => ({ Component: m.StoresListView })) },
          { path: 'servicios/:storeId', lazy: () => import('../modules/services/components/MarketView').then((m) => ({ Component: m.MarketView })) },
          { path: 'servicios/:storeId/carrito', lazy: () => import('../modules/services/components/CheckoutView').then((m) => ({ Component: m.CheckoutView })) },
          { path: 'ofertas', lazy: () => import('../modules/services/components/OffersView').then((m) => ({ Component: m.OffersView })) },
          { path: 'pedidos', lazy: () => import('../modules/services/components/OrdersView').then((m) => ({ Component: m.OrdersView })) },
          { path: 'pedidos/:orderId', lazy: () => import('../modules/services/components/OrderDetailView').then((m) => ({ Component: m.OrderDetailView })) },
          {
            // Tienda y reparto son de los clientes; soporte, que solo administra, vuelve a su inicio.
            element: <UsersOnly />,
            children: [
              { path: 'negocio', lazy: () => import('../modules/business/components/BusinessOrdersView').then((m) => ({ Component: m.BusinessOrdersView })) },
              { path: 'negocio/nueva', lazy: () => import('../modules/business/components/StoreCategoryView').then((m) => ({ Component: m.StoreCategoryView })) },
              { path: 'negocio/nueva/ferreteria', lazy: () => import('../modules/business/components/FerreteriaStartView').then((m) => ({ Component: m.FerreteriaStartView })) },
              { path: 'negocio/nueva/ferreteria/conectar', lazy: () => import('../modules/business/components/FerrohubConnectView').then((m) => ({ Component: m.FerrohubConnectView })) },
              { path: 'negocio/nueva/ferreteria/crear', lazy: () => import('../modules/business/components/FerrohubCreateView').then((m) => ({ Component: m.FerrohubCreateView })) },
              { path: 'negocio/abrir', lazy: () => import('../modules/business/components/OpenStoreView').then((m) => ({ Component: m.OpenStoreView })) },
              { path: 'negocio/tienda', lazy: () => import('../modules/business/components/StoreEditView').then((m) => ({ Component: m.StoreEditView })) },
              { path: 'negocio/catalogo', lazy: () => import('../modules/business/components/BusinessCatalogView').then((m) => ({ Component: m.BusinessCatalogView })) },
              { path: 'negocio/conectar', lazy: () => import('../modules/business/components/ConnectSystemView').then((m) => ({ Component: m.ConnectSystemView })) },
              { path: 'negocio/pedidos/:orderId', lazy: () => import('../modules/business/components/BusinessOrderDetailView').then((m) => ({ Component: m.BusinessOrderDetailView })) },
              { path: 'rapidito', lazy: () => import('../modules/driver/components/DriverOrdersView').then((m) => ({ Component: m.DriverOrdersView })) },
              { path: 'rapidito/registro', lazy: () => import('../modules/driver/components/DriverRegisterView').then((m) => ({ Component: m.DriverRegisterView })) },
              { path: 'rapidito/perfil', lazy: () => import('../modules/driver/components/DriverProfileView').then((m) => ({ Component: m.DriverProfileView })) },
              { path: 'rapidito/rutas', lazy: () => import('../modules/driver/components/DriverRoutesView').then((m) => ({ Component: m.DriverRoutesView })) },
              { path: 'rapidito/pedidos/:orderId', lazy: () => import('../modules/driver/components/DriverOrderDetailView').then((m) => ({ Component: m.DriverOrderDetailView })) },
            ],
          },
          { path: 'admin/:section?', lazy: () => import('../modules/admin/components/AdminView').then((m) => ({ Component: m.AdminView })) },
          { path: 'ajustes', lazy: () => import('../modules/settings/components/SettingsView').then((m) => ({ Component: m.SettingsView })) },
          { path: 'ajustes/:section', lazy: () => import('../modules/settings/components/SettingsSectionView').then((m) => ({ Component: m.SettingsSectionView })) },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundView /> },
]);
