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

  // Ajustes se abre desde el menú ☰: la barra inferior es Chats, Servicios, Ofertas y Delivery (no se repiten en el menú)
  await page.getByRole('button', { name: 'Abrir menú' }).first().click();
  const menu = page.getByRole('dialog', { name: 'Menú' });
  await expect(menu.getByRole('link', { name: 'Mis pedidos' })).toBeVisible();
  await expect(menu.getByRole('link', { name: 'Servicios' })).toBeHidden();
  await menu.getByRole('link', { name: 'Todos los ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  // Cada sección abre su propia pantalla, sin la barra inferior, y se vuelve con la flecha
  await page.getByRole('link', { name: 'Perfil' }).click();
  await expect(page.getByRole('heading', { name: 'Perfil' })).toBeVisible();
  await expect(page.getByLabel('Nombre', { exact: true })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Navegación principal' })).toBeHidden();
  await page.getByRole('link', { name: 'Volver a Ajustes' }).click();
  await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
  await page.getByRole('link', { name: 'Servicios' }).click();
  await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible();
  // Las categorías están en el menú ☰ junto al buscador.
  await page.getByTestId('category-menu').click();
  await expect(page.getByTestId('service-mercado')).toBeVisible();
  await page.keyboard.press('Escape');

  const nav = page.getByRole('navigation', { name: 'Navegación principal' });
  await nav.getByRole('link', { name: 'Ofertas' }).click();
  await expect(page.getByRole('heading', { name: 'Ofertas' })).toBeVisible();
  await expect(page.getByTestId('offers-mercado').getByTestId('product').first()).toBeVisible();
  await expect(page.getByTestId('offers-restaurantes')).toBeVisible();
  await expect(page.getByTestId('offers-salud')).toBeVisible();
  await nav.getByRole('link', { name: 'Delivery' }).click();
  await expect(page.getByRole('heading', { name: 'Delivery' })).toBeVisible();
});
