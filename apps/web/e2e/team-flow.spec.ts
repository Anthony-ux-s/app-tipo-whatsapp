import { expect, test } from '@playwright/test';
import { openChat, openSession, registerNewUser } from './helpers';

/** PNG de 1×1: el navegador lo recorta y lo convierte en JPEG de 512×512 antes de subirlo. */
const PHOTO = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

test('registro con código por SMS, foto, correo de recuperación y contactos del teléfono', async ({ browser }) => {
  test.setTimeout(120_000);
  const suffix = Date.now().toString(36);
  const name = `Martina ${suffix}`;
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  // Libreta del teléfono simulada (Contact Picker API, como en Chrome para Android)
  await context.addInitScript(() => {
    Object.defineProperty(window, 'ContactsManager', { value: function ContactsManager() {} });
    Object.defineProperty(navigator, 'contacts', {
      value: {
        select: async () => [
          { name: ['Laurita'], tel: ['+57 310 456 7890'] },
          { name: ['Andrés trabajo'], tel: ['300 555 0101'] },
          { name: ['Tía Rosa'], tel: ['300 000 0000'] },
        ],
      },
    });
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await registerNewUser(page, name);

  // Bienvenida 1/2: foto de perfil y correo verificado con código
  await page.getByTestId('avatar-input').setInputFiles({ name: 'yo.png', mimeType: 'image/png', buffer: PHOTO });
  await expect(page.getByRole('button', { name: 'Cambiar foto de perfil' }).locator('img')).toHaveAttribute('src', /\/api\/avatars\/av[a-f0-9]{32}$/);
  await page.getByLabel('Correo').fill(`martina.${suffix}@example.com`);
  await page.getByRole('button', { name: 'Enviar código' }).click();
  await page.getByLabel('Código del correo').fill((await page.getByTestId('dev-code').locator('strong').textContent())!);
  await expect(page.getByTestId('verified-email')).toHaveText(`martina.${suffix}@example.com`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  // Bienvenida 2/2: quiénes de la libreta ya están en Parla (Laura y Andrés; la tía todavía no)
  await page.getByRole('button', { name: 'Buscar mis contactos' }).click();
  const found = page.getByTestId('contacts-found');
  await expect(found).toContainText('2 de tus contactos están en Parla');
  await expect(found).toContainText('Laurita');
  await expect(found).toContainText('Andrés trabajo');
  await found.locator('li', { hasText: 'Laurita' }).getByRole('button', { name: 'Escribir' }).click();
  await expect(page).toHaveURL(/\/app\/c\//);
  await page.getByLabel('Escribe un mensaje').fill('Hola Laura, ya estoy en Parla 👋');
  await page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(page.getByTestId('message').filter({ hasText: 'ya estoy en Parla' })).toBeVisible();

  // Laura recibe el chat con la foto de Martina y responde en tiempo real
  const laura = await openSession(browser, 'laura');
  await openChat(laura.page, name);
  await expect(laura.page.getByTestId('conversation-title')).toHaveText(name);
  await expect(laura.page.locator('header img[src^="/api/avatars/"]')).toBeVisible();
  await laura.page.getByLabel('Escribe un mensaje').fill('¡Bienvenida, Martina!');
  await laura.page.getByLabel('Escribe un mensaje').press('Enter');
  await expect(page.getByTestId('message').filter({ hasText: '¡Bienvenida, Martina!' })).toBeVisible();

  // El usuario es opcional y se pone después en Ajustes
  await page.goto('/app/ajustes/perfil');
  await page.getByLabel('Nombre de usuario (opcional)').fill(`martina${suffix}`);
  await page.getByRole('button', { name: 'Guardar cambios' }).click();
  await expect(page.getByText('Perfil actualizado')).toBeVisible();

  expect(errors).toEqual([]);
  expect(laura.consoleErrors).toEqual([]);
  await context.close();
  await laura.context.close();
});
