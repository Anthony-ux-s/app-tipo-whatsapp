import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.PARLA_WEB_URL ?? 'http://localhost:3100';
const API_URL = process.env.PARLA_API_URL ?? 'http://localhost:4100';

/**
 * Recorrido de punta a punta contra la API y la web reales (con los datos de ejemplo cargados).
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
  webServer: [
    {
      command: 'npm run start -w @parla/api',
      cwd: '../..',
      url: `${API_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @parla/web',
      cwd: '../..',
      url: WEB_URL,
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
