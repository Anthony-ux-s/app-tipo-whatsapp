import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { useSessionStore } from './shared/stores/session.store';
import { Toaster } from './shared/ui/Toaster';
import './index.css';

void useSessionStore.getState().boot();

// Actualización automática de la app instalada: al haber una versión nueva se recarga sola, y se busca una
// al abrir la app y cada vez que se vuelve a ella (en el celular, al sacarla de las apps recientes).
registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => void registration.update().catch(() => undefined);
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
    window.setInterval(check, 30 * 60_000);
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
    <Toaster />
  </StrictMode>,
);
