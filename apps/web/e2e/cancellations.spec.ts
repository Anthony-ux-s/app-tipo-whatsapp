import { expect, test, type Page } from '@playwright/test';
import { openSession } from './helpers';

/** Arma un pedido por la API del gateway (como lo haría el carrito) y devuelve su id y el link de pago. */
async function placeOrder(page: Page): Promise<{ id: string; payUrl: string }> {
  const token = await page.evaluate(() => localStorage.getItem('parla.token'));
  const headers = { authorization: `Bearer ${token}` };
  const [rice] = await (await page.request.get('/api/services/mercado/products?q=arroz', { headers })).json();
  const response = await page.request.post('/api/services/mercado/orders', {
    headers,
    data: { items: [{ productId: rice.id, quantity: 1 }], address: { line: 'Jr. Unión 456, Lima', reference: '' } },
  });
  expect(response.ok()).toBe(true);
  const order = await response.json();
  return { id: order.id, payUrl: order.payment.payUrl };
}

async function pay(page: Page, payUrl: string) {
  const response = await page.request.post(payUrl, { headers: { accept: 'application/json' } });
  expect(response.ok()).toBe(true);
}

test.describe('Cancelar, devolver y cambiar de repartidor', () => {
  test('sin pagar, cancelar anula el QR; ya pagado, cancelar devuelve el pago', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const page = laura.page;

    const unpaid = await placeOrder(page);
    await page.goto(`/app/pedidos/${unpaid.id}`);
    await page.getByTestId('cancel-order').click();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'cancelled');
    await expect(page.getByTestId('refund')).toHaveText('No se te cobró nada.');
    // El QR ya no sirve para pagar
    const wallet = await page.context().newPage();
    await wallet.goto(unpaid.payUrl);
    await expect(wallet.getByText('Este cobro fue anulado')).toBeVisible();
    await wallet.close();

    const paid = await placeOrder(page);
    await pay(page, paid.payUrl);
    await page.goto(`/app/pedidos/${paid.id}`);
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'paid', { timeout: 15_000 });
    await page.getByTestId('cancel-order').click();
    await page.getByTestId('confirm-cancel').click();
    await expect(page.getByTestId('order-status')).toHaveAttribute('data-status', 'cancelled');
    await expect(page.getByTestId('refund')).toContainText('Te devolvimos');
    await expect(page.getByTestId('order-timeline')).toContainText('Cancelado por el cliente · pago devuelto');

    expect(laura.consoleErrors).toEqual([]);
    await laura.context.close();
  });

  test('el repartidor suelta el pedido, la tienda pide otro y al final lo cancela con devolución', async ({ browser }) => {
    const laura = await openSession(browser, 'laura');
    const { id, payUrl } = await placeOrder(laura.page);
    await pay(laura.page, payUrl);

    const elena = await openSession(browser, 'tienda');
    await elena.page.goto(`/app/negocio/pedidos/${id}`);
    await elena.page.getByTestId('accept-order').click();
    await elena.page.getByTestId('ready-order').click();
    await expect(elena.page.getByTestId('order-status')).toHaveAttribute('data-status', 'searching_driver');

    // Carlos lo toma y lo suelta: vuelve a ofrecerse y Lucía lo toma
    const carlos = await openSession(browser, 'repartidor');
    await carlos.page.goto(`/app/rapidito/pedidos/${id}`);
    await carlos.page.getByTestId('take-order').click();
    await expect(carlos.page.getByTestId('order-status')).toHaveAttribute('data-status', 'driver_assigned');
    await carlos.page.getByTestId('release-order').click();
    await expect(carlos.page).toHaveURL(/\/app\/rapidito$/);

    const lucia = await openSession(browser, 'repartidora');
    await lucia.page.goto(`/app/rapidito/pedidos/${id}`);
    await lucia.page.getByTestId('take-order').click();
    await expect(lucia.page.getByTestId('order-status')).toHaveAttribute('data-status', 'driver_assigned');

    // Laura ve a Lucía y la hora estimada
    await laura.page.goto(`/app/pedidos/${id}`);
    await expect(laura.page.getByTestId('delivery-card')).toContainText('Lucía Ramos');
    await expect(laura.page.getByTestId('eta')).toContainText('Llega aprox. a las');

    // Lucía no llega: la tienda pide otro y el pedido vuelve a «Para recoger»
    await elena.page.reload();
    await elena.page.getByTestId('reassign-order').click();
    await expect(elena.page.getByTestId('order-status')).toHaveAttribute('data-status', 'searching_driver');
    await expect(elena.page.getByTestId('order-timeline')).toContainText('Lucía Ramos no llegó');

    // La tienda cancela: Laura recibe la devolución
    await elena.page.getByTestId('business-cancel').click();
    await elena.page.getByTestId('confirm-business-cancel').click();
    await expect(elena.page.getByTestId('order-status')).toHaveAttribute('data-status', 'cancelled');
    await expect(elena.page.getByTestId('refund')).toContainText('Se le devolvieron');
    await expect(laura.page.getByTestId('order-status')).toHaveAttribute('data-status', 'cancelled', { timeout: 15_000 });
    await expect(laura.page.getByTestId('refund')).toContainText('Te devolvimos');

    for (const s of [laura, elena, carlos, lucia]) {
      expect(s.consoleErrors).toEqual([]);
      await s.context.close();
    }
  });
});
