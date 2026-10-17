import { expect, test } from '@playwright/test';
import { openChat, openSession, registerNewUser } from './helpers';

const NEW_PASSWORD = 'Recupere2026';

test('recupera la cuenta con el correo y Andrés le vuelve a compartir el chat cifrado', async ({ browser }) => {
  test.setTimeout(150_000);
  const suffix = Date.now().toString(36);
  const name = `Rosa ${suffix}`;
  const email = `rosa.${suffix}@example.com`;
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await context.newPage();

  // Rosa se registra, agrega su correo y le escribe a Andrés
  await registerNewUser(page, name);
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByLabel('Código del correo').fill((await page.getByTestId('dev-code').locator('strong').textContent())!);
  await expect(page.getByTestId('verified-email')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Entrar a Parla' }).click();
  await page.getByRole('button', { name: 'Nuevo chat' }).click();
  await page.getByLabel('Buscar personas').fill('Andrés');
  await page.getByRole('button', { name: /Andrés Rojas/ }).click();
  await page.getByLabel('Escribe un mensaje').fill('Mensaje secreto antes de olvidar la clave');
  await page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(page.getByTestId('message').filter({ hasText: 'Mensaje secreto' })).toBeVisible();

  // Cierra sesión y olvida la contraseña
  await page.goto('/app/ajustes');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Cerrar sesión' }).click();
  await expect(page).toHaveURL(/\/entrar/);
  await page.getByRole('link', { name: '¿Olvidaste tu contraseña?' }).click();
  await page.getByLabel('Correo').fill(email);
  await page.getByRole('button', { name: 'Enviarme el código' }).click();
  await page.getByLabel('Código del correo').fill((await page.getByTestId('dev-code').locator('strong').textContent())!);
  await page.getByLabel('Contraseña nueva').fill(NEW_PASSWORD);
  await page.getByRole('button', { name: 'Guardar y entrar' }).click();
  await expect(page.getByTestId('chat-list')).toBeVisible();

  // Con claves nuevas, el chat queda bloqueado hasta que alguien se lo vuelva a compartir
  await openChat(page, 'Andrés Rojas');
  await expect(page.getByTestId('key-waiting')).toBeVisible();

  // Andrés ve el aviso de cambio de clave y decide compartirle el chat
  const andres = await openSession(browser, 'andres');
  await openChat(andres.page, name);
  await expect(andres.page.getByText(`${name} restableció su cuenta y cambió su clave de seguridad`).first()).toBeVisible();
  await andres.page.getByTestId('key-reshare').getByRole('button', { name: 'Compartir el chat' }).click();
  await expect(andres.page.getByTestId('key-reshare')).toBeHidden();

  // Rosa vuelve a leer el historial sin recargar
  await expect(page.getByTestId('key-waiting')).toBeHidden({ timeout: 15_000 });
  await expect(page.getByTestId('message').filter({ hasText: 'Mensaje secreto antes de olvidar la clave' })).toBeVisible();

  // Y entra con la contraseña nueva
  expect(andres.consoleErrors).toEqual([]);
  await context.close();
  await andres.context.close();
});
