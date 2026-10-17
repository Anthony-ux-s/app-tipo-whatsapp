import { expect, test } from '@playwright/test';
import { openChat, openSession, PASSWORD } from './helpers';

test('una persona nueva se registra, encuentra a Laura en Parla y conversan en tiempo real', async ({ browser }) => {
  const suffix = Date.now().toString(36);
  const username = `nuevo${suffix}`;
  const name = `Martina ${suffix}`;
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/registro');
  await page.getByLabel('Tu nombre').fill(name);
  await page.getByLabel('Nombre de usuario').fill(username);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  // Como en WhatsApp: entra directo, sin crear ni unirse a ningún espacio
  await expect(page.getByText('¿No tienes chats aún?')).toBeVisible();
  await page.getByRole('button', { name: 'Nuevo chat' }).click();
  await page.getByLabel('Buscar personas').fill('Laura');
  await page.getByRole('button', { name: /Laura Méndez/ }).click();
  await page.getByLabel('Escribe un mensaje').fill('Hola Laura, ya estoy en Parla 👋');
  await page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(page.getByTestId('message').filter({ hasText: 'ya estoy en Parla' })).toBeVisible();

  // Laura recibe el chat nuevo y responde; Martina lo ve sin recargar
  const laura = await openSession(browser, 'laura');
  await openChat(laura.page, name);
  await expect(laura.page.getByTestId('message').filter({ hasText: 'ya estoy en Parla' })).toBeVisible();
  await laura.page.getByLabel('Escribe un mensaje').fill('¡Bienvenida, Martina!');
  await laura.page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(page.getByTestId('message').filter({ hasText: '¡Bienvenida, Martina!' })).toBeVisible();

  expect(errors).toEqual([]);
  expect(laura.consoleErrors).toEqual([]);
  await context.close();
  await laura.context.close();
});
