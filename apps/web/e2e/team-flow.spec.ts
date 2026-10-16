import { expect, test } from '@playwright/test';
import { openChat, openSession, PASSWORD } from './helpers';

test('un colaborador nuevo se registra, se une con el enlace y la administradora gestiona su rol', async ({ browser }) => {
  const username = `nuevo${Date.now().toString(36)}`;
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  // El enlace de invitación pide sesión y vuelve a la invitación después del registro
  await page.goto('/invitacion/andino2026');
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByRole('link', { name: 'Créala gratis' }).click();
  await page.getByLabel('Tu nombre').fill('Martina Prueba');
  await page.getByLabel('Nombre de usuario').fill(username);
  await page.getByLabel('Contraseña').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Crear cuenta' }).click();

  await expect(page.getByRole('heading', { name: 'Café Andino' })).toBeVisible();
  await page.getByRole('button', { name: 'Unirme al espacio' }).click();
  await expect(page.getByTestId('chat-list').or(page.getByText('¿No tienes chats aún?'))).toBeVisible();

  // Escribe a la administradora desde el directorio del equipo
  await page.goto(page.url().replace(/\/app\/w\/([^/]+).*/, '/app/w/$1/equipo'));
  await page.getByRole('button', { name: 'Escribir a Laura Méndez' }).click();
  await page.getByLabel('Escribe un mensaje').fill('Hola Laura, ya estoy en Parla 👋');
  await page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(page.getByTestId('message').filter({ hasText: 'ya estoy en Parla' })).toBeVisible();

  // Laura recibe el chat nuevo y, como administradora, la asciende
  const laura = await openSession(browser, 'laura');
  await openChat(laura.page, 'Martina Prueba');
  await expect(laura.page.getByTestId('message').filter({ hasText: 'ya estoy en Parla' })).toBeVisible();
  await laura.page.goto(laura.page.url().replace(/\/c\/.*/, '/equipo'));
  await laura.page.getByLabel('Rol de Martina Prueba').selectOption('admin');
  await expect(laura.page.getByText('Rol actualizado')).toBeVisible();

  // Martina ve su nuevo rol sin recargar
  await page.goto(page.url().replace(/\/c\/.*/, ''));
  await expect(page.getByText('Martina Prueba · Administrador')).toBeVisible();

  expect(errors).toEqual([]);
  expect(laura.consoleErrors).toEqual([]);
  await context.close();
  await laura.context.close();
});
