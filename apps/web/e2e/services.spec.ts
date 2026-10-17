import { expect, test } from '@playwright/test';
import { openSession } from './helpers';

const soles = (text: string | null) => Math.round(Number((text ?? '').replace(/[^\d.]/g, '')) * 100);

test.describe('Servicios: mercado, pago con QR y delivery', () => {
  test('Laura pide azúcar y arroz, el total suma productos + delivery, paga con el QR y sigue el delivery hasta la puerta', async ({ browser }) => {
    test.setTimeout(150_000);
    const laura = await openSession(browser, 'laura');
    const page = laura.page;

    await page.goto('/app/servicios');
    await expect(page.getByRole('heading', { name: 'Servicios' })).toBeVisible();
    await expect(page.getByTestId('service-mercado')).toBeVisible();
    await expect(page.getByText('Próximamente')).toHaveCount(1); // Salud, aún no disponible
    await page.getByTestId('service-mercado').click();

    // Se escribe como se habla: «un kilo de azúcar, arroz»
    await page.getByLabel('Buscar productos').fill('un kilo de azúcar, arroz');
    await page.getByRole('button', { name: 'Buscar' }).click();
    const sugar = page.getByRole('region', { name: 'Resultados para azúcar' });
    const rice = page.getByRole('region', { name: 'Resultados para arroz' });
    await expect(sugar.getByTestId('product').first()).toBeVisible();
    await expect(rice.getByTestId('product').first()).toBeVisible();

    const sugarCard = sugar.getByTestId('product').first();
    const sugarName = (await sugarCard.getByRole('heading').textContent())!;
    await sugarCard.getByRole('button', { name: /^Agregar/ }).click();
    await sugarCard.getByRole('button', { name: /^Agregar otro/ }).click();
    await rice.getByTestId('product').first().getByRole('button', { name: /^Agregar/ }).click();
    await expect(page.getByTestId('cart-bar')).toContainText('3');
    await page.getByTestId('cart-bar').click();

    // Carrito: la dirección dispara la cotización del gateway (tienda + delivery)
    await expect(page.getByTestId('cart-line')).toHaveCount(2);
    await page.getByLabel('Dirección', { exact: true }).fill('Av. Larco 123, Miraflores');
    await page.getByLabel('Referencia').fill('Puerta verde');
    const quote = page.getByTestId('quote');
    await expect(quote.getByText('Total a pagar')).toBeVisible({ timeout: 15_000 });
    const rows = quote.locator('div.flex.items-center.justify-between');
    const productsCents = soles(await rows.filter({ hasText: 'Productos' }).locator('span').last().textContent());
    const deliveryCents = soles(await rows.filter({ hasText: 'Delivery' }).locator('span').last().textContent());
    const totalCents = soles(await rows.filter({ hasText: 'Total a pagar' }).locator('span').last().textContent());
    expect(deliveryCents).toBeGreaterThan(0);
    expect(totalCents).toBe(productsCents + deliveryCents);

    await page.getByRole('button', { name: /Pagar S\/ [\d.]+ con QR/ }).click();

    // Pedido creado: QR para pagar con la billetera
    await expect(page).toHaveURL(/\/app\/pedidos\/ord_/);
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'pending_payment');
    await expect(page.getByRole('img', { name: /Código QR para pagar/ })).toBeVisible();
    await expect(page.getByText(`2× ${sugarName}`)).toBeVisible();

    // Se paga en PagaYa (simula la app del banco que abre el QR)
    const [wallet] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('pay-link').click()]);
    await expect(wallet.getByText(`S/ ${(totalCents / 100).toFixed(2)}`).first()).toBeVisible();
    await wallet.getByRole('button', { name: /^Pagar S\// }).click();
    await expect(wallet.getByText('Pago realizado')).toBeVisible();
    await wallet.close();

    // Sin recargar: el pago llega por webhook al gateway, que despacha el delivery; Parla avisa en vivo
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', /searching_driver|on_the_way|delivered/, { timeout: 20_000 });
    await expect(page.getByTestId('delivery-card')).toBeVisible();
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'on_the_way', { timeout: 30_000 }).catch(() => undefined);
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'delivered', { timeout: 40_000 });
    await expect(page.getByTestId('delivery-card')).toContainText(/¡Entregado( por .+)?!/);

    // Queda en «Mis pedidos»
    await page.goto('/app/pedidos');
    await expect(page.getByTestId('order-item').first()).toContainText(`S/ ${(totalCents / 100).toFixed(2)}`);
    await expect(page.getByTestId('order-item').first().getByTestId('order-status')).toHaveAttribute('data-status', 'delivered');

    expect(laura.consoleErrors).toEqual([]);
    await laura.context.close();
  });

  test('el gateway cobra con los precios de la tienda, no con los que mande el navegador', async ({ browser }) => {
    const laura = await openSession(browser, 'andres');
    const token = await laura.page.evaluate(() => localStorage.getItem('parla.token'));
    const headers = { authorization: `Bearer ${token}` };
    const products = await (await laura.page.request.get('/api/services/mercado/products?q=arroz', { headers })).json();
    const rice = products[0];

    const response = await laura.page.request.post('/api/services/mercado/quote', {
      headers,
      data: {
        items: [{ productId: rice.id, quantity: 2, priceCents: 1 }],
        address: { line: 'Jr. Unión 456, Lima', reference: '' },
        totalCents: 1,
      },
    });
    expect(response.ok()).toBe(true);
    const quote = await response.json();
    expect(quote.lines[0]).toMatchObject({ productId: rice.id, quantity: 2, unitPriceCents: rice.priceCents, totalCents: rice.priceCents * 2 });
    expect(quote.totalCents).toBe(quote.subtotalCents + quote.deliveryFeeCents);

    // Sin sesión no hay servicios, y las rutas internas no existen hacia fuera
    expect((await laura.page.request.get('/api/services')).status()).toBe(401);
    expect((await laura.page.request.get('/api/internal/orders/ord_x')).status()).toBe(404);
    await laura.context.close();
  });
});
