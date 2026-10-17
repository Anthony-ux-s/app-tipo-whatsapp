import { expect, test, type Page } from '@playwright/test';
import { openSession, testJpeg, unique } from './helpers';

const auth = async (page: Page) => ({ authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('parla.token'))}` });

test.describe('Entrega con foto y reclamos con devolución parcial', () => {
  test('el cliente no responde: se deja con foto; luego reclama lo que faltó y soporte le devuelve una parte', async ({ browser }) => {
    test.setTimeout(150_000);
    const laura = await openSession(browser, 'laura');
    const headers = await auth(laura.page);
    const [rice] = await (await laura.page.request.get('/api/services/mercado/products?q=arroz', { headers })).json();
    const created = await laura.page.request.post('/api/services/mercado/orders', {
      headers,
      data: { items: [{ productId: rice.id, quantity: 2 }], address: { line: 'Calle Berlín 300, Miraflores', reference: 'Casa blanca', location: { lat: -12.1191, lng: -77.0349 } } },
    });
    expect(created.ok()).toBe(true);
    const order = await created.json();
    // La tarifa depende de la distancia de la tienda a la casa
    expect(order.deliveryFeeCents).toBeGreaterThanOrEqual(400);
    expect((await laura.page.request.post(order.payment.payUrl, { headers: { accept: 'application/json' } })).ok()).toBe(true);

    const elena = await openSession(browser, 'tienda');
    const owner = await auth(elena.page);
    await expect.poll(async () => (await elena.page.request.post(`/api/business/orders/${order.id}/accept`, { headers: owner })).status()).toBe(200);
    expect((await elena.page.request.post(`/api/business/orders/${order.id}/ready`, { headers: owner })).ok()).toBe(true);

    // Carlos (a una cuadra de la tienda) lo ve en la primera oleada, con la distancia
    const carlos = await openSession(browser, 'repartidor');
    const driver = await auth(carlos.page);
    const { mine } = await (await carlos.page.request.get('/api/driver/orders', { headers: driver })).json();
    for (const o of mine.filter((x: { status: string }) => x.status === 'driver_assigned')) {
      await carlos.page.request.post(`/api/driver/orders/${o.id}/release`, { headers: driver });
    }
    await expect
      .poll(async () => ((await (await carlos.page.request.get('/api/driver/orders', { headers: driver })).json()).available as { id: string }[]).some((o) => o.id === order.id), { timeout: 20_000 })
      .toBe(true);
    await carlos.page.goto(`/app/rapidito`);
    await expect(carlos.page.getByTestId('distance-to-store').first()).toContainText('de ti');
    await carlos.page.goto(`/app/rapidito/pedidos/${order.id}`);
    await carlos.page.getByTestId('take-order').click();
    await expect(carlos.page.getByTestId('release-order')).toBeVisible();
    expect((await elena.page.request.post(`/api/business/orders/${order.id}/handoff`, { headers: owner })).ok()).toBe(true);

    // Laura no responde: Carlos lo deja con una foto
    await expect(carlos.page.getByTestId('toggle-no-answer')).toBeVisible({ timeout: 15_000 });
    await carlos.page.getByTestId('toggle-no-answer').click();
    await carlos.page.getByTestId('deliver-order').click();
    await expect(carlos.page.getByRole('alert')).toContainText('Toma una foto');
    await carlos.page.getByTestId('delivery-photo-input').setInputFiles(await testJpeg(carlos.page));
    await expect(carlos.page.getByAltText('Foto elegida')).toBeVisible();
    await carlos.page.getByTestId('deliver-order').click();
    await expect(carlos.page.getByTestId('delivery-proof')).toContainText('dejado con foto');

    // Laura y la tienda ven la foto
    await laura.page.goto(`/app/pedidos/${order.id}`);
    await expect(laura.page.getByTestId('delivery-photo')).toContainText('el repartidor dejó tu pedido');
    await expect(laura.page.getByTestId('delivery-photo').getByTestId('private-photo')).toBeVisible();
    await elena.page.goto(`/app/negocio/pedidos/${order.id}`);
    await expect(elena.page.getByTestId('delivery-proof')).toContainText('Dejado sin código');
    await expect(elena.page.getByTestId('private-photo')).toBeVisible();

    // Faltó un arroz: reclama con foto
    const comment = unique('Llegó un solo arroz');
    await laura.page.getByTestId('open-claim').click();
    await laura.page.getByRole('radio', { name: 'Faltaron productos' }).click();
    await laura.page.getByRole('button', { name: `Más ${rice.name}` }).click();
    await expect(laura.page.getByTestId('claim-suggested')).toContainText(`S/ ${(rice.priceCents / 100).toFixed(2)}`);
    await laura.page.getByLabel('Comentario (opcional)').fill(comment);
    await laura.page.getByTestId('claim-photo').setInputFiles(await testJpeg(laura.page));
    await expect(laura.page.getByAltText('Foto elegida')).toBeVisible();
    await laura.page.getByTestId('send-claim').click();
    await expect(laura.page.getByTestId('claim-status')).toHaveAttribute('data-status', 'open');
    await expect(laura.page.getByTestId('open-claim')).toBeHidden();
    await elena.page.reload();
    await expect(elena.page.getByTestId('business-claim')).toContainText(comment);

    // Soporte devuelve S/ 1.00 (menos de lo sugerido) con PagaYa
    const soporte = await openSession(browser, 'soporte');
    await soporte.page.goto('/app/admin');
    await soporte.page.getByTestId('admin-tab-reclamos').click();
    const card = soporte.page.getByTestId('admin-claim').filter({ hasText: comment });
    await expect(card).toContainText('entregado sin código');
    await card.getByRole('button', { name: 'Ver fotos' }).click();
    await expect(card.getByTestId('private-photo')).toHaveCount(2);
    await card.getByTestId('refund-amount').fill('1.00');
    await card.getByTestId('refund-claim').click();
    await expect(card).toBeHidden();

    // Laura lo ve devuelto, en vivo
    await expect(laura.page.getByTestId('claim-status')).toHaveAttribute('data-status', 'refunded', { timeout: 15_000 });
    await expect(laura.page.getByTestId('claim-status')).toContainText('Te devolvimos S/ 1.00');

    for (const c of [laura.context, elena.context, carlos.context, soporte.context]) await c.close();
  });
});
