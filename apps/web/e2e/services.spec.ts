import { expect, test } from '@playwright/test';
import { openSession, unique } from './helpers';

const soles = (text: string | null) => Math.round(Number((text ?? '').replace(/[^\d.]/g, '')) * 100);

test.describe('Servicios: mercado, pago con QR, el negocio y delivery Rapidito', () => {
  test('Laura paga con QR, la tienda acepta y le escribe, Carlos de Rapidito lo recoge y lo entrega con el código de Laura', async ({ browser }) => {
    test.setTimeout(200_000);
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

    // Sin recargar: el pago llega por webhook al gateway y el pedido pasa al negocio
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'paid', { timeout: 20_000 });
    await expect(page.getByTestId('business-card')).toContainText('Bodega MercaYa está revisando tu pedido');

    // Elena, dueña de la tienda, lo ve en «Mi negocio» y lo acepta
    const elena = await openSession(browser, 'tienda');
    await elena.page.goto('/app/pedidos');
    await elena.page.getByTestId('my-business').click();
    await expect(elena.page.getByRole('heading', { name: 'Mi negocio' })).toBeVisible();
    await elena.page.getByTestId('business-order-item').filter({ hasText: 'Laura Méndez' }).first().click();
    await expect(elena.page.getByRole('region', { name: 'Productos' }).getByText(`2× ${sugarName}`)).toBeVisible();
    await elena.page.getByTestId('accept-order').click();
    await expect(elena.page.getByTestId('order-status')).toHaveAttribute('data-status', 'preparing');
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'preparing', { timeout: 15_000 });
    const elenaOrderUrl = elena.page.url();

    // Chat del pedido en los dos sentidos: Elena le escribe a Laura y Laura le responde desde su pedido
    const question = unique('¿El arroz puede ser de otra marca?');
    const answer = unique('Sí, no hay problema');
    await elena.page.getByTestId('chat-customer').click();
    await expect(elena.page.getByTestId('conversation-title')).toHaveText('Laura Méndez');
    await elena.page.getByLabel('Escribe un mensaje').fill(question);
    await elena.page.getByLabel('Escribe un mensaje').press('Enter');
    const orderUrl = page.url();
    await page.getByTestId('chat-business').click();
    await expect(page.getByTestId('conversation-title')).toHaveText('Elena Condori');
    await expect(page.getByTestId('message').filter({ hasText: question })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Escribe un mensaje').fill(answer);
    await page.getByLabel('Escribe un mensaje').press('Enter');
    await expect(elena.page.getByTestId('message').filter({ hasText: answer })).toBeVisible({ timeout: 15_000 });

    // Listo: Elena llama a Rapidito y el pedido se ofrece a los repartidores
    await elena.page.goto(elenaOrderUrl);
    await elena.page.getByTestId('ready-order').click();
    await expect(elena.page.getByTestId('order-status')).toHaveAttribute('data-status', 'searching_driver');

    // Carlos, repartidor de Rapidito, lo ve en «Para recoger» (con lo que gana) y lo toma
    const carlos = await openSession(browser, 'repartidor');
    await carlos.page.goto('/app/pedidos');
    await carlos.page.getByTestId('my-rapidito').click();
    await expect(carlos.page.getByRole('heading', { name: 'Rapidito' })).toBeVisible();
    const offer = carlos.page.getByTestId('driver-order-item').filter({ hasText: 'Laura · Av. Larco 123' }).last();
    await expect(offer).toContainText(`Ganas S/ ${(deliveryCents / 100).toFixed(2)}`);
    await offer.click();
    await carlos.page.getByTestId('take-order').click();
    await expect(carlos.page.getByTestId('order-status')).toHaveAttribute('data-status', 'driver_assigned');

    // Laura ve a su repartidor y su código de entrega; la tienda ve que Carlos va por el pedido
    await page.goto(orderUrl);
    await expect(page.getByTestId('delivery-card')).toContainText('Carlos Huamán va a recoger tu pedido');
    const code = (await page.getByTestId('delivery-code').textContent())!.trim();
    expect(code).toMatch(/^\d{4}$/);
    await elena.page.goto(elenaOrderUrl);
    await expect(elena.page.getByTestId('business-delivery')).toContainText('Carlos Huamán');
    await expect(elena.page.getByText(code)).toHaveCount(0); // el código es solo del cliente

    // La tienda le entrega el pedido a Carlos: recién ahí va en camino
    await elena.page.getByTestId('handoff-order').click();
    await expect(elena.page.getByTestId('order-status')).toHaveAttribute('data-status', 'on_the_way');
    await expect(carlos.page.getByTestId('order-status')).toHaveAttribute('data-status', 'on_the_way', { timeout: 15_000 });

    // Un código equivocado no entrega; con el de Laura, sí
    await carlos.page.getByLabel('Código de entrega').fill(code === '0000' ? '1111' : '0000');
    await carlos.page.getByTestId('deliver-order').click();
    await expect(carlos.page.getByRole('alert')).toContainText('Código incorrecto');
    await carlos.page.getByLabel('Código de entrega').fill(code);
    await carlos.page.getByTestId('deliver-order').click();
    await expect(carlos.page.getByTestId('delivery-proof')).toBeVisible();

    // Todos lo ven entregado en vivo; la tienda, con la constancia del código
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'delivered', { timeout: 15_000 });
    await expect(page.getByTestId('delivery-card')).toContainText('¡Entregado por Carlos Huamán!');
    await expect(elena.page.getByTestId('delivery-proof')).toContainText('Confirmado con el código del cliente', { timeout: 15_000 });
    await expect(elena.page.getByTestId('order-timeline')).toContainText('Recogido en la tienda');
    expect(elena.consoleErrors).toEqual([]);
    // El único error esperado es el 400 del código equivocado que se probó a propósito.
    expect(carlos.consoleErrors.filter((e) => !e.includes('status of 400'))).toEqual([]);
    await elena.context.close();
    await carlos.context.close();

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
