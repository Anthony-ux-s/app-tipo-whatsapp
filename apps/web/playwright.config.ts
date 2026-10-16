import { defineConfig, devices } from '@playwright/test';

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
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'escritorio', use: { ...devices['Desktop Chrome'] }, testIgnore: /responsive.spec.ts/ },
    { name: 'celular', use: { ...devices['Pixel 7'] }, testMatch: /responsive\.spec\.ts/ },
  ],
  webServer: [
    {
      command: 'npm run start -w @parla/api',
      cwd: '../..',
      url: 'http://localhost:4100/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'npm run dev -w @parla/web',
      cwd: '../..',
      url: 'http://localhost:3100',
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
