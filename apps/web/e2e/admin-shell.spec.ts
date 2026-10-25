import { expect, test } from '@playwright/test';
import { PASSWORD, login } from './helpers';

const API = process.env.PARLA_API_URL ?? 'http://localhost:4100';

test.describe('Administración: menú lateral y reglas de la cuenta de soporte', () => {
  test('soporte aterriza en su panel con menú lateral, navega por secciones y puede plegarlo', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page, 'soporte');
    await expect(page.getByTestId('admin-shell')).toBeVisible();
    await expect(page).toHaveURL(/\/app\/admin\/pedidos$/);
    // No es un usuario más: no hay lista de chats.
    await expect(page.getByTestId('chat-list')).toHaveCount(0);

    const sidebar = page.getByRole('complementary', { name: 'Panel de soporte' });
    await expect(sidebar).toBeVisible();
    await expect(sidebar.getByText('Administración')).toBeVisible();
    for (const id of ['pedidos', 'trafico', 'personas', 'repartidores', 'tiendas', 'tarifas', 'cupones', 'marketing', 'reclamos']) {
      await expect(page.getByTestId(`admin-tab-${id}`)).toBeVisible();
    }

    await page.getByTestId('admin-tab-tiendas').click();
    await expect(page).toHaveURL(/\/app\/admin\/tiendas$/);
    await expect(page.getByRole('heading', { name: 'Tiendas' })).toBeVisible();
    await page.getByTestId('admin-tab-reclamos').click();
    await expect(page.getByRole('heading', { name: 'Reclamos' })).toBeVisible();

    // Plegar: quedan solo los íconos y se recuerda al recargar.
    const width = async () => (await sidebar.boundingBox())!.width;
    expect(await width()).toBeGreaterThan(240);
    await page.getByRole('button', { name: 'Plegar el menú lateral' }).click();
    await expect.poll(width).toBeLessThan(90);
    await page.reload();
    await expect(page.getByRole('complementary', { name: 'Panel de soporte' })).toBeVisible();
    expect(await width()).toBeLessThan(90);
    await page.getByRole('button', { name: 'Abrir el menú lateral' }).click();
    await expect.poll(width).toBeGreaterThan(240);
  });

  test('soporte no entra a las pantallas de usuario: chats, mercado, pedidos o negocio lo llevan a su panel', async ({ page }) => {
    await login(page, 'soporte');
    for (const route of ['/app', '/app/servicios', '/app/pedidos', '/app/negocio', '/app/rapidito']) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/app\/admin\/pedidos$/);
    }
    // Los ajustes sí son suyos.
    await page.getByRole('link', { name: 'Ajustes' }).click();
    await expect(page).toHaveURL(/\/app\/ajustes$/);
  });

  test('en el celular el administrador conserva la app de siempre, con la barra de abajo y la rejilla de secciones', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await login(page, 'soporte');
    // Sin menú lateral: lista de chats y barra inferior (Chats, Servicios, Ofertas, Delivery).
    await expect(page.getByTestId('admin-shell')).toHaveCount(0);
    await expect(page.getByRole('complementary', { name: 'Panel de soporte' })).toHaveCount(0);
    const bottom = page.getByRole('navigation', { name: 'Navegación principal' });
    await expect(bottom).toBeVisible();
    for (const name of ['Chats', 'Servicios', 'Ofertas', 'Delivery']) {
      await expect(bottom.getByRole('link', { name })).toBeVisible();
    }
    // El menú es una lista compacta y, para soporte, sin tienda ni reparto (eso es solo de los clientes).
    await page.getByRole('button', { name: 'Abrir menú' }).first().click();
    const tiles = page.getByTestId('menu-tiles');
    await expect(tiles.getByRole('link', { name: 'Mis pedidos' })).toBeVisible();
    await expect(tiles.getByRole('link', { name: 'Administración' })).toBeVisible();
    for (const name of ['Mi negocio', 'Abrir mi tienda', 'Rapidito', 'Mis rutas']) {
      await expect(tiles.getByRole('link', { name })).toHaveCount(0);
    }
    const rows = await tiles.getByRole('link').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()));
    expect(Math.max(...rows.map((r) => r.height))).toBeLessThan(56);
    await page.getByRole('button', { name: 'Cerrar menú' }).last().click();
    // Las pantallas de tienda y reparto lo devuelven a su inicio.
    for (const route of ['/app/negocio', '/app/negocio/abrir', '/app/rapidito/registro']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { name: /Abrir mi tienda|Trabaja con Rapidito/ })).toHaveCount(0);
      await expect(page).toHaveURL(/\/app$/);
    }
    // El panel de soporte se abre con su rejilla de secciones arriba.
    await page.goto('/app/admin');
    await page.getByTestId('admin-tab-cupones').click();
    await expect(page).toHaveURL(/\/app\/admin\/cupones$/);
    await expect(page.getByRole('tab', { name: /Cupones/ })).toHaveAttribute('aria-selected', 'true');
  });

  test('el servidor rechaza que soporte abra una tienda o se registre como repartidor', async ({ request }) => {
    const auth = await request.post(`${API}/api/auth/login`, { data: { identifier: 'soporte', password: PASSWORD } });
    const { token } = (await auth.json()) as { token: string };
    const headers = { authorization: `Bearer ${token}` };

    const store = await request.post(`${API}/api/stores`, {
      headers,
      data: { name: 'Tienda de soporte', service: 'mercado', description: 'x', address: 'Av. Benavides 1180, Miraflores', phone: '+51999111222' },
    });
    expect(store.status()).toBe(403);
    expect(((await store.json()) as { message: string }).message).toContain('no pueden abrir una tienda');

    const driver = await request.post(`${API}/api/driver`, {
      headers,
      data: { vehicle: 'Moto', plate: 'ABC-123', dniNumber: '45678912', licenseNumber: 'q12345678' },
    });
    expect(driver.status()).toBe(403);
  });
});
