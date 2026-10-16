/// <reference lib="webworker" />
/**
 * Service worker de Parla: la app funciona instalada (precache) y recibe notificaciones push.
 * Los avisos nunca traen el contenido de los mensajes: va cifrado de extremo a extremo.
 */
import type { PushPayload } from '@parla/types';
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();

if (import.meta.env.PROD) {
  cleanupOutdatedCaches();
  precacheAndRoute(self.__WB_MANIFEST);
  registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api/, /^\/socket\.io/] }),
  );
}

self.addEventListener('push', (event) => {
  let payload: PushPayload = { title: 'Parla', body: 'Tienes mensajes nuevos', url: '/app', tag: 'parla' };
  try {
    if (event.data) payload = { ...payload, ...(event.data.json() as Partial<PushPayload>) };
  } catch {
    // Carga no válida: se muestra el aviso genérico.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data as { url?: string } | undefined)?.url ?? '/app', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (existing) {
        await existing.focus();
        await existing.navigate(url).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});
