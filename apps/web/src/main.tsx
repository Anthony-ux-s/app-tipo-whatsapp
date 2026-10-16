import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { useSessionStore } from './shared/stores/session.store';
import { Toaster } from './shared/ui/Toaster';
import './index.css';

void useSessionStore.getState().boot();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </StrictMode>,
);
