import { expect, test, type Browser, type Page } from '@playwright/test';
import { login, openSession, PASSWORD } from './helpers';

/** Sesión con ubicación simulada (como el GPS del celular del repartidor). */
async function openWithLocation(browser: Browser, identifier: string, location: { latitude: number; longitude: number }) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 860 }, permissions: ['geolocation'], geolocation: location });
  const page = await context.newPage();
  await login(page, identifier, PASSWORD);
  return { context, page };
}

const api = async (page: Page) => {
  const token = await page.evaluate(() => localStorage.getItem('parla.token'));
  return { authorization: `Bearer ${token}` };
};

test.describe('Repartidores de Rapidito', () => {
  test('alta, perfil, conectarse, cambiar de vehículo y dejar de repartir (y volver)', async ({ browser }) => {
    const andres = await openSession(browser, 'andres');
    const page = andres.page;

    await page.goto('/app/pedidos');
    await page.getByTestId('become-driver').click();
    await expect(page.getByRole('heading', { name: 'Trabaja con Rapidito' })).toBeVisible();
    await page.getByRole('radio', { name: 'Moto' }).click();
    await page.getByLabel('Placa').fill('x');
    await page.getByTestId('register-driver').click();
    await expect(page.getByRole('alert')).toContainText('placa');
    await page.getByLabel('Placa').fill('abc-123');
    await page.getByTestId('register-driver').click();

    // Recién registrado queda desconectado: no ve pedidos hasta conectarse
    await expect(page.getByRole('heading', { name: 'Rapidito' })).toBeVisible();
    await expect(page.getByRole('switch', { name: /Desconectado/ })).toBeVisible();
    await page.getByRole('switch', { name: /Desconectado/ }).click();
    await expect(page.getByRole('switch', { name: /Conectado/ })).toHaveAttribute('aria-checked', 'true');

    // Perfil: ganancias en cero, cambiar a bicicleta (sin placa)
    await page.getByTestId('driver-profile-link').click();
    await expect(page.getByTestId('driver-earnings')).toContainText('S/ 0.00');
    await page.getByRole('radio', { name: 'Bicicleta' }).click();
    await page.getByTestId('save-vehicle').click();
    await expect(page.getByTestId('save-vehicle')).toBeHidden();
    await page.goto('/app/rapidito');
    await expect(page.getByText('Repartidor · Bicicleta')).toBeVisible();

    // Dejar de repartir: vuelve la invitación y puede registrarse de nuevo
    await page.getByTestId('driver-profile-link').click();
    await page.getByTestId('leave-driver').click();
    await page.getByTestId('confirm-leave').click();
    await expect(page).toHaveURL(/\/app\/pedidos$/);
    await expect(page.getByTestId('become-driver')).toBeVisible();

    expect(andres.consoleErrors.filter((e) => !e.includes('status of 400'))).toEqual([]);
    await andres.context.close();
  });

  test('mapa en vivo: la clienta y la tienda siguen al repartidor mientras se mueve', async ({ browser }) => {
    test.setTimeout(120_000);
    const laura = await openSession(browser, 'laura');
    const headers = await api(laura.page);
    const [rice] = await (await laura.page.request.get('/api/services/mercado/products?q=arroz', { headers })).json();
    const created = await laura.page.request.post('/api/services/mercado/orders', {
      headers,
      data: {
        items: [{ productId: rice.id, quantity: 1 }],
        address: { line: 'Calle Berlín 300, Miraflores', reference: 'Casa blanca', location: { lat: -12.1191, lng: -77.0349 } },
      },
    });
    expect(created.ok()).toBe(true);
    const order = await created.json();
    expect((await laura.page.request.post(order.payment.payUrl, { headers: { accept: 'application/json' } })).ok()).toBe(true);

    const elena = await openSession(browser, 'tienda');
    const owner = await api(elena.page);
    await expect.poll(async () => (await elena.page.request.post(`/api/business/orders/${order.id}/accept`, { headers: owner })).status()).toBe(200);
    expect((await elena.page.request.post(`/api/business/orders/${order.id}/ready`, { headers: owner })).ok()).toBe(true);

    // Lucía está a unas cuadras de la tienda y toma el pedido: su celular empieza a compartir ubicación
    const lucia = await openWithLocation(browser, 'repartidora', { latitude: -12.1301, longitude: -77.0222 });
    // Si una corrida anterior la dejó con un pedido tomado, lo suelta (una entrega a la vez).
    const luciaHeaders = await api(lucia.page);
    const { mine } = await (await lucia.page.request.get('/api/driver/orders', { headers: luciaHeaders })).json();
    for (const o of mine.filter((x: { status: string }) => x.status === 'driver_assigned')) {
      await lucia.page.request.post(`/api/driver/orders/${o.id}/release`, { headers: luciaHeaders });
    }
    await lucia.page.goto(`/app/rapidito/pedidos/${order.id}`);
    await lucia.page.getByTestId('take-order').click();
    await expect(lucia.page.getByTestId('sharing-note')).toHaveAttribute('data-sharing', 'sharing', { timeout: 15_000 });
    await expect(lucia.page.getByTestId('delivery-map')).toBeVisible();

    // La clienta ve el mapa, cuánto falta y la hora estimada; la tienda, qué tan cerca está
    await laura.page.goto(`/app/pedidos/${order.id}`);
    await expect(laura.page.getByTestId('live-tracking')).toBeVisible();
    await expect(laura.page.getByTestId('driver-distance')).toContainText('Faltan', { timeout: 15_000 });
    await expect(laura.page.getByTestId('eta')).toContainText('Llega aprox. a las');
    await elena.page.goto(`/app/negocio/pedidos/${order.id}`);
    await expect(elena.page.getByTestId('driver-distance')).toContainText('de tu tienda', { timeout: 15_000 });

    // Lucía llega a la tienda: la distancia se actualiza en vivo
    const before = await elena.page.getByTestId('driver-distance').textContent();
    await lucia.context.setGeolocation({ latitude: -12.1269, longitude: -77.0196 });
    await expect(elena.page.getByTestId('driver-distance')).not.toHaveText(before!, { timeout: 20_000 });
    await expect(elena.page.getByTestId('driver-distance')).toContainText(/[0-9]+ m de tu tienda/);

    // Termina la entrega para dejar a Lucía libre
    await elena.page.getByTestId('handoff-order').click();
    const code = (await (await laura.page.request.get(`/api/orders/${order.id}`, { headers })).json()).deliveryCode;
    expect((await lucia.page.request.post(`/api/driver/orders/${order.id}/deliver`, { headers: luciaHeaders, data: { code } })).ok()).toBe(true);

    for (const c of [laura.context, elena.context, lucia.context]) await c.close();
  });
});
