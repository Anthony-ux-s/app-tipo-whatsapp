import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// El navegador solo habla con el gateway (Go): API REST en /api y tiempo real en /ws.
const API_URL = process.env.PARLA_API_URL ?? 'http://localhost:4100';
const WEB_PORT = Number(process.env.PARLA_WEB_PORT ?? 3100);

export default defineConfig({
  // Un solo .env en la raíz del proyecto (solo se exponen las variables VITE_*).
  envDir: '../..',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      // Service worker propio (src/sw.ts): precache de la app y notificaciones push.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png}'] },
      devOptions: { enabled: true, type: 'module' },
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Parla — chats y servicios',
        short_name: 'Parla',
        description: 'Chats cifrados de extremo a extremo y servicios: mercado, pago con QR y delivery.',
        lang: 'es',
        id: '/',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui'],
        orientation: 'portrait',
        categories: ['social', 'shopping', 'communication'],
        background_color: '#f0f2f5',
        theme_color: '#009d71',
        shortcuts: [
          { name: 'Chats', short_name: 'Chats', url: '/app', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Mercado', short_name: 'Mercado', url: '/app/servicios/mercado', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
          { name: 'Mis pedidos', short_name: 'Pedidos', url: '/app/pedidos', icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }] },
        ],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@parla/crypto': fileURLToPath(new URL('../../packages/crypto/src/index.ts', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Librerías aparte: el navegador las cachea y un cambio de código no las invalida.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          if (id.includes('react-router')) return 'router';
          if (id.includes('@tanstack')) return 'query';
          if (id.includes('lucide-react')) return 'icons';
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'react-router', 'zustand', 'lucide-react', 'workbox-core', 'workbox-precaching', 'workbox-routing'],
  },
  server: {
    port: WEB_PORT,
    strictPort: true,
    warmup: { clientFiles: ['./src/main.tsx', './src/app/router.tsx'] },
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
      '/ws': { target: API_URL, ws: true, changeOrigin: true },
    },
  },
  preview: {
    port: WEB_PORT,
    strictPort: true,
    proxy: {
      '/api': { target: API_URL, changeOrigin: true },
      '/ws': { target: API_URL, ws: true, changeOrigin: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
