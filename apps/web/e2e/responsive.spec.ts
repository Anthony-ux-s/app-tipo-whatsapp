import { expect, test } from '@playwright/test';
import { login } from './helpers';

test('en el celular la lista ocupa la pantalla y el chat se abre a pantalla completa con botón de volver', async ({ page }) => {
  await login(page, 'andres');
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeVisible();

  await page.getByTestId('chat-item').filter({ hasText: 'General' }).click();
  await expect(page.getByTestId('chat-list')).toBeHidden();
  await expect(page.getByTestId('message').first()).toBeVisible();

  await page.getByRole('button', { name: 'Volver a los chats' }).click();
  await expect(page.getByTestId('chat-list')).toBeVisible();

  await page.getByRole('link', { name: 'Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  // Cada sección abre su propia pantalla, sin la barra inferior, y se vuelve con la flecha
  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible();
  await expect(page.getByLabel('Nombre')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden();
  await page.getByRole('link', { name: 'Volver a Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await page.getByRole('link', { name: 'Servicios' }).click();
  await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible();
  await expect(page.getByTestId('service-mercado')).toBeVisible();
});
