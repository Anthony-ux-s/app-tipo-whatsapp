import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.PARLA_WEB_URL ?? 'http://localhost:3100';
const API_URL = process.env.PARLA_API_URL ?? 'http://localhost:4100';

/**
 * Recorrido de punta a punta contra el gateway, el core, el tiempo real y la web reales (con los datos de ejemplo cargados).
 * Si los servidores ya están corriendo (npm start), se reutilizan.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    // Cámara y micrófono simulados para probar llamadas reales por WebRTC.
    permissions: ['microphone', 'camera'],
    launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] },
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'], permissions: ['microphone', 'camera'] }, testIgnore: /responsive.spec.ts/ },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  // Un solo comando levanta los cuatro procesos (web, gateway, core y tiempo real).
  webServer: {
    command: 'node scripts/start.mjs',
    cwd: '../..',
    // Estos recorridos cobran el delivery dentro del QR (el modo anterior). Para probar el delivery contra entrega, levanta
    // el stack aparte (npm start) con DELIVERY_PAY_ON_ARRIVAL=true.
    env: { ...(process.env as Record<string, string>), DELIVERY_PAY_ON_ARRIVAL: process.env.DELIVERY_PAY_ON_ARRIVAL ?? 'false' },
    url: `${API_URL}/gateway/health`,
    reuseExistingServer: true,
    timeout: 300_000,
  },
});
