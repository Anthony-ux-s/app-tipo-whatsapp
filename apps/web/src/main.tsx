import { StrictMode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { RouterProvider } from 'react-router';
import { router } from './app/router';
import { LockGate } from './modules/lock/components/LockGate';
import { useSessionStore } from './shared/stores/session.store';
import { queryClient } from './shared/utils/query-client';
import { Toaster } from './shared/ui/Toaster';
import './index.css';

void useSessionStore.getState().boot();

// Teclado del celular: solo sube el teclado, la app se encoge hasta quedar encima de él (el encabezado no se mueve).
// El meta «interactive-widget=resizes-content» lo hace en Chrome; esto lo cubre en los navegadores que lo ignoran.
const viewport = window.visualViewport;
if (viewport) {
  const fit = () => {
    document.documentElement.style.setProperty('--vvh', `${Math.round(viewport.height)}px`);
    if (viewport.offsetTop > 0) window.scrollTo(0, 0);
  };
  viewport.addEventListener('resize', fit);
  viewport.addEventListener('scroll', fit);
  fit();
}

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
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <LockGate />
      <Toaster />
    </QueryClientProvider>
  </StrictMode>,
);
