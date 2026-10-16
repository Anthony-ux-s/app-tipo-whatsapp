import { createBrowserRouter, Navigate } from 'react-router';
import { LoginView } from '../modules/auth/components/LoginView';
import { RegisterView } from '../modules/auth/components/RegisterView';
import { ConversationView } from '../modules/chats/components/ConversationView';
import { NoChatSelected } from '../modules/chats/components/NoChatSelected';
import { SettingsView } from '../modules/settings/components/SettingsView';
import { AppHomeRedirect } from '../modules/shell/components/AppHomeRedirect';
import { AppShellView } from '../modules/shell/components/AppShellView';
import { WorkspaceLayoutView } from '../modules/shell/components/WorkspaceLayoutView';
import { JoinInviteView } from '../modules/workspaces/components/JoinInviteView';
import { OnboardingView } from '../modules/workspaces/components/OnboardingView';
import { TeamView } from '../modules/workspaces/components/TeamView';
import { NotFoundView } from './NotFoundView';
import { GuestOnly, RequireAuth } from './route-guards';

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    element: <GuestOnly />,
    children: [
      { path: '/entrar', element: <LoginView /> },
      { path: '/registro', element: <RegisterView /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      { path: '/invitacion/:code', element: <JoinInviteView /> },
      {
        path: '/app',
        element: <AppShellView />,
        children: [
          { index: true, element: <AppHomeRedirect /> },
          { path: 'bienvenida', element: <OnboardingView /> },
          {
            path: 'w/:workspaceId',
            element: <WorkspaceLayoutView />,
            children: [
              { index: true, element: <NoChatSelected /> },
              { path: 'c/:conversationId', element: <ConversationView /> },
              { path: 'equipo', element: <TeamView /> },
              { path: 'ajustes', element: <SettingsView /> },
            ],
          },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundView /> },
]);
