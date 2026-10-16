import { expect, type Browser, type Page } from '@playwright/test';

export const PASSWORD = 'Parla2026!';

/** Abre un navegador aparte (otra persona) y guarda los errores de consola para revisarlos al final. */
export async function openSession(browser: Browser, identifier: string, viewport = { width: 1366, height: 860 }) {
  const context = await browser.newContext({ viewport, permissions: ['microphone', 'camera'] });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on('console', (msg) => msg.type() === 'error' && consoleErrors.push(msg.text()));
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  await login(page, identifier);
  return { context, page, consoleErrors };
}

export async function login(page: Page, identifier: string, password = PASSWORD) {
  await page.goto('/entrar');
  await page.getByLabel('Usuario o teléfono').fill(identifier);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await expect(page.getByTestId('chat-list')).toBeVisible();
}

export async function openChat(page: Page, title: string) {
  await page.getByTestId('chat-item').filter({ hasText: title }).first().click();
  await expect(page.getByTestId('conversation-title')).toHaveText(title);
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;
