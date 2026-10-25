import { expect, test, type Page } from '@playwright/test';
import { openSession } from './helpers';

const auth = async (page: Page) => ({ authorization: `Bearer ${await page.evaluate(() => localStorage.getItem('parla.token'))}` });

test.describe('Cupones, volver a pedir y soporte de pedidos', () => {
  test('soporte crea un cupón; la clienta repite un pedido con cupón; soporte lo cancela y el cupón queda libre', async ({ browser }) => {
    test.setTimeout(150_000);
    const code = `E2E${Date.now().toString(36).toUpperCase().slice(-6)}`;

    // Soporte crea un cupón de S/ 2.00
    const soporte = await openSession(browser, 'soporte');
    await soporte.page.goto('/app/admin');
    await soporte.page.getByTestId('admin-tab-cupones').click();
    await soporte.page.getByTestId('new-coupon').click();
    await soporte.page.getByTestId('coupon-code').fill(code);
    await soporte.page.getByTestId('coupon-description').fill('S/ 2 de descuento de prueba');
    await soporte.page.getByRole('radio', { name: 'Monto fijo' }).click();
    await soporte.page.getByTestId('coupon-value').fill('2.00');
    await soporte.page.getByTestId('save-coupon').click();
    const coupon = soporte.page.getByTestId('admin-coupon').filter({ hasText: code });
    await expect(coupon).toContainText('Usado 0 veces');

    // Laura repite un pedido entregado: el carrito se arma solo con la misma dirección
    const laura = await openSession(browser, 'laura');
    const headers = await auth(laura.page);
    // Un pedido anterior que no siguió (cancelado): se vuelve a pedir tal cual
    const [rice] = await (await laura.page.request.get('/api/services/mercado/products?q=arroz', { headers })).json();
    const before = await laura.page.request.post('/api/services/mercado/orders', {
      headers,
      data: { items: [{ productId: rice.id, quantity: 2 }], address: { line: 'Av. Pardo 610, Miraflores', reference: 'Edificio azul' } },
    });
    const delivered = await before.json();
    expect((await laura.page.request.post(`/api/orders/${delivered.id}/cancel`, { headers })).ok()).toBe(true);
    await laura.page.goto(`/app/pedidos/${delivered.id}`);
    await laura.page.getByTestId('reorder').click();
    await expect(laura.page).toHaveURL(/\/carrito$/);
    await expect(laura.page.getByTestId('cart-line').first()).toBeVisible();
    await laura.page.getByTestId('step-next').click();
    await expect(laura.page.getByLabel('Dirección', { exact: true })).toHaveValue(delivered.address.line);

    await expect(laura.page.getByTestId('delivery-step-quote')).toContainText('Delivery Rapidito', { timeout: 15_000 });
    await laura.page.getByTestId('step-next').click();

    // Un código que no existe no frena la compra; el bueno descuenta S/ 2.00
    const quote = laura.page.getByTestId('quote');
    await expect(quote).toContainText('Total a pagar', { timeout: 15_000 });
    await laura.page.getByTestId('coupon-input').fill('NOEXISTE');
    await laura.page.getByTestId('apply-coupon').click();
    await expect(laura.page.getByRole('alert').filter({ hasText: 'Ese cupón no existe' })).toBeVisible();
    await expect(quote).toContainText('Total a pagar');
    await laura.page.getByTestId('coupon-input').fill(code.toLowerCase());
    await laura.page.getByTestId('apply-coupon').click();
    await expect(laura.page.getByTestId('coupon-applied')).toContainText(code);
    await expect(quote).toContainText(`Cupón ${code}`);
    await expect(quote).toContainText('− S/ 2.00');
    await laura.page.getByRole('button', { name: /Pagar S\/ .* con QR/ }).click();
    await expect(laura.page).toHaveURL(/\/app\/pedidos\/ord_/);
    const orderId = laura.page.url().split('/').pop()!;
    await expect(laura.page.getByText(`Cupón ${code}`)).toBeVisible();

    // El uso se cuenta (la pestaña vuelve a pedir la lista)
    await soporte.page.getByTestId('admin-tab-pedidos').click();
    await soporte.page.getByTestId('admin-tab-cupones').click();
    await expect(soporte.page.getByTestId('admin-coupon').filter({ hasText: code })).toContainText('Usado 1 vez');

    // Soporte encuentra el pedido y lo cancela (sin pagar: se anula el cobro)
    await soporte.page.getByTestId('admin-tab-pedidos').click();
    await soporte.page.getByTestId('admin-order-search').fill(orderId);
    const card = soporte.page.getByTestId('admin-order').filter({ hasText: orderId });
    await expect(card).toContainText(`cupón ${code}`);
    await card.getByTestId('admin-cancel-order').click();
    await soporte.page.getByTestId('confirm-admin-cancel').click();
    // Sale de «En curso» y aparece en «Cancelados»
    await expect(card).toBeHidden();
    await soporte.page.getByRole('button', { name: 'Cancelados' }).click();
    await expect(card.getByTestId('order-status')).toHaveAttribute('data-status', 'cancelled');
    await expect(card).toContainText('cupón');

    // Laura lo ve cancelado y el cupón vuelve a quedar libre
    await laura.page.goto(`/app/pedidos/${orderId}`);
    await expect(laura.page.getByTestId('order-stopped')).toContainText('Pedido cancelado');
    await soporte.page.getByTestId('admin-tab-cupones').click();
    await expect(soporte.page.getByTestId('admin-coupon').filter({ hasText: code })).toContainText('Usado 0 veces');

    for (const c of [laura.context, soporte.context]) await c.close();
  });

  test('las direcciones usadas aparecen en el carrito y se les pone nombre', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const headers = await auth(laura.page);
    const [rice] = await (await laura.page.request.get('/api/services/mercado/products?q=arroz', { headers })).json();
    const line = `Calle Las Flores ${Date.now() % 1000}, Surco`;
    const created = await laura.page.request.post('/api/services/mercado/orders', { headers, data: { items: [{ productId: rice.id, quantity: 1 }], address: { line, reference: 'Reja negra' } } });
    expect(created.ok()).toBe(true);
    const order = await created.json();
    await laura.page.request.post(`/api/orders/${order.id}/cancel`, { headers });

    await laura.page.goto(`/app/pedidos/${order.id}`);
    await laura.page.getByTestId('reorder').click();
    await expect(laura.page).toHaveURL(/\/carrito$/);
    const chips = laura.page.getByTestId('saved-addresses');
    await expect(chips.getByRole('button', { name: new RegExp(line) })).toHaveAttribute('aria-pressed', 'true');
    await laura.page.getByRole('button', { name: 'Editar mis direcciones' }).click();
    const item = laura.page.getByTestId('saved-address').filter({ hasText: line });
    await item.getByRole('radio', { name: 'Trabajo' }).click();
    await expect(item.getByRole('radio', { name: 'Trabajo' })).toHaveAttribute('aria-checked', 'true');
    await laura.page.getByRole('button', { name: 'Listo', exact: true }).click();
    await expect(chips.getByRole('button', { name: new RegExp(`Trabajo.*${line}`) })).toBeVisible();
    await laura.context.close();
  });
});
